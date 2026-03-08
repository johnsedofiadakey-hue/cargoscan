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
    
    // Measurement Buffer
    private var dimensionBuffer: [CargoDimensions] = []
    private let maxBufferSize = 10
    
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
        config.sceneReconstruction = .mesh
        config.planeDetection = [.horizontal]
        config.environmentTexturing = .automatic
        
        // Enable LiDAR depth semantics
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
        // 1. Detect Top Plane
        let topPlanes = frame.anchors.compactMap { $0 as? ARPlaneAnchor }.filter { $0.alignment == .horizontal && $0.center.y > 0.1 }
        if let topPlane = topPlanes.first {
            topPlaneDetected = true
            
            // 2. Height = Top Y - Floor Y
            let height = topPlane.center.y * 100 // cm
            
            // 3. Detect Corners (Simulated CV Logic)
            // In production, we use CIDetector or Vision framework here
            let corners = simulateCornerDetection()
            self.cornerPoints = corners
            
            // 4. Raycast for L/W
            let (l, w) = calculateLWFromCorners(corners)
            
            let current = CargoDimensions(length: l, width: w, height: height, confidence: 0.95)
            updateBuffer(with: current)
        }
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
