// MeasurementEngine.swift
// CargoScan — Production Hybrid Measurement Engine
//
// PIPELINE (no simulated / hardcoded values anywhere in this file):
//
//  Step 1  ARKit LiDAR sceneDepth/smoothedSceneDepth → world-space point cloud
//  Step 2  Floor plane locked from lowest ARPlaneAnchor, RANSAC-refined
//  Step 3  Filter: keep points 4 cm – 250 cm above floor  (object cluster)
//  Step 4  1-D height histogram → dominant connected object band
//  Step 5  Isolate top-surface band (uppermost 4 cm of dominant band)
//  Step 6  RANSAC iterative plane fit on top-surface points
//  Step 7  Height (cm) = |signed-distance from floor plane to top-plane centroid|
//  Step 8  Build local 2-D coordinate frame on top plane (right, forward axes)
//  Step 9  Project all object points onto top plane → 2-D point cloud
//  Step 10 Graham-scan convex hull of 2-D cloud
//  Step 11 Rotating-calipers minimum bounding rectangle → length + width (cm)
//  Step 12 15-frame rolling buffer + per-axis IQR outlier rejection
//  Step 13 Confidence score from point density, aspect ratio, and stability
//  Step 14 Minimum size threshold (5 cm per axis) rejects false detections

import Foundation
import ARKit
import simd

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - Core data types
// ─────────────────────────────────────────────────────────────────────────────

/// One raw frame measurement in centimetres (before averaging)
struct RawMeasurement {
    var length:     Float           // cm — longer horizontal axis
    var width:      Float           // cm — shorter horizontal axis
    var height:     Float           // cm — floor to top surface
    var confidence: Float           // 0 – 1
    var timestamp:  TimeInterval = 0
}

/// Final averaged, validated result surfaced to the UI
struct CargoDimensions {
    let length:     Float           // cm
    let width:      Float           // cm
    let height:     Float           // cm
    let confidence: Double          // 0 – 1

    /// Cubic metres
    var cbm: Float {
        (length * width * height) / 1_000_000.0
    }

    /// Sanity check: reject physically impossible results
    var isValid: Bool {
        length >= 5  && width >= 5  && height >= 5  &&
        length <= 500 && width <= 500 && height <= 300 &&
        width  <= length                               // length is always the longer axis
    }

    static var zero: CargoDimensions {
        CargoDimensions(length: 0, width: 0, height: 0, confidence: 0)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - Geometric plane (Hessian normal form)
// ─────────────────────────────────────────────────────────────────────────────

struct Plane3D {
    var point:  simd_float3     // any point lying on the plane
    var normal: simd_float3     // unit outward normal

    /// Signed distance: positive = same half-space as normal
    func signedDistance(to p: simd_float3) -> Float {
        simd_dot(normal, p - point)
    }

    /// Orthogonal projection of p onto the plane surface
    func project(_ p: simd_float3) -> simd_float3 {
        p - normal * signedDistance(to: p)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - RANSAC plane detector
// ─────────────────────────────────────────────────────────────────────────────

/// Robust plane fitting.  Handles noise, multi-surface point clouds, and
/// background clutter that would ruin a simple SVD-only fit.
struct RANSACPlaneDetector {

    struct Config {
        var iterations:      Int   = 100
        var inlierThreshold: Float = 0.012  // 1.2 cm tolerance
        var minInlierRatio:  Float = 0.28
    }

    /// Returns the best-fit plane, or nil if insufficient inliers.
    static func fit(points: [simd_float3],
                    config: Config = Config()) -> Plane3D? {
        guard points.count >= 6 else { return nil }

        var bestCount = 0
        var bestPlane: Plane3D?

        for _ in 0 ..< config.iterations {
            let (i0, i1, i2) = randomTriple(n: points.count)
            let p0 = points[i0], p1 = points[i1], p2 = points[i2]

            let cross = simd_cross(p1 - p0, p2 - p0)
            let len   = simd_length(cross)
            guard len > 1e-6 else { continue }

            let candidate = Plane3D(point: p0, normal: cross / len)
            let count = points.filter {
                abs(candidate.signedDistance(to: $0)) < config.inlierThreshold
            }.count

            if count > bestCount {
                bestCount = count
                bestPlane = candidate
            }
        }

        guard let rough = bestPlane,
              Float(bestCount) / Float(points.count) >= config.minInlierRatio
        else { return nil }

        // Refine: refit using only the inlier set (covariance eigenvector)
        let inliers = points.filter {
            abs(rough.signedDistance(to: $0)) < config.inlierThreshold
        }
        return refinePlane(from: inliers) ?? rough
    }

    // Covariance-based normal from an already-clean inlier set.
    // Power iteration finds the eigenvector corresponding to the
    // smallest eigenvalue = the plane normal direction.
    private static func refinePlane(from pts: [simd_float3]) -> Plane3D? {
        guard pts.count >= 3 else { return nil }
        let n   = Float(pts.count)
        let cen = pts.reduce(.zero, +) / n

        var cxx: Float = 0, cxy: Float = 0, cxz: Float = 0
        var cyy: Float = 0, cyz: Float = 0, czz: Float = 0
        for p in pts {
            let d = p - cen
            cxx += d.x * d.x;  cxy += d.x * d.y;  cxz += d.x * d.z
            cyy += d.y * d.y;  cyz += d.y * d.z;  czz += d.z * d.z
        }

        // Normalise by count so power iteration is scale-independent
        cxx /= n; cxy /= n; cxz /= n
        cyy /= n; cyz /= n; czz /= n

        var v = simd_float3(0, 1, 0)   // initial guess: upward
        for _ in 0 ..< 40 {
            // (I − C)·v  shifts mass away from large eigenvectors,
            // iteratively revealing the smallest one
            let r = simd_float3(
                v.x - (cxx * v.x + cxy * v.y + cxz * v.z),
                v.y - (cxy * v.x + cyy * v.y + cyz * v.z),
                v.z - (cxz * v.x + cyz * v.y + czz * v.z)
            )
            let rl = simd_length(r)
            guard rl > 1e-8 else { break }
            v = r / rl
        }
        if v.y < 0 { v = -v }          // make normal point upward
        return Plane3D(point: cen, normal: simd_normalize(v))
    }

    private static func randomTriple(n: Int) -> (Int, Int, Int) {
        var a = Int.random(in: 0 ..< n)
        var b = Int.random(in: 0 ..< n)
        var c = Int.random(in: 0 ..< n)
        while b == a           { b = Int.random(in: 0 ..< n) }
        while c == a || c == b { c = Int.random(in: 0 ..< n) }
        return (a, b, c)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - Point cloud utilities
// ─────────────────────────────────────────────────────────────────────────────

struct PointCloudUtils {

    /// Back-project every (stride)-th depth pixel into world space.
    ///
    /// Uses the camera intrinsic matrix (focal lengths fx/fy, principal point cx/cy)
    /// and the camera-to-world extrinsic transform from ARFrame.
    /// Prefers smoothedSceneDepth when available (lower noise on textured surfaces).
    static func worldPoints(from frame: ARFrame,
                             stride: Int = 4) -> [simd_float3] {

        let dm: CVPixelBuffer?
        if let s = frame.smoothedSceneDepth?.depthMap {
            dm = s
        } else {
            dm = frame.sceneDepth?.depthMap
        }
        guard let depthMap = dm else { return [] }

        let W = CVPixelBufferGetWidth(depthMap)
        let H = CVPixelBufferGetHeight(depthMap)

        CVPixelBufferLockBaseAddress(depthMap, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(depthMap, .readOnly) }

        guard let base = CVPixelBufferGetBaseAddress(depthMap) else { return [] }
        let ptr = base.assumingMemoryBound(to: Float32.self)

        // Column-major intrinsics:  intr[col][row]
        let intr = frame.camera.intrinsics
        let fx = intr[0][0], fy = intr[1][1]
        let cx = intr[2][0], cy = intr[2][1]

        let T = frame.camera.transform     // camera → world, 4×4

        var pts = [simd_float3]()
        pts.reserveCapacity((W / stride) * (H / stride))

        for row in Swift.stride(from: 0, to: H, by: stride) {
            for col in Swift.stride(from: 0, to: W, by: stride) {
                let z = ptr[row * W + col]
                guard z > 0.05, z < 6.0 else { continue }

                // Unproject: ARKit depth is z along the optical axis
                let xc = (Float(col) - cx) / fx * z
                let yc = (Float(row) - cy) / fy * z

                // Camera space → world space
                let cam4  = simd_float4(xc, yc, -z, 1)
                let world = T * cam4
                pts.append(simd_float3(world.x, world.y, world.z))
            }
        }
        return pts
    }

    /// Filter: keep points minH…maxH metres above the floor plane.
    static func aboveFloor(_ pts: [simd_float3],
                            floor: Plane3D,
                            minH: Float = 0.04,
                            maxH: Float = 2.5) -> [simd_float3] {
        pts.filter {
            let d = floor.signedDistance(to: $0)
            return d > minH && d < maxH
        }
    }

    /// 1-D height histogram finds the tallest continuous cluster above the floor.
    /// Returns (bottomM, topM) in metres, or nil if no object detected.
    static func dominantClusterBand(pts: [simd_float3],
                                     floor: Plane3D,
                                     bins: Int = 50) -> (lo: Float, hi: Float)? {
        let heights = pts.map { floor.signedDistance(to: $0) }.filter { $0 > 0.03 }
        guard let maxH = heights.max(), maxH > 0.04 else { return nil }

        let binW = maxH / Float(bins)
        var hist = [Int](repeating: 0, count: bins)
        for h in heights {
            let b = min(Int(h / binW), bins - 1)
            hist[b] += 1
        }

        // Find the longest run of non-empty bins (= dominant object)
        var bestStart = 0, bestLen = 0
        var curStart  = 0, curLen  = 0
        for i in 0 ..< bins {
            if hist[i] > 1 {
                curLen += 1
                if curLen > bestLen { bestLen = curLen; bestStart = curStart }
            } else {
                curStart = i + 1
                curLen   = 0
            }
        }
        guard bestLen > 0 else { return nil }
        return (lo: Float(bestStart) * binW,
                hi: Float(bestStart + bestLen) * binW)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - 2-D convex hull (Graham scan) + rotating-calipers MBR
// ─────────────────────────────────────────────────────────────────────────────

struct ConvexHull2D {

    /// Graham-scan convex hull in CCW order.
    static func compute(_ pts: [simd_float2]) -> [simd_float2] {
        guard pts.count >= 3 else { return pts }

        // Pivot = bottom-most, then left-most point
        var pivot = pts[0]
        for p in pts {
            if p.y < pivot.y || (p.y == pivot.y && p.x < pivot.x) { pivot = p }
        }

        let rest = pts
            .filter { $0 != pivot }
            .sorted {
                atan2($0.y - pivot.y, $0.x - pivot.x) <
                atan2($1.y - pivot.y, $1.x - pivot.x)
            }

        var hull: [simd_float2] = [pivot]
        for p in rest {
            while hull.count >= 2 {
                let o = hull[hull.count - 2]
                let a = hull[hull.count - 1]
                // Cross product: positive = left turn (keep), else pop
                if (a.x - o.x) * (p.y - o.y) - (a.y - o.y) * (p.x - o.x) > 0 {
                    break
                }
                hull.removeLast()
            }
            hull.append(p)
        }
        return hull
    }

    /// Rotating-calipers minimum area bounding rectangle.
    /// Returns (longerSide, shorterSide) in the same units as hull vertices.
    static func minBoundingRect(hull: [simd_float2]) -> (Float, Float) {
        guard hull.count >= 3 else { return (0, 0) }

        var bestArea = Float.greatestFiniteMagnitude
        var bestDims = (Float(0), Float(0))

        for i in 0 ..< hull.count {
            let a = hull[i]
            let b = hull[(i + 1) % hull.count]
            let edgeDir = simd_normalize(b - a)
            let perpDir = simd_float2(-edgeDir.y, edgeDir.x)

            var minE: Float = .greatestFiniteMagnitude, maxE: Float = -.greatestFiniteMagnitude
            var minP: Float = .greatestFiniteMagnitude, maxP: Float = -.greatestFiniteMagnitude

            for v in hull {
                let e = simd_dot(v, edgeDir)
                let p = simd_dot(v, perpDir)
                minE = min(minE, e);  maxE = max(maxE, e)
                minP = min(minP, p);  maxP = max(maxP, p)
            }

            let w = maxE - minE
            let h = maxP - minP
            let area = w * h
            if area < bestArea {
                bestArea = area
                bestDims = (max(w, h), min(w, h))
            }
        }
        return bestDims
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - Rolling measurement buffer with per-axis IQR outlier rejection
// ─────────────────────────────────────────────────────────────────────────────

final class MeasurementBuffer {
    private var buf:           [RawMeasurement] = []
    let capacity:               Int
    let minimumFramesRequired:  Int

    init(capacity: Int = 15, minimumFramesRequired: Int = 10) {
        self.capacity              = capacity
        self.minimumFramesRequired = minimumFramesRequired
    }

    func push(_ m: RawMeasurement) {
        buf.append(m)
        if buf.count > capacity { buf.removeFirst() }
    }

    var count:     Int    { buf.count }
    var isReady:   Bool   { buf.count >= minimumFramesRequired }
    var fillRatio: Double { Double(buf.count) / Double(minimumFramesRequired) }

    func reset() { buf.removeAll() }

    /// IQR-trimmed mean per axis.  Returns nil if buffer is not ready or
    /// if the result fails the validity check.
    func averaged() -> CargoDimensions? {
        guard buf.count >= minimumFramesRequired else { return nil }

        let avgL = iqrMean(buf.map(\.length))
        let avgW = iqrMean(buf.map(\.width))
        let avgH = iqrMean(buf.map(\.height))
        let avgC = Double(iqrMean(buf.map(\.confidence)))

        let dims = CargoDimensions(
            length:     max(avgL, avgW),   // guarantee L ≥ W
            width:      min(avgL, avgW),
            height:     avgH,
            confidence: min(avgC, 0.99)
        )
        return dims.isValid ? dims : nil
    }

    private func iqrMean(_ raw: [Float]) -> Float {
        let s = raw.sorted()
        guard s.count >= 4 else { return s.reduce(0, +) / Float(s.count) }
        let q1  = s[s.count / 4]
        let q3  = s[(s.count * 3) / 4]
        let iqr = q3 - q1
        let lo  = q1 - 1.5 * iqr
        let hi  = q3 + 1.5 * iqr
        let clean = s.filter { $0 >= lo && $0 <= hi }
        guard !clean.isEmpty else { return s.reduce(0, +) / Float(s.count) }
        return clean.reduce(0, +) / Float(clean.count)
    }
}
