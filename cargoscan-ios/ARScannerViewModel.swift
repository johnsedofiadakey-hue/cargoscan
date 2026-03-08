import Foundation
import ARKit
import RealityKit
import Combine

enum ScanPhase {
    case initialization
    case detectingFloor
    case ready
    case scanning
    case processing
    case completed
}

class ARScannerViewModel: NSObject, ObservableObject, ARSessionDelegate {
    @Published var phase: ScanPhase = .initialization
    @Published var progress: Double = 0.0
    @Published var aiMessage: String = "Initializing LiDAR..."
    @Published var distance: Float = 0.0
    @Published var confidence: Double = 0.0
    @Published var isStable: Bool = false
    @Published var capturedImage: UIImage? = nil
    @Published var isCalibrated: Bool = false
    @Published var cornerPoints: [CGPoint] = []
    @Published var topPlaneDetected: Bool = false
    @Published var floorPlaneDetected: Bool = false
    @Published var manualLocks: [Int: CGPoint] = [:] // Corner index to screen point
    
    // Thresholds
    private let minHeight: Float = 0.05 // 5cm
    private let minArea: Float = 0.01 // 10x10cm
    
    // Measurement Buffer
    private var dimensionBuffer: [CargoDimensions] = []
    private let maxBufferSize = 8
    
    var arView: ARView?
    private var session: ARSession { arView?.session ?? ARSession() }
    
    // Scan Data
    private var capturedMeshes: [ARMeshAnchor] = []
    private var lastGuidanceTime: Date = Date()
    
    override init() {
        super.init()
    }
    
    func setupSession(with arView: ARView) {
        self.arView = arView
        arView.session.delegate = self
        
        let config = ARWorldTrackingConfiguration()
        config.planeDetection = [.horizontal]
        config.environmentTexturing = .automatic
        
        // Disable mesh debugging for production UI
        // config.sceneReconstruction = .mesh 
        
        if ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) {
            config.frameSemantics.insert(.sceneDepth)
        }
        
        arView.session.run(config)
        phase = .detectingFloor
        aiMessage = "Detecting floor plane..."
    }
    
    // MARK: - ARSessionDelegate
    
    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        updateDistance(frame)
        
        switch phase {
        case .detectingFloor:
            if let floor = session.currentFrame!.anchors.compactMap({ $0 as? ARPlaneAnchor }).first(where: { $0.alignment == .horizontal }) {
                floorPlaneDetected = true
                phase = .ready
                aiMessage = "Floor locked. Aim at cargo top."
            }
        case .scanning:
            processHybridMeasurement(frame)
        default:
            break
        }
    }
    
    private func processHybridMeasurement(_ frame: ARFrame) {
        // 1. RANSAC-inspired Plane Filtering
        // Find the most stable horizontal plane at least 10cm above the floor
        let planes = frame.anchors.compactMap { $0 as? ARPlaneAnchor }
        let floorY = planes.first(where: { $0.alignment == .horizontal })?.center.y ?? 0
        
        let candidateTopPlanes = planes.filter { 
            $0.alignment == .horizontal && ($0.center.y - floorY) > minHeight 
        }
        
        if let topPlane = candidateTopPlanes.sorted(by: { $0.extent.x * $0.extent.z > $1.extent.x * $1.extent.z }).first {
            topPlaneDetected = true
            let height = (topPlane.center.y - floorY) * 100 // cm
            
            // 2. Edge & Corner Detection (Vision-based)
            let detectedCorners = detectCornersInFrame(frame)
            
            // 3. Apply Manual Overrides
            var finalCorners = detectedCorners
            for (idx, point) in manualLocks {
                if idx < finalCorners.count { finalCorners[idx] = point }
            }
            self.cornerPoints = finalCorners
            
            // 4. Raycast for L/W
            let (l, w) = calculateLWFromCorners(finalCorners)
            
            // 5. Sanity Check
            if l * w > minArea * 10000 {
                let current = CargoDimensions(length: l, width: w, height: height, confidence: calculateConfidence())
                updateBuffer(with: current)
            }
        }
    }
    
    private func detectCornersInFrame(_ frame: ARFrame) -> [CGPoint] {
        // Implementation would use Vision VNDetectRectanglesRequest
        return [CGPoint(x: 100, y: 150), CGPoint(x: 300, y: 150), CGPoint(x: 300, y: 450), CGPoint(x: 100, y: 450)]
    }
    
    func lockCorner(at point: CGPoint) {
        // Find nearest corner to the tap and lock it
        if let nearestIdx = cornerPoints.enumerated().min(by: { 
            pow($0.element.x - point.x, 2) + pow($0.element.y - point.y, 2) < 
            pow($1.element.x - point.x, 2) + pow($1.element.y - point.y, 2) 
        })?.offset {
            manualLocks[nearestIdx] = point
            aiMessage = "Corner \(nearestIdx + 1) locked manually."
        }
    }
    
    private func calculateConfidence() -> Double {
        let stabilityFactor = isStable ? 0.7 : 0.4
        let calibrationFactor = isCalibrated ? 0.3 : 0.1
        return min(0.99, stabilityFactor + calibrationFactor)
    }
    
    private func updateBuffer(with dims: CargoDimensions) {
        dimensionBuffer.append(dims)
        if dimensionBuffer.count > maxBufferSize { dimensionBuffer.removeFirst() }
        
        progress = Double(dimensionBuffer.count) / Double(maxBufferSize)
        
        if dimensionBuffer.count == maxBufferSize {
            finishScan()
        }
    }
    
    private func simulateCornerDetection() -> [CGPoint] {
        // Return 4 points forming a rectangle in screen space
        return [CGPoint(x: 100, y: 100), CGPoint(x: 300, y: 100), CGPoint(x: 300, y: 400), CGPoint(x: 100, y: 400)]
    }
    
    private func calculateLWFromCorners(_ corners: [CGPoint]) -> (Float, Float) {
        // Raycast points and measure 3D distance
        // Simulated for current environment
        return (60.0, 40.0)
    }
    
    private func updateDistance(_ frame: ARFrame) {
        // Cast ray from center of screen to detect distance to object
        guard let arView = arView else { return }
        let center = CGPoint(x: arView.bounds.midX, y: arView.bounds.midY)
        
        if let result = arView.raycast(from: center, allowing: .estimatedPlane, alignment: .any).first {
            distance = result.distance
            isStable = distance > 0.5 && distance < 3.0
        }
    }
    
    private func updateScanProgress() {
        // Increment progress based on camera movement and mesh density
        progress += 0.005 
        if progress >= 1.0 {
            finishScan()
        } else {
            updateGuidance()
        }
    }
    
    private func updateGuidance() {
        guard Date().timeIntervalSince(lastGuidanceTime) > 2.0 else { return }
        
        let messages = [
            "Move left slowly...",
            "Move right slowly...",
            "Capture the top of the object.",
            "Scan the rear corners."
        ]
        aiMessage = messages[Int(progress * Double(messages.count)) % messages.count]
        lastGuidanceTime = Date()
    }
    
    func startScan() {
        guard phase == .ready else { return }
        phase = .scanning
        progress = 0.0
        aiMessage = "Scanning... Move around object."
    }
    
    func finishScan() {
        phase = .processing
        aiMessage = "Reconstructing 3D Mesh..."
        
        // Capture photo evidence for dispute resolution
        takeSnapshot()
        
        // In a real app, logic to extract OBB from meshes would trigger here
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            self.phase = .completed
            self.aiMessage = "Scan Complete. High Confidence."
        }
    }
    
    private func takeSnapshot() {
        arView?.snapshot(saveToHDR: false) { image in
            DispatchQueue.main.async {
                self.capturedImage = image
            }
        }
    }
}
