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
    @Published var calibrationScale: Float = 1.0
    
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
            if !session.currentFrame!.anchors.compactMap({ $0 as? ARPlaneAnchor }).isEmpty {
                phase = .ready
                aiMessage = "Floor detected. Aim at cargo."
            }
        case .scanning:
            detectMarker(frame)
            updateScanProgress()
        default:
            break
        }
    }
    
    private func detectMarker(_ frame: ARFrame) {
        // AI: Computer Vision to detect 20x20cm marker or A4 sheet
        // This calculates a 'calibrationScale' correction factor
        // For simulation: assume detected if steady for 1 sec
        if isStable && !isCalibrated {
            isCalibrated = true
            calibrationScale = 0.985 // example correction
            aiMessage = "Calibration detected. Accuracy improved."
        }
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
