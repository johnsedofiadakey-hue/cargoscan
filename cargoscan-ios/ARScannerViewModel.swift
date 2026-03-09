import Foundation
import ARKit
import RealityKit
import Combine
import simd

enum ScanPhase {
    case initialization
    case detectingFloor
    case ready
    case scanning
    case processing
    case completed
    case failed
}

@MainActor
final class ARScannerViewModel: NSObject, ObservableObject, ARSessionDelegate {
    @Published var phase: ScanPhase = .initialization
    @Published var progress: Double = 0
    @Published var aiMessage: String = "Initializing LiDAR..."
    @Published var outlinePoints: [CGPoint] = []
    @Published var measuredDimensions: CargoDimensions?
    @Published var confidenceScore: Double = 0
    @Published var objectDetected: Bool = false
    @Published var floorPlaneDetected: Bool = false

    private let frameTarget = 4
    private let config = GeometricScanConfig.default

    private var frameBuffer: [CargoDimensions] = []
    private var floorPlane: PlaneEquation?

    var arView: ARView?

    private var session: ARSession {
        arView?.session ?? ARSession()
    }

    func setupSession(with arView: ARView) {
        self.arView = arView
        arView.session.delegate = self

        let configuration = ARWorldTrackingConfiguration()
        configuration.sceneReconstruction = .mesh
        configuration.planeDetection = [.horizontal]
        configuration.environmentTexturing = .automatic

        if ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) {
            configuration.frameSemantics.insert(.sceneDepth)
        }

        arView.session.run(configuration)
        phase = .detectingFloor
        aiMessage = "Detecting floor plane..."
    }

    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        refreshFloorPlane(from: frame)

        switch phase {
        case .detectingFloor:
            if floorPlaneDetected {
                phase = .ready
                aiMessage = "Scan object to detect outline"
            }

        case .ready:
            previewObjectDetection(frame)

        case .scanning:
            processMeasurementFrame(frame)

        default:
            break
        }
    }

    func confirmMeasurement() {
        guard phase == .ready, objectDetected else { return }
        frameBuffer = []
        progress = 0
        phase = .scanning
        aiMessage = "Capturing stable measurement frames..."
    }

    func resetForRescan() {
        phase = floorPlaneDetected ? .ready : .detectingFloor
        progress = 0
        frameBuffer = []
        measuredDimensions = nil
        confidenceScore = 0
        outlinePoints = []
        objectDetected = false
        aiMessage = floorPlaneDetected ? "Scan object to detect outline" : "Detecting floor plane..."
    }

    private func previewObjectDetection(_ frame: ARFrame) {
        do {
            let measurement = try MeshProcessor.measureCargoGeometry(
                from: frame,
                floorPlane: floorPlane,
                config: config
            )

            objectDetected = true
            outlinePoints = MeshProcessor.projectTopOutline(measurement.topCorners, in: arView)
            aiMessage = "Object detected. Tap to confirm measurement"
        } catch {
            objectDetected = false
            outlinePoints = []
            aiMessage = "Move camera to frame the full cargo object"
        }
    }

    private func processMeasurementFrame(_ frame: ARFrame) {
        do {
            let measurement = try MeshProcessor.measureCargoGeometry(
                from: frame,
                floorPlane: floorPlane,
                config: config
            )

            outlinePoints = MeshProcessor.projectTopOutline(measurement.topCorners, in: arView)
            frameBuffer.append(measurement.dimensions)

            if frameBuffer.count > frameTarget {
                frameBuffer.removeFirst()
            }

            progress = Double(frameBuffer.count) / Double(frameTarget)
            aiMessage = "Capturing frame \(frameBuffer.count)/\(frameTarget)..."

            if frameBuffer.count == frameTarget {
                finalizeMeasurement()
            }
        } catch let validationError as GeometricValidationError {
            phase = .failed
            aiMessage = failureMessage(for: validationError)
        } catch {
            phase = .failed
            aiMessage = "Measurement failed. Please rescan."
        }
    }

    private func finalizeMeasurement() {
        phase = .processing
        aiMessage = "Stabilizing measurements..."

        let averaged = MeshProcessor.averageDimensions(from: frameBuffer)
        measuredDimensions = averaged
        confidenceScore = MeshProcessor.confidenceScore(from: frameBuffer)

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            self.phase = .completed
            self.aiMessage = "Measurement complete"
        }
    }

    private func refreshFloorPlane(from frame: ARFrame) {
        let floorAnchors = frame.anchors
            .compactMap { $0 as? ARPlaneAnchor }
            .filter { $0.alignment == .horizontal }

        guard let largestFloor = floorAnchors.max(by: { area(of: $0) < area(of: $1) }) else {
            floorPlaneDetected = false
            return
        }

        let upNormal = simd_float3(0, 1, 0)
        let anchorTransform = largestFloor.transform
        let normal = simd_normalize(simd_float3(anchorTransform.columns.1.x, anchorTransform.columns.1.y, anchorTransform.columns.1.z))
        let center = simd_float3(anchorTransform.columns.3.x, anchorTransform.columns.3.y, anchorTransform.columns.3.z)

        if let candidate = PlaneEquation(normal: normal, point: center) {
            floorPlane = candidate.flippedIfNeeded(toAlignWith: upNormal)
            floorPlaneDetected = true
        }
    }

    private func area(of plane: ARPlaneAnchor) -> Float {
        plane.extent.x * plane.extent.z
    }

    private func failureMessage(for error: GeometricValidationError) -> String {
        switch error {
        case .insufficientPlaneDetection:
            return "Insufficient plane detection. Rescan the object from a wider angle."
        case .objectClusterTooSmall:
            return "Object cluster too small. Move closer and rescan."
        case .cornerDetectionIncomplete:
            return "Corner detection incomplete. Ensure full top edges are visible."
        case .missingFloorPlane:
            return "Floor not detected. Aim at the floor first."
        }
    }
}
