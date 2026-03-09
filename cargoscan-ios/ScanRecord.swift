import Foundation

struct ScanRecord: Codable, Identifiable {
    let id: String
    let trackingNumber: String
    let lengthCm: Float
    let widthCm: Float
    let heightCm: Float
    let cbm: Float
    let timestamp: String
    let operatorId: String
    let confidenceScore: Double
    let source: String
    let photoBase64: String?

    static func from(
        trackingNumber: String,
        operatorId: String,
        dimensions: CargoDimensions,
        confidenceScore: Double,
        photoBase64: String?,
        source: String = "ARKit LiDAR"
    ) -> ScanRecord {
        ScanRecord(
            id: UUID().uuidString,
            trackingNumber: trackingNumber,
            lengthCm: dimensions.length,
            widthCm: dimensions.width,
            heightCm: dimensions.height,
            cbm: dimensions.cbm,
            timestamp: ISO8601DateFormatter().string(from: Date()),
            operatorId: operatorId,
            confidenceScore: confidenceScore,
            source: source,
            photoBase64: photoBase64
        )
    }
}

struct ScanRecordEnvelope: Codable {
    let scan: ScanRecord
}

struct PackageLookupResponse: Codable {
    let packages: [PackageRecord]
}

struct PackageRecord: Codable, Identifiable {
    let id: String
    let customerName: String
    let trackingNumber: String
    let itemName: String
    let description: String
    let supplier: String
    let shipmentId: String
    let quantity: Int
    let cbm: Float?
}

enum ScanSyncOutcome {
    case synced
    case queued(reason: String)
}
