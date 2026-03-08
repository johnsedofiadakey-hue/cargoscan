// EdgeDetector.swift
// CargoScan — Camera-Based Edge Detection for Hybrid L/W Measurement
//
// PIPELINE:
//  Step 1  Convert ARFrame camera image (YUV) → grayscale pixel buffer
//  Step 2  Crop to the LiDAR-derived object bounding region (avoids background noise)
//  Step 3  Apply vImage Sobel-3x3 gradient → edge magnitude image
//  Step 4  Threshold → binary edge map
//  Step 5  Hough line accumulation (r, θ) → find dominant lines
//  Step 6  Cluster lines by angle → 2 dominant perpendicular line families
//  Step 7  Find 4 corner intersections of the two line families
//  Step 8  ARKit raycast each corner pixel → 3D world point on top plane
//  Step 9  Distance between opposite corners → real L and W in cm
//  Step 10 Return EdgeMeasurement with L, W, corner screen points, confidence
//
// This module is the "camera edge detection" leg of the hybrid pipeline.
// The LiDAR leg (floor plane, height, top plane) lives in MeasurementEngine.swift.
// Both results are fused in ARScannerViewModel.runMeasurementFrame().

import Foundation
import ARKit
import Accelerate   // vImage
import simd
import UIKit

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - Output type
// ─────────────────────────────────────────────────────────────────────────────

/// Result returned by EdgeDetector.detect(…)
struct EdgeMeasurement {
    /// Detected length and width in centimetres from camera edges + raycasting
    var length: Float           // cm, longer axis
    var width:  Float           // cm, shorter axis
    /// Confidence: 0–1, based on line quality and variance
    var confidence: Float
    /// 4 corner points in screen space (for outline overlay)
    var screenCorners: [CGPoint]
    /// 4 corner points in world space (for cross-checking with LiDAR)
    var worldCorners: [simd_float3]
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - Hough line type
// ─────────────────────────────────────────────────────────────────────────────

private struct HoughLine {
    var r:      Float   // distance from image centre in pixels
    var theta:  Float   // angle in radians (0 = horizontal)
    var votes:  Int
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - Edge detector
// ─────────────────────────────────────────────────────────────────────────────

struct EdgeDetector {

    // ── Configuration ────────────────────────────────────────────────────────
    struct Config {
        /// Fraction of the max gradient used as the binarisation threshold
        var edgeThresholdFraction: Float = 0.18
        /// Number of angle buckets in the Hough accumulator (resolution ≈ 180/bins °)
        var houghThetaBins: Int = 180
        /// Number of distance buckets in the Hough accumulator
        var houghRBins: Int = 400
        /// Minimum Hough votes for a line to be considered real
        var houghMinVotes: Int = 12
        /// Angular tolerance (radians) for grouping lines into families
        var lineClusterTolerance: Float = 0.22   // ≈ 12.5°
        /// How far (pixels) a reprojected corner can be from the convex hull centre
        var maxCornerOutlierPx: Float = 800
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MARK: - Main entry point
    // ─────────────────────────────────────────────────────────────────────────

    /// Detect box edges in the camera frame, convert corners to world 3D,
    /// and return length + width in centimetres.
    ///
    /// - Parameters:
    ///   - frame:          The current ARFrame (provides camera image + intrinsics + transform)
    ///   - topPlane:       The RANSAC-fitted top surface plane (from LiDAR)
    ///   - objectScreenBB: Bounding box in screen space of the LiDAR-detected cluster
    ///                     (optional — if nil, uses the full image)
    ///   - arView:         The ARView (needed for raycasting)
    ///   - config:         Tuning parameters
    /// - Returns: EdgeMeasurement or nil if detection failed
    static func detect(frame: ARFrame,
                       topPlane: Plane3D,
                       objectScreenBB: CGRect?,
                       arView: ARView,
                       config: Config = Config()) -> EdgeMeasurement? {

        // ── Step 1: Grayscale pixel buffer from camera image ──────────────────
        guard let gray = grayscaleBuffer(from: frame.capturedImage) else { return nil }

        let imgW = CVPixelBufferGetWidth(frame.capturedImage)
        let imgH = CVPixelBufferGetHeight(frame.capturedImage)

        // ── Step 2: Crop region (object bounding box or full image) ───────────
        // Convert screen-space BB → image-space BB (camera and screen may differ)
        let cropRect = imageCropRect(
            from: objectScreenBB,
            imageSize: CGSize(width: imgW, height: imgH),
            screenSize: arView.frame.size
        )

        // ── Step 3–4: Sobel gradient → binary edge map ────────────────────────
        guard let edges = sobelEdges(gray: gray,
                                      cropRect: cropRect,
                                      thresholdFraction: config.edgeThresholdFraction)
        else { return nil }

        let cropW = Int(cropRect.width)
        let cropH = Int(cropRect.height)

        // ── Step 5: Hough line accumulation ───────────────────────────────────
        let lines = houghLines(edges: edges,
                               width: cropW, height: cropH,
                               thetaBins: config.houghThetaBins,
                               rBins: config.houghRBins,
                               minVotes: config.houghMinVotes)

        guard lines.count >= 2 else { return nil }

        // ── Step 6: Cluster lines into 2 perpendicular families ───────────────
        guard let (familyA, familyB) = clusterIntoPerpFamilies(
                lines: lines, tolerance: config.lineClusterTolerance)
        else { return nil }

        // Representative line per family (highest votes)
        let lineA = familyA.max(by: { $0.votes < $1.votes })!
        let lineB = familyB.max(by: { $0.votes < $1.votes })!

        // ── Step 7: Find 4 corner intersections ───────────────────────────────
        // Use 2 lines from each family (best + second-best or mirrored)
        let linesA = Array(familyA.sorted(by: { $0.votes > $1.votes }).prefix(2))
        let linesB = Array(familyB.sorted(by: { $0.votes > $1.votes }).prefix(2))

        var screenCornersInCrop: [CGPoint] = []
        for la in linesA {
            for lb in linesB {
                if let pt = lineIntersection(la, lb) {
                    // Filter points outside the crop rect with some margin
                    let margin: CGFloat = 40
                    if pt.x > -margin && pt.x < CGFloat(cropW) + margin &&
                       pt.y > -margin && pt.y < CGFloat(cropH) + margin {
                        screenCornersInCrop.append(pt)
                    }
                }
            }
        }

        guard screenCornersInCrop.count == 4 else { return nil }

        // Convert back to full image coordinates, then to screen coordinates
        let screenCorners: [CGPoint] = screenCornersInCrop.map { pt in
            let imgX = pt.x + cropRect.minX
            let imgY = pt.y + cropRect.minY
            return imageToScreen(CGPoint(x: imgX, y: imgY),
                                 imageSize: CGSize(width: imgW, height: imgH),
                                 screenSize: arView.frame.size)
        }

        // ── Step 8: ARKit raycast each corner to the top plane ────────────────
        var worldCorners: [simd_float3] = []
        for sc in screenCorners {
            // Try existing plane geometry first (more accurate), then estimated
            let w: simd_float3?
            if let hit = arView.raycast(from: sc,
                                         allowing: .existingPlaneGeometry,
                                         alignment: .horizontal).first {
                let c = hit.worldTransform.columns.3
                w = simd_float3(c.x, c.y, c.z)
            } else if let hit = arView.raycast(from: sc,
                                                allowing: .estimatedPlane,
                                                alignment: .any).first {
                let c = hit.worldTransform.columns.3
                w = simd_float3(c.x, c.y, c.z)
            } else {
                // Raycast failed for this corner — fall back to projecting onto top plane
                w = depthRayToPlane(screenPoint: sc, frame: frame,
                                     plane: topPlane, arView: arView)
            }
            if let wp = w { worldCorners.append(wp) }
        }

        guard worldCorners.count == 4 else { return nil }

        // ── Step 9: L and W from world corner distances ───────────────────────
        // Average opposite sides for noise robustness
        let s0 = simd_length(worldCorners[1] - worldCorners[0]) * 100   // cm
        let s1 = simd_length(worldCorners[2] - worldCorners[1]) * 100
        let s2 = simd_length(worldCorners[3] - worldCorners[2]) * 100
        let s3 = simd_length(worldCorners[0] - worldCorners[3]) * 100

        let dimA = (s0 + s2) / 2
        let dimB = (s1 + s3) / 2

        // Basic sanity check
        let longSide  = max(dimA, dimB)
        let shortSide = min(dimA, dimB)
        guard longSide  >= 15, longSide  <= 600,
              shortSide >= 10, shortSide <= 600,
              shortSide / longSide > 0.05   // not wildly elongated
        else { return nil }

        // ── Step 10: Confidence from line vote quality + parallelism ──────────
        let totalVotesA = linesA.map(\.votes).reduce(0, +)
        let totalVotesB = linesB.map(\.votes).reduce(0, +)
        let maxVotes    = max(totalVotesA, totalVotesB)
        let voteConf    = min(Float(min(totalVotesA, totalVotesB)) / Float(maxVotes), 1.0)

        // Perpendicularity check: families should be ~90° apart
        let angDiff = abs(lineA.theta - lineB.theta)
        let perpDiff = abs(angDiff - .pi / 2)
        let perpConf: Float = perpDiff < 0.3 ? 1.0 : max(0, 1 - perpDiff / 0.5)

        let conf = (voteConf * 0.5 + perpConf * 0.5) * 0.95

        return EdgeMeasurement(
            length:        longSide,
            width:         shortSide,
            confidence:    conf,
            screenCorners: screenCorners,
            worldCorners:  worldCorners
        )
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MARK: - Step 1: Grayscale conversion
    // ─────────────────────────────────────────────────────────────────────────

    private static func grayscaleBuffer(from src: CVPixelBuffer) -> CVPixelBuffer? {
        let w = CVPixelBufferGetWidth(src)
        let h = CVPixelBufferGetHeight(src)

        // ARKit capturedImage is kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
        // The Y plane (plane 0) IS the grayscale image — no conversion needed
        CVPixelBufferLockBaseAddress(src, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(src, .readOnly) }

        // Extract Y plane directly
        guard CVPixelBufferGetPlaneCount(src) >= 1 else {
            return nil
        }

        // Create a new pixel buffer from the Y plane
        var grayBuf: CVPixelBuffer?
        let attrs: [String: Any] = [
            kCVPixelBufferCGImageCompatibilityKey as String: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey as String: true
        ]
        let status = CVPixelBufferCreate(nil, w, h,
                                          kCVPixelFormatType_OneComponent8,
                                          attrs as CFDictionary, &grayBuf)
        guard status == kCVReturnSuccess, let dst = grayBuf else { return nil }

        CVPixelBufferLockBaseAddress(dst, [])
        defer { CVPixelBufferUnlockBaseAddress(dst, []) }

        guard let srcBase = CVPixelBufferGetBaseAddressOfPlane(src, 0),
              let dstBase = CVPixelBufferGetBaseAddress(dst) else { return nil }

        let srcStride = CVPixelBufferGetBytesPerRowOfPlane(src, 0)
        let dstStride = CVPixelBufferGetBytesPerRow(dst)

        // Copy row-by-row (strides may differ)
        for row in 0 ..< h {
            memcpy(dstBase.advanced(by: row * dstStride),
                   srcBase.advanced(by: row * srcStride),
                   min(srcStride, dstStride))
        }
        return dst
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MARK: - Steps 3–4: Sobel gradient → binary edge map
    // ─────────────────────────────────────────────────────────────────────────

    /// Returns a flat UInt8 array (values 0 or 255) of size cropW × cropH.
    private static func sobelEdges(gray: CVPixelBuffer,
                                    cropRect: CGRect,
                                    thresholdFraction: Float) -> [UInt8]? {
        let imgW = CVPixelBufferGetWidth(gray)
        let imgH = CVPixelBufferGetHeight(gray)

        CVPixelBufferLockBaseAddress(gray, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(gray, .readOnly) }

        guard let srcBase = CVPixelBufferGetBaseAddress(gray) else { return nil }
        let srcStride = CVPixelBufferGetBytesPerRow(gray)

        let cx = Int(cropRect.minX.clamped(to: 0 ... CGFloat(imgW - 1)))
        let cy = Int(cropRect.minY.clamped(to: 0 ... CGFloat(imgH - 1)))
        let cw = min(Int(cropRect.width),  imgW - cx)
        let ch = min(Int(cropRect.height), imgH - cy)
        guard cw > 4, ch > 4 else { return nil }

        // Downscale 2× before Sobel to reduce noise and speed up Hough
        let dw = cw / 2, dh = ch / 2
        var down = [Float](repeating: 0, count: dw * dh)

        for r in 0 ..< dh {
            for c in 0 ..< dw {
                let srcR = cy + r * 2
                let srcC = cx + c * 2
                let v = Float(srcBase.advanced(by: srcR * srcStride + srcC)
                              .assumingMemoryBound(to: UInt8.self).pointee)
                down[r * dw + c] = v
            }
        }

        // Sobel 3×3
        var gx = [Float](repeating: 0, count: dw * dh)
        var gy = [Float](repeating: 0, count: dw * dh)
        var mag = [Float](repeating: 0, count: dw * dh)

        for r in 1 ..< dh - 1 {
            for c in 1 ..< dw - 1 {
                let i = r * dw + c
                let tl = down[(r-1)*dw+(c-1)], tc = down[(r-1)*dw+c], tr = down[(r-1)*dw+(c+1)]
                let ml = down[  r  *dw+(c-1)],                         mr = down[  r  *dw+(c+1)]
                let bl = down[(r+1)*dw+(c-1)], bc = down[(r+1)*dw+c], br = down[(r+1)*dw+(c+1)]

                gx[i] = (tr + 2*mr + br) - (tl + 2*ml + bl)
                gy[i] = (bl + 2*bc + br) - (tl + 2*tc + tr)
                mag[i] = sqrt(gx[i]*gx[i] + gy[i]*gy[i])
            }
        }

        // Threshold
        let maxMag = mag.max() ?? 1
        let threshold = maxMag * thresholdFraction

        let edges = mag.map { $0 >= threshold ? UInt8(255) : UInt8(0) }
        return edges  // size = dw * dh — callers must use (cw/2, ch/2)
        // Note: this function returns a (dw×dh) map; the caller must account for
        // the 2× downscale when converting pixel coords back to image space.
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MARK: - Step 5: Hough line transform
    // ─────────────────────────────────────────────────────────────────────────

    private static func houghLines(edges: [UInt8],
                                    width: Int, height: Int,
                                    thetaBins: Int,
                                    rBins: Int,
                                    minVotes: Int) -> [HoughLine] {
        // After 2× downscale
        let dw = width / 2, dh = height / 2
        guard edges.count == dw * dh else { return [] }

        let diag = hypot(Float(dw), Float(dh))
        let rScale = Float(rBins) / (2 * diag)

        // Precompute cos/sin for all theta bins
        let thetas: [Float] = (0 ..< thetaBins).map {
            Float($0) * .pi / Float(thetaBins)
        }
        let cosT = thetas.map { Foundation.cos($0) }
        let sinT = thetas.map { Foundation.sin($0) }

        var acc = [Int](repeating: 0, count: thetaBins * rBins)

        for r in 0 ..< dh {
            for c in 0 ..< dw {
                guard edges[r * dw + c] == 255 else { continue }
                let xf = Float(c) - Float(dw) / 2
                let yf = Float(r) - Float(dh) / 2
                for t in 0 ..< thetaBins {
                    let rVal = xf * cosT[t] + yf * sinT[t]
                    let rIdx = Int((rVal + diag) * rScale)
                    if rIdx >= 0 && rIdx < rBins {
                        acc[t * rBins + rIdx] += 1
                    }
                }
            }
        }

        // Extract peaks (simple non-maximum suppression in a 5×5 window)
        var lines: [HoughLine] = []
        let suppress = 5
        for t in 0 ..< thetaBins {
            for ri in 0 ..< rBins {
                let v = acc[t * rBins + ri]
                guard v >= minVotes else { continue }

                var isMax = true
                outer: for dt in -suppress/2 ... suppress/2 {
                    for dr in -suppress/2 ... suppress/2 {
                        let nt = (t + dt + thetaBins) % thetaBins
                        let nr = ri + dr
                        if nr < 0 || nr >= rBins { continue }
                        if (dt != 0 || dr != 0) && acc[nt * rBins + nr] > v {
                            isMax = false; break outer
                        }
                    }
                }

                if isMax {
                    let rVal = (Float(ri) / rScale) - diag
                    lines.append(HoughLine(r: rVal, theta: thetas[t], votes: v))
                }
            }
        }

        return lines.sorted { $0.votes > $1.votes }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MARK: - Step 6: Cluster lines into two perpendicular families
    // ─────────────────────────────────────────────────────────────────────────

    private static func clusterIntoPerpFamilies(
        lines: [HoughLine],
        tolerance: Float
    ) -> ([HoughLine], [HoughLine])? {

        guard let anchor = lines.first else { return nil }

        var familyA: [HoughLine] = []
        var familyB: [HoughLine] = []

        for line in lines {
            let diff = abs(normaliseAngleDiff(line.theta - anchor.theta))
            if diff < tolerance {
                familyA.append(line)
            } else if abs(diff - .pi / 2) < tolerance {
                familyB.append(line)
            }
        }

        guard familyA.count >= 1 && familyB.count >= 1 else { return nil }
        return (familyA, familyB)
    }

    /// Normalise angle difference to (−π/2, π/2]
    private static func normaliseAngleDiff(_ d: Float) -> Float {
        var x = d
        while x >  .pi / 2 { x -= .pi }
        while x < -.pi / 2 { x += .pi }
        return x
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MARK: - Step 7: Line intersection (in downscaled crop coords)
    // ─────────────────────────────────────────────────────────────────────────

    /// Returns the intersection of two Hough lines (r, θ) in image coordinates.
    private static func lineIntersection(_ a: HoughLine, _ b: HoughLine) -> CGPoint? {
        // r = x·cos(θ) + y·sin(θ)
        // Solve 2×2 system:
        //   cos(a) · x + sin(a) · y = ra
        //   cos(b) · x + sin(b) · y = rb
        let ca = cos(a.theta), sa = sin(a.theta)
        let cb = cos(b.theta), sb = sin(b.theta)
        let det = ca * sb - sa * cb
        guard abs(det) > 1e-6 else { return nil }
        let x = (a.r * sb - b.r * sa) / det
        let y = (b.r * ca - a.r * cb) / det
        return CGPoint(x: Double(x), y: Double(y))
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MARK: - Step 8 helper: depth-based ray → plane intersection
    // ─────────────────────────────────────────────────────────────────────────

    /// Fall-back when ARKit raycast returns no hit: cast a ray from the camera
    /// through the screen pixel and find where it intersects the top plane.
    private static func depthRayToPlane(screenPoint: CGPoint,
                                         frame: ARFrame,
                                         plane: Plane3D,
                                         arView: ARView) -> simd_float3? {
        // Unproject screen → camera direction
        let intr = frame.camera.intrinsics
        let fx = intr[0][0], fy = intr[1][1]
        let cx = intr[2][0], cy = intr[2][1]

        // Screen → image: camera image is usually landscape, screen portrait
        // Use the camera's viewMatrix to transform properly
        let sW = Float(arView.frame.width)
        let sH = Float(arView.frame.height)

        // Normalised device coords
        let ndcX = (Float(screenPoint.x) / sW) * 2 - 1
        let ndcY = 1 - (Float(screenPoint.y) / sH) * 2

        // Ray direction in camera space
        let rayDir = simd_normalize(simd_float3(ndcX / fx, ndcY / fy, -1))

        // Transform to world space
        let camTransform = frame.camera.transform
        let worldDir = simd_float3(
            camTransform.columns.0.x * rayDir.x + camTransform.columns.1.x * rayDir.y + camTransform.columns.2.x * rayDir.z,
            camTransform.columns.0.y * rayDir.x + camTransform.columns.1.y * rayDir.y + camTransform.columns.2.y * rayDir.z,
            camTransform.columns.0.z * rayDir.x + camTransform.columns.1.z * rayDir.y + camTransform.columns.2.z * rayDir.z
        )
        let origin = simd_float3(camTransform.columns.3.x,
                                  camTransform.columns.3.y,
                                  camTransform.columns.3.z)

        // Ray-plane intersection: origin + t*dir where plane.signedDistance = 0
        let denom = simd_dot(plane.normal, worldDir)
        guard abs(denom) > 1e-6 else { return nil }
        let t = -plane.signedDistance(to: origin) / denom
        guard t > 0 else { return nil }
        return origin + worldDir * t
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MARK: - Coordinate utilities
    // ─────────────────────────────────────────────────────────────────────────

    /// Convert optional screen-space bounding box to image-space crop rect.
    /// Adds 10% padding to capture edge-adjacent pixels.
    private static func imageCropRect(from screenBB: CGRect?,
                                       imageSize: CGSize,
                                       screenSize: CGSize) -> CGRect {
        guard let bb = screenBB, !bb.isEmpty else {
            return CGRect(origin: .zero, size: imageSize)
        }

        let scaleX = imageSize.width  / screenSize.width
        let scaleY = imageSize.height / screenSize.height

        let pad: CGFloat = 0.10
        let expanded = bb.insetBy(dx: -bb.width * pad, dy: -bb.height * pad)

        let ix = max(0, expanded.minX * scaleX)
        let iy = max(0, expanded.minY * scaleY)
        let iw = min(imageSize.width  - ix, expanded.width  * scaleX)
        let ih = min(imageSize.height - iy, expanded.height * scaleY)

        return CGRect(x: ix, y: iy, width: max(iw, 10), height: max(ih, 10))
    }

    /// Convert image-space point → screen-space point.
    private static func imageToScreen(_ pt: CGPoint,
                                       imageSize: CGSize,
                                       screenSize: CGSize) -> CGPoint {
        CGPoint(
            x: pt.x / imageSize.width  * screenSize.width,
            y: pt.y / imageSize.height * screenSize.height
        )
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - Comparable clamping helper
// ─────────────────────────────────────────────────────────────────────────────

private extension Comparable {
    func clamped(to range: ClosedRange<Self>) -> Self {
        min(max(self, range.lowerBound), range.upperBound)
    }
}
