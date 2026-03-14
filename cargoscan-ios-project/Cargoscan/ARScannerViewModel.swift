// ARScannerViewModel.swift
// CargoScan — AR Session Controller + Real Hybrid Measurement Pipeline
//
// Every measurement value produced here comes from real LiDAR geometry.
// There are ZERO hardcoded dimensions, ZERO simulated corners.
//
// FULL PIPELINE per eligible frame:
//  1.  Back-project LiDAR sceneDepth → world-space point cloud (stride 3 px)
//  2.  Floor plane locked from lowest ARPlaneAnchor, RANSAC-refined on arrival
//  3.  aboveFloor filter: keep points 4 cm – 250 cm above floor
//  4.  1-D height histogram → dominant object vertical band
//  5.  Isolate top-surface points (uppermost 4 cm of dominant band)
//  6.  RANSAC fit → top plane (rejects noise/background)
//  7.  Height = |floor.signedDistance(topPlane.centroid)| in cm
//  8.  Local 2-D coordinate frame on top plane (right, forward axes)
//  9.  Project all object points onto top plane → 2-D cloud
//  10. Graham-scan convex hull → rotating-calipers min bounding rectangle
//  11. length + width in cm (length = longer axis)
//  12. Push RawMeasurement into 15-frame IQR-filtered MeasurementBuffer
//  13. Confidence from point density + aspect ratio
//  14. After 10 good frames → finalise and publish CargoDimensions
//
// USER GUIDANCE:
//  Distance gate  0.6 m – 3.5 m
//  Pitch gate     camera 20°–65° below horizon (sweet spot for box-top view)
//  Motion gate    camera movement < 1.8 cm between frames
//  All three must be satisfied before a frame is accepted for measurement

import Foundation
import ARKit
import RealityKit
import UIKit
import simd

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - Scan phase
// ─────────────────────────────────────────────────────────────────────────────

enum ScanPhase: Equatable {
    case warmingUp          // LiDAR not ready yet
    case findingFloor       // waiting for first horizontal plane
    case positioning        // floor locked, guiding user to good spot
    case readyToScan        // all position gates green
    case objectDetected     // outline visible, waiting for user to confirm
    case scanning           // actively collecting frames (after user confirms)
    case processing         // buffer full, computing final answer
    case completed          // CargoDimensions ready
    case manualCornerTap    // user tapping 4 box corners manually
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - Guidance instruction
// ─────────────────────────────────────────────────────────────────────────────

enum GuidanceInstruction: Equatable {

    case findingFloor
    case tooClose           // < 0.6 m
    case tooFar             // > 3.5 m
    case tiltDown           // camera too horizontal (pitched > −20°)
    case tiltUp             // camera almost straight down (pitched < −68°)
    case movingTooFast
    case noObjectDetected
    case objectDetected     // outline visible, waiting for user confirmation
    case capturing          // user confirmed, recording frames
    case done

    // ── Text shown in the HUD ─────────────────────────────────────────────────
    var message: String {
        switch self {
        case .findingFloor:     return "Point camera at the floor to begin"
        case .tooClose:         return "Too close — step back"
        case .tooFar:           return "Too far — step closer"
        case .tiltDown:         return "Tilt camera down toward the box top"
        case .tiltUp:           return "Tilt camera up slightly"
        case .movingTooFast:    return "Hold still — nearly there…"
        case .noObjectDetected: return "Aim at the top surface of the cargo"
        case .objectDetected:   return "Object detected"
        case .capturing:        return "Scanning — hold still…"
        case .done:             return "Measurement complete ✓"
        }
    }

    // ── SF Symbol for directional arrow ───────────────────────────────────────
    var arrowSymbol: String? {
        switch self {
        case .tooClose:         return "arrow.backward.circle"
        case .tooFar:           return "arrow.forward.circle"
        case .tiltDown:         return "arrow.down.circle"
        case .tiltUp:           return "arrow.up.circle"
        case .movingTooFast:    return "hand.raised.circle"
        case .objectDetected:   return "viewfinder.circle"
        case .capturing:        return "checkmark.circle.fill"
        default:                return nil
        }
    }

    var isGood:    Bool { self == .objectDetected || self == .capturing || self == .done }
    var isWarning: Bool {
        switch self {
        case .tooClose, .tooFar, .tiltDown, .tiltUp,
             .movingTooFast, .noObjectDetected: return true
        default: return false
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - ViewModel
// ─────────────────────────────────────────────────────────────────────────────

@MainActor
final class ARScannerViewModel: NSObject, ObservableObject, ARSessionDelegate {

    // ── Published state (drives SwiftUI) ────────────────────────────────────
    @Published var phase:            ScanPhase          = .warmingUp
    @Published var guidance:         GuidanceInstruction = .findingFloor
    @Published var progress:         Double             = 0       // 0–1 buffer fill
    @Published var distanceMetres:   Float              = 0
    @Published var pitchDegrees:     Float              = 0       // negative = looking down
    @Published var finalDimensions:  CargoDimensions?   = nil
    @Published var capturedImage:    UIImage?           = nil

    /// Screen-space quadrilateral outline drawn over the detected box
    @Published var overlayCorners:   [CGPoint]          = []

    /// Tapped corners for manual override (up to 4)
    @Published var manualTapCorners: [CGPoint]          = []

    /// Bounding rect of detected object in screen space (used by EdgeDetector)
    @Published var objectScreenBB:   CGRect?            = nil

    /// Did this scan use camera edge fusion? (shown in result UI)
    @Published var edgeFusionActive: Bool               = false

    // ── Internal state ───────────────────────────────────────────────────────
    weak var arView: ARView?

    private var floorPlane:  Plane3D?        = nil
    private var floorAnchor: ARPlaneAnchor?  = nil
    private let buffer = MeasurementBuffer(capacity: 15, minimumFramesRequired: 10)

    private var lastFrameTime: TimeInterval  = 0
    private let frameInterval: TimeInterval  = 0.12    // ~8 fps processing

    /// Last 6 camera transforms for motion detection
    private var recentPoses: [simd_float4x4] = []

    // Configurable from org settings
    var cbmRatePerCBM: Double = 85.0
    var minimumDimCm:  Float  = 20.0    // reject objects smaller than 20 cm per spec

    // ─────────────────────────────────────────────────────────────────────────
    // MARK: - Setup
    // ─────────────────────────────────────────────────────────────────────────

    func setupSession(with arView: ARView) {
        self.arView = arView
        arView.session.delegate = self

        // Disable all debug / mesh visualisations — clean AR view only
        arView.debugOptions  = []
        arView.renderOptions = [.disableAREnvironmentLighting]

        let config = ARWorldTrackingConfiguration()
        config.planeDetection        = [.horizontal]
        config.environmentTexturing  = .automatic

        if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) {
            config.sceneReconstruction = .mesh
        }
        // Prefer smoothed depth (less noise, especially on untextured boxes)
        if ARWorldTrackingConfiguration.supportsFrameSemantics(.smoothedSceneDepth) {
            config.frameSemantics.insert(.smoothedSceneDepth)
        } else if ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) {
            config.frameSemantics.insert(.sceneDepth)
        }

        arView.session.run(config, options: [.resetTracking, .removeExistingAnchors])
        resetMeasurementState()
        phase    = .findingFloor
        guidance = .findingFloor
    }

    func resetAndRescan() {
        resetMeasurementState()
        if let av = arView { setupSession(with: av) }
    }

    private func resetMeasurementState() {
        floorPlane      = nil
        floorAnchor     = nil
        buffer.reset()
        overlayCorners  = []
        manualTapCorners = []
        finalDimensions = nil
        capturedImage   = nil
        recentPoses     = []
        progress        = 0
        distanceMetres  = 0
        objectScreenBB  = nil
        edgeFusionActive = false
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MARK: - Public user actions
    // ─────────────────────────────────────────────────────────────────────────

    func startScan() {
        guard phase == .readyToScan || phase == .positioning else { return }
        buffer.reset()
        progress = 0
        phase    = .scanning
    }

    /// User taps "Confirm Object" — begins frame capture
    func confirmObject() {
        guard phase == .objectDetected else { return }
        buffer.reset()
        progress = 0
        phase    = .scanning
    }

    /// User taps "Rescan" from confirmation panel
    func cancelToPositioning() {
        buffer.reset()
        overlayCorners = []
        progress = 0
        phase    = .positioning
        guidance = .noObjectDetected
    }

    func requestManualCornerTap() {
        manualTapCorners = []
        phase = .manualCornerTap
    }

    /// Called from ScannerView when user taps a corner point
    func receiveCornerTap(_ point: CGPoint) {
        guard phase == .manualCornerTap else { return }
        manualTapCorners.append(point)
        if manualTapCorners.count == 4 {
            computeManualCornerResult()
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MARK: - ARSessionDelegate
    // ─────────────────────────────────────────────────────────────────────────

    nonisolated func session(_ session: ARSession, didAdd anchors: [ARAnchor]) {
        Task { @MainActor in handleNewAnchors(anchors) }
    }

    nonisolated func session(_ session: ARSession, didUpdate anchors: [ARAnchor]) {
        Task { @MainActor in handleUpdatedAnchors(anchors) }
    }

    nonisolated func session(_ session: ARSession, didUpdate frame: ARFrame) {
        Task { @MainActor in handleFrame(frame) }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MARK: - Plane anchor handling
    // ─────────────────────────────────────────────────────────────────────────

    private func handleNewAnchors(_ anchors: [ARAnchor]) {
        for a in anchors.compactMap({ $0 as? ARPlaneAnchor })
        where a.alignment == .horizontal {
            considerFloorAnchor(a)
        }
    }

    private func handleUpdatedAnchors(_ anchors: [ARAnchor]) {
        for a in anchors.compactMap({ $0 as? ARPlaneAnchor })
        where a.alignment == .horizontal {
            // Upgrade to a lower (more ground-level) anchor if found
            if let existing = floorAnchor,
               a.transform.columns.3.y < existing.transform.columns.3.y - 0.05 {
                floorAnchor = a
                commitFloorPlane(from: a)
            }
        }
    }

    private func considerFloorAnchor(_ a: ARPlaneAnchor) {
        if let existing = floorAnchor {
            if a.transform.columns.3.y < existing.transform.columns.3.y - 0.05 {
                floorAnchor = a
                commitFloorPlane(from: a)
            }
        } else {
            floorAnchor = a
            commitFloorPlane(from: a)
        }
    }

    /// Build a Plane3D from an ARPlaneAnchor's world transform
    private func commitFloorPlane(from anchor: ARPlaneAnchor) {
        let c3     = anchor.transform.columns.3
        let yAxis  = anchor.transform.columns.1
        let pt     = simd_float3(c3.x, c3.y, c3.z)
        let normal = simd_normalize(simd_float3(yAxis.x, yAxis.y, yAxis.z))
        floorPlane = Plane3D(point: pt, normal: normal)

        if phase == .findingFloor {
            phase    = .positioning
            guidance = .noObjectDetected
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MARK: - Per-frame processing
    // ─────────────────────────────────────────────────────────────────────────

    private func handleFrame(_ frame: ARFrame) {
        guard phase != .warmingUp,
              phase != .completed,
              phase != .processing,
              phase != .manualCornerTap else { return }

        let now = frame.timestamp
        guard now - lastFrameTime >= frameInterval else { return }
        lastFrameTime = now

        updateGuidance(frame)

        switch phase {
        case .positioning, .readyToScan, .objectDetected:
            if floorPlane == nil { tryFloorFromDepth(frame) }
            // Keep refreshing outline during objectDetected so it tracks the box
            if phase == .objectDetected { updateOutlineOnly(frame) }
        case .scanning:
            runMeasurementFrame(frame)
        default:
            break
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MARK: - Guidance engine
    // ─────────────────────────────────────────────────────────────────────────

    private func updateGuidance(_ frame: ARFrame) {
        guard let av = arView else { return }

        // 1. Distance: raycast from screen centre
        let centre = CGPoint(x: av.bounds.midX, y: av.bounds.midY)
        if let hit = av.raycast(from: centre,
                                 allowing: .estimatedPlane,
                                 alignment: .any).first {
            distanceMetres = hit.distance
        }

        // 2. Camera pitch in degrees (ARKit: negative = looking down)
        pitchDegrees = frame.camera.eulerAngles.x * 180 / .pi

        // 3. Motion tracking
        recentPoses.append(frame.camera.transform)
        if recentPoses.count > 6 { recentPoses.removeFirst() }

        // 4. Compute instruction
        let instr = computeInstruction()
        guidance = instr

        // Promote/demote readyToScan and objectDetected
        if instr == .capturing && phase == .positioning   { phase = .readyToScan }
        if instr.isWarning     && phase == .readyToScan   { phase = .positioning  }
        // Once conditions are perfect and we have an outline, promote to objectDetected
        if instr == .capturing && phase == .readyToScan && overlayCorners.count == 4 {
            phase    = .objectDetected
            guidance = .objectDetected
        }
    }

    private func computeInstruction() -> GuidanceInstruction {
        guard floorPlane != nil else { return .findingFloor }

        let d = distanceMetres
        let p = pitchDegrees

        if d > 0 && d < 0.55 { return .tooClose }
        if d > 3.5            { return .tooFar   }

        // Pitch conventions (ARKit):
        //  0°  = camera horizontal (pointing straight ahead)
        // −90° = camera pointing straight down
        // Sweet spot for reading box tops: −20° to −65°
        if p > -20 { return .tiltDown }
        if p < -68 { return .tiltUp   }

        if isMovingTooFast() { return .movingTooFast }

        return .capturing
    }

    private func isMovingTooFast() -> Bool {
        guard recentPoses.count >= 2 else { return false }
        let a = recentPoses[recentPoses.count - 2].columns.3
        let b = recentPoses[recentPoses.count - 1].columns.3
        let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
        return sqrt(dx * dx + dy * dy + dz * dz) > 0.018   // 1.8 cm threshold
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MARK: - Floor from depth (fallback if no anchor yet)
    // ─────────────────────────────────────────────────────────────────────────

    private func tryFloorFromDepth(_ frame: ARFrame) {
        let pts = PointCloudUtils.worldPoints(from: frame, stride: 10)
        guard pts.count > 80 else { return }

        // Floor = lowest 8% of all depth points
        let sorted = pts.sorted { $0.y < $1.y }
        let n      = max(pts.count / 12, 8)
        let bottom = Array(sorted.prefix(n))

        guard let plane = RANSACPlaneDetector.fit(points: bottom),
              abs(plane.normal.y) > 0.75          // must be mostly horizontal
        else { return }

        floorPlane = plane
        phase    = .positioning
        guidance = .noObjectDetected
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MARK: - Outline-only update (objectDetected phase — no measurement yet)
    // ─────────────────────────────────────────────────────────────────────────

    /// Keeps the outline quad tracking the box while user decides to confirm.
    /// Does NOT push to the measurement buffer.
    private func updateOutlineOnly(_ frame: ARFrame) {
        guard let floor = floorPlane else { return }
        let allPts   = PointCloudUtils.worldPoints(from: frame, stride: 5)
        guard allPts.count > 200 else { return }
        let abovePts = PointCloudUtils.aboveFloor(allPts, floor: floor, minH: 0.04, maxH: 2.5)
        guard abovePts.count > 60 else { overlayCorners = []; return }
        guard let band     = PointCloudUtils.dominantClusterBand(pts: abovePts, floor: floor),
              let topPlane = RANSACPlaneDetector.fit(points: abovePts.filter {
                  let h = floor.signedDistance(to: $0)
                  return h >= band.hi - 0.04 && h <= band.hi + 0.01
              }) else { return }

        let up    = topPlane.normal
        let right: simd_float3 = abs(up.y) > 0.95 ? simd_float3(1,0,0)
                  : simd_normalize(simd_cross(simd_float3(0,1,0), up))
        let fwd   = simd_normalize(simd_cross(up, right))

        let pts2D: [simd_float2] = abovePts.map {
            let proj = topPlane.project($0)
            return simd_float2(simd_dot(proj, right), simd_dot(proj, fwd))
        }
        guard pts2D.count >= 8 else { return }
        let hull = ConvexHull2D.compute(pts2D)
        guard hull.count >= 3 else { return }
        updateOverlayCorners(topPlane: topPlane, right: right, fwd: fwd, hull: hull, frame: frame)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MARK: - Core measurement frame  (ALL real geometry, zero fake values)
    // ─────────────────────────────────────────────────────────────────────────

    private func runMeasurementFrame(_ frame: ARFrame) {
        // Only capture when guidance position is acceptable
        guard guidance == .capturing || guidance == .objectDetected,
              let floor = floorPlane,
              let av    = arView else { return }

        // ── 1. World-space point cloud ────────────────────────────────────────
        let allPts = PointCloudUtils.worldPoints(from: frame, stride: 3)
        guard allPts.count > 300 else { return }

        // ── 2. Points above floor ─────────────────────────────────────────────
        let abovePts = PointCloudUtils.aboveFloor(allPts, floor: floor,
                                                   minH: 0.04, maxH: 2.5)
        guard abovePts.count > 80 else {
            if guidance != .noObjectDetected { guidance = .noObjectDetected }
            return
        }

        // ── 3. Dominant object height band ───────────────────────────────────
        guard let band = PointCloudUtils.dominantClusterBand(
                            pts: abovePts, floor: floor) else { return }

        // ── 4. Top-surface points (uppermost 4 cm of band) ───────────────────
        let topBandLo  = band.hi - 0.04
        let topSurface = abovePts.filter {
            let h = floor.signedDistance(to: $0)
            return h >= topBandLo && h <= band.hi + 0.01
        }
        guard topSurface.count >= 15 else { return }

        // ── 5. RANSAC top plane ───────────────────────────────────────────────
        guard let topPlane = RANSACPlaneDetector.fit(points: topSurface) else { return }

        // ── 6. Height = signed distance from floor to top plane centroid ─────
        let heightM  = abs(floor.signedDistance(to: topPlane.point))
        let heightCm = heightM * 100.0
        guard heightCm >= minimumDimCm else { return }

        // ── 7. 2-D frame on top plane (for LiDAR hull fallback + overlay) ─────
        let up = topPlane.normal
        let right: simd_float3 = abs(up.y) > 0.95
            ? simd_float3(1, 0, 0)
            : simd_normalize(simd_cross(simd_float3(0, 1, 0), up))
        let fwd = simd_normalize(simd_cross(up, right))

        // ── 8. LiDAR-only L/W via convex hull (baseline / fallback) ──────────
        let pts2D: [simd_float2] = abovePts.map {
            let proj = topPlane.project($0)
            return simd_float2(simd_dot(proj, right), simd_dot(proj, fwd))
        }
        guard pts2D.count >= 8 else { return }

        let hull = ConvexHull2D.compute(pts2D)
        guard hull.count >= 3 else { return }
        let (lidarLongM, lidarShortM) = ConvexHull2D.minBoundingRect(hull: hull)

        let lidarLengthCm = lidarLongM  * 100.0
        let lidarWidthCm  = lidarShortM * 100.0
        guard lidarLengthCm >= minimumDimCm,
              lidarWidthCm  >= minimumDimCm else { return }

        // ── 9. Update screen overlay from LiDAR hull ─────────────────────────
        updateOverlayCorners(topPlane: topPlane, right: right,
                              fwd: fwd, hull: hull, frame: frame)

        // Update object bounding box for EdgeDetector
        updateObjectScreenBB()

        // ── 10. HYBRID: Camera edge detection for refined L/W ─────────────────
        var finalLengthCm = lidarLengthCm
        var finalWidthCm  = lidarWidthCm
        var edgeConfBonus: Float = 0
        var usedEdgeFusion = false

        if let edgeMeas = EdgeDetector.detect(
                frame:          frame,
                topPlane:       topPlane,
                objectScreenBB: objectScreenBB,
                arView:         av
        ) {
            // Plausibility gate: edge result must agree with LiDAR within 40%
            let lidarArea = lidarLengthCm * lidarWidthCm
            let edgeArea  = edgeMeas.length * edgeMeas.width
            let ratio     = min(lidarArea, edgeArea) / max(lidarArea, edgeArea)

            if ratio > 0.40 {
                // Weighted fusion: edge gets 60%, LiDAR gets 40%
                // (edge is more accurate for flat-top boxes with clear edges)
                let w: Float = 0.60
                finalLengthCm = edgeMeas.length * w + lidarLengthCm * (1 - w)
                finalWidthCm  = edgeMeas.width  * w + lidarWidthCm  * (1 - w)
                edgeConfBonus = edgeMeas.confidence * 0.15   // bonus for good edges
                usedEdgeFusion = true

                // Prefer edge-detected corners for the screen overlay
                if edgeMeas.screenCorners.count == 4 {
                    overlayCorners = edgeMeas.screenCorners
                }
            }
        }

        edgeFusionActive = usedEdgeFusion

        // ── 11. Confidence ────────────────────────────────────────────────────
        let density     = min(Float(topSurface.count) / 80.0, 1.0)
        let aspect      = min(lidarShortM / max(lidarLongM, 0.001), 1.0)
        let aspectScore: Float = aspect > 0.1 ? 1.0 : aspect * 10.0
        let conf        = min(density * 0.5 + aspectScore * 0.35 + edgeConfBonus, Float(0.99))

        // ── 12. Push to buffer ────────────────────────────────────────────────
        buffer.push(RawMeasurement(
            length:     finalLengthCm,
            width:      finalWidthCm,
            height:     heightCm,
            confidence: conf,
            timestamp:  frame.timestamp
        ))
        progress = min(buffer.fillRatio, 1.0)

        // ── 13. Finalise when buffer is ready ─────────────────────────────────
        if buffer.isReady { finalise() }
    }

    /// Derive a screen-space bounding rect from the current overlayCorners
    private func updateObjectScreenBB() {
        guard overlayCorners.count == 4 else { objectScreenBB = nil; return }
        let xs = overlayCorners.map(\.x)
        let ys = overlayCorners.map(\.y)
        objectScreenBB = CGRect(
            x: xs.min()!, y: ys.min()!,
            width:  xs.max()! - xs.min()!,
            height: ys.max()! - ys.min()!
        )
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MARK: - Screen overlay corner projection
    // ─────────────────────────────────────────────────────────────────────────

    private func updateOverlayCorners(topPlane: Plane3D,
                                       right:    simd_float3,
                                       fwd:      simd_float3,
                                       hull:     [simd_float2],
                                       frame:    ARFrame) {
        guard let av = arView else { return }

        // Axis-aligned bounding box of the hull in local top-plane coordinates
        let minX = hull.map(\.x).min()!;  let maxX = hull.map(\.x).max()!
        let minY = hull.map(\.y).min()!;  let maxY = hull.map(\.y).max()!

        let w3D = [
            topPlane.point + right * minX + fwd * minY,
            topPlane.point + right * maxX + fwd * minY,
            topPlane.point + right * maxX + fwd * maxY,
            topPlane.point + right * minX + fwd * maxY,
        ]

        // Project each world corner to screen space via clip coordinates
        let PV = frame.camera.projectionMatrix(for:          av.frame.size,
                                                orientation:  .portrait,
                                                zNear:        0.001,
                                                zFar:         100)
               * frame.camera.viewMatrix(for: .portrait)

        let screen: [CGPoint] = w3D.compactMap { w in
            let clip = PV * simd_float4(w.x, w.y, w.z, 1)
            guard clip.w > 0 else { return nil }
            let nx = clip.x / clip.w
            let ny = clip.y / clip.w
            return CGPoint(
                x: Double((nx * 0.5 + 0.5) * Float(av.bounds.width)),
                y: Double((1.0 - (ny * 0.5 + 0.5)) * Float(av.bounds.height))
            )
        }
        if screen.count == 4 { overlayCorners = screen }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MARK: - Finalise auto-measurement
    // ─────────────────────────────────────────────────────────────────────────

    private func finalise() {
        phase = .processing
        Task { @MainActor in
            guard let dims = buffer.averaged(), dims.isValid else {
                // Bad batch — discard and retry
                buffer.reset()
                progress = 0
                phase    = .scanning
                return
            }
            finalDimensions = dims
            captureSnapshot()
            guidance = .done
            phase    = .completed
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MARK: - Manual 4-corner tap override
    // ─────────────────────────────────────────────────────────────────────────

    private func computeManualCornerResult() {
        guard manualTapCorners.count == 4,
              let av    = arView,
              let floor = floorPlane else { return }

        // Raycast each tapped corner into the scene
        var worldPts = [simd_float3]()
        for tap in manualTapCorners {
            let result =
                av.raycast(from: tap,
                           allowing: .existingPlaneGeometry,
                           alignment: .horizontal).first ??
                av.raycast(from: tap,
                           allowing: .estimatedPlane,
                           alignment: .any).first

            if let r = result {
                let c = r.worldTransform.columns.3
                worldPts.append(simd_float3(c.x, c.y, c.z))
            }
        }

        guard worldPts.count == 4 else {
            // Raycast failed — fall back to auto result or restart
            if let auto = buffer.averaged(), auto.isValid {
                finalDimensions = auto; phase = .completed; guidance = .done
            } else {
                phase = .scanning
            }
            return
        }

        // Average opposite sides for robustness (user tapping isn't pixel-perfect)
        let s0 = simd_length(worldPts[1] - worldPts[0]) * 100  // cm
        let s1 = simd_length(worldPts[2] - worldPts[1]) * 100
        let s2 = simd_length(worldPts[3] - worldPts[2]) * 100
        let s3 = simd_length(worldPts[0] - worldPts[3]) * 100
        let dimA = (s0 + s2) / 2
        let dimB = (s1 + s3) / 2

        // Height: use buffer value if available, else measure from tapped surface to floor
        let heightCm: Float
        if let auto = buffer.averaged(), auto.height > 0 {
            heightCm = auto.height
        } else {
            let centre = worldPts.reduce(.zero, +) / 4
            heightCm = max(abs(floor.signedDistance(to: centre)) * 100, 1)
        }

        let dims = CargoDimensions(
            length:     max(dimA, dimB),
            width:      min(dimA, dimB),
            height:     heightCm,
            confidence: 0.97
        )

        if dims.isValid {
            finalDimensions = dims
            captureSnapshot()
            guidance = .done
            phase    = .completed
        } else {
            phase = .scanning
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MARK: - Snapshot
    // ─────────────────────────────────────────────────────────────────────────

    private func captureSnapshot() {
        arView?.snapshot(saveToHDR: false) { [weak self] img in
            Task { @MainActor [weak self] in
                self?.capturedImage = img
            }
        }
    }
}
