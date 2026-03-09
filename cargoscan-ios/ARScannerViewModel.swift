import Foundation
import ARKit
import RealityKit
import Combine
import simd
import Vision
import CoreImage

enum ScanPhase {
    case initialization
    case detectingFloor
    case ready
    case scanning
    case processing
    case completed
    case failed
}

enum ScannerMode: String, CaseIterable {
    case linked
    case quick

    var label: String {
        switch self {
        case .linked: return "Linked Scan"
        case .quick: return "Quick Scan"
        }
    }
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
    @Published var pendingSyncCount: Int = 0
    @Published var syncStatusMessage: String = "Waiting for first scan"
    @Published var lastScanRecord: ScanRecord?
    @Published var scannerMode: ScannerMode = .linked
    @Published var trackingNumber: String = ""
    @Published var operatorID: String = "operator-001"
    @Published var linkedPackageSummary: String?
    @Published var edgeConfidence: Double = 0

    private let frameTarget = 4
    private let config = GeometricScanConfig.default
    private let syncService = ScanSyncService()

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

        Task {
            await refreshPendingCount()
            await retryPendingSync()
        }
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

    func setMode(_ mode: ScannerMode) {
        scannerMode = mode
        linkedPackageSummary = nil
        syncStatusMessage = mode == .linked ? "Linked mode: attach by tracking number" : "Quick mode: measurement only"
    }

    func lookupLinkedPackage() {
        let tracking = trackingNumber.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !tracking.isEmpty else {
            linkedPackageSummary = nil
            aiMessage = "Enter tracking number for linked scan"
            return
        }

        Task {
            do {
                if let package = try await syncService.findPackage(by: tracking) {
                    linkedPackageSummary = "\(package.customerName) · \(package.itemName)"
                    aiMessage = "Package found. Ready to scan."
                } else {
                    linkedPackageSummary = nil
                    aiMessage = "No package with this tracking number."
                }
            } catch {
                linkedPackageSummary = nil
                aiMessage = "Package lookup failed (offline/API unavailable)."
            }
        }
    }

    func confirmMeasurement() {
        guard phase == .ready, objectDetected else { return }

        if scannerMode == .linked {
            let tracking = trackingNumber.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !tracking.isEmpty else {
                phase = .failed
                aiMessage = "Linked mode requires a tracking number."
                return
            }
        }

        frameBuffer = []
        progress = 0
        edgeConfidence = 0
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
        edgeConfidence = 0
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

            let visionScore = estimateEdgeConfidence(from: frame)
            edgeConfidence = visionScore

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

        let geometryConfidence = MeshProcessor.confidenceScore(from: frameBuffer)
        confidenceScore = min(1.0, max(0.0, (geometryConfidence * 0.8) + (edgeConfidence * 0.2)))

        Task {
            if scannerMode == .linked {
                let tracking = trackingNumber.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !tracking.isEmpty else {
                    phase = .failed
                    aiMessage = "Linked mode requires a tracking number."
                    return
                }

                let photo = await captureSnapshotBase64()
                let scanRecord = ScanRecord.from(
                    trackingNumber: tracking,
                    operatorId: operatorID,
                    dimensions: averaged,
                    confidenceScore: confidenceScore,
                    photoBase64: photo
                )
                lastScanRecord = scanRecord
                await submitScanRecord(scanRecord)
            } else {
                syncStatusMessage = "Quick scan complete (not saved to backend)"
            }

            phase = .completed
            aiMessage = "Measurement complete"
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

    func retryPendingSync() async {
        do {
            try await syncService.flushQueue()
            syncStatusMessage = "All scans synced"
        } catch {
            syncStatusMessage = "Sync pending (offline/unreachable API)"
        }
        await refreshPendingCount()
    }

    private func submitScanRecord(_ record: ScanRecord) async {
        let outcome = await syncService.enqueueAndSync(record)
        switch outcome {
        case .synced:
            syncStatusMessage = "Scan synced to backend"
        case .queued:
            syncStatusMessage = "Scan queued offline. Will retry."
        }
        await refreshPendingCount()
    }

    private func refreshPendingCount() async {
        pendingSyncCount = await syncService.pendingCount()
    }

    private func captureSnapshotBase64() async -> String? {
        guard let arView else { return nil }

        return await withCheckedContinuation { continuation in
            arView.snapshot(saveToHDR: false) { image in
                guard let data = image?.jpegData(compressionQuality: 0.7) else {
                    continuation.resume(returning: nil)
                    return
                }
                continuation.resume(returning: data.base64EncodedString())
            }
        }
    }

    private func estimateEdgeConfidence(from frame: ARFrame) -> Double {
        let request = VNDetectContoursRequest()
        request.detectsDarkOnLight = false
        request.maximumImageDimension = 512

        let handler = VNImageRequestHandler(cvPixelBuffer: frame.capturedImage, options: [:])
        do {
            try handler.perform([request])
            guard let observation = request.results?.first else { return 0 }
            let normalized = min(1.0, Double(observation.contourCount) / 120.0)
            return normalized
        } catch {
            return 0
        }
    }
}
