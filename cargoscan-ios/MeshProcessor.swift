import Foundation
import ARKit
import SceneKit

struct CargoDimensions {
    let length: Float
    let width: Float
    let height: Float
    let confidence: Double
    
    var cbm: Float {
        return (length * width * height) / 1_000_000
    }
}

class MeshProcessor {
    
    /// Average dimensions from multiple hybrid frames
    static func averageDimensions(from buffer: [CargoDimensions]) -> CargoDimensions {
        guard !buffer.isEmpty else { return CargoDimensions(length: 0, width: 0, height: 0, confidence: 0) }
        
        let avgL = buffer.map { $0.length }.reduce(0, +) / Float(buffer.count)
        let avgW = buffer.map { $0.width }.reduce(0, +) / Float(buffer.count)
        let avgH = buffer.map { $0.height }.reduce(0, +) / Float(buffer.count)
        
        return CargoDimensions(
            length: avgL,
            width: avgW,
            height: avgH,
            confidence: 0.99
        )
    }
    
    /// Calculate shipping cost based on organization rate
    static func calculateCost(cbm: Float, rate: Double) -> Double {
        return Double(cbm) * rate
    }
}
