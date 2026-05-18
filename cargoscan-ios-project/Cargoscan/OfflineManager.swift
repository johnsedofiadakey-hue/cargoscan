import Foundation

struct OfflineScanEnvelope: Codable, Identifiable {
    let id: UUID
    var payload: ScanPayload
    let photoData: Data?
    let distanceMetres: Float?
    let pitchDegrees: Float?
    let edgeFusion: Bool?
    let createdAt: Date

    init(
        payload: ScanPayload,
        photoData: Data? = nil,
        distanceMetres: Float? = nil,
        pitchDegrees: Float? = nil,
        edgeFusion: Bool? = nil
    ) {
        self.id = UUID()
        self.payload = payload
        self.photoData = photoData
        self.distanceMetres = distanceMetres
        self.pitchDegrees = pitchDegrees
        self.edgeFusion = edgeFusion
        self.createdAt = Date()
    }
}

final class OfflineManager {
    static let shared = OfflineManager()
    private let queueKey = "offline_scan_queue_v2"
    private let legacyQueueKey = "offline_scan_queue"
    private var isSyncing = false

    private init() {}

    func queueScan(
        payload: ScanPayload,
        photoData: Data? = nil,
        distanceMetres: Float? = nil,
        pitchDegrees: Float? = nil,
        edgeFusion: Bool? = nil
    ) {
        var queue = getQueue()
        queue.append(OfflineScanEnvelope(
            payload: payload,
            photoData: photoData,
            distanceMetres: distanceMetres,
            pitchDegrees: pitchDegrees,
            edgeFusion: edgeFusion
        ))
        saveQueue(queue)
    }

    func getQueue() -> [OfflineScanEnvelope] {
        if let data = UserDefaults.standard.data(forKey: queueKey),
           let queue = try? JSONDecoder().decode([OfflineScanEnvelope].self, from: data) {
            return queue
        }

        guard let legacyData = UserDefaults.standard.data(forKey: legacyQueueKey),
              let legacyPayloads = try? JSONDecoder().decode([ScanPayload].self, from: legacyData) else {
            return []
        }

        let migrated = legacyPayloads.map { OfflineScanEnvelope(payload: $0) }
        saveQueue(migrated)
        UserDefaults.standard.removeObject(forKey: legacyQueueKey)
        return migrated
    }

    func saveQueue(_ queue: [OfflineScanEnvelope]) {
        if let data = try? JSONEncoder().encode(queue) {
            UserDefaults.standard.set(data, forKey: queueKey)
        }
    }

    func syncQueue() async {
        if isSyncing { return }
        isSyncing = true
        defer { isSyncing = false }

        let queue = getQueue()
        guard !queue.isEmpty else { return }

        var remainingQueue: [OfflineScanEnvelope] = []

        for envelope in queue {
            do {
                let payload = try await preparePayload(envelope)
                _ = try await NetworkService.shared.saveScan(payload: payload)
            } catch {
                remainingQueue.append(envelope)
            }
        }

        saveQueue(remainingQueue)
    }

    private func preparePayload(_ envelope: OfflineScanEnvelope) async throws -> ScanPayload {
        if envelope.payload.photoUrl != nil {
            return envelope.payload
        }

        guard let photoData = envelope.photoData else {
            return envelope.payload
        }

        let (uploadUrl, publicUrl) = try await NetworkService.shared.getUploadUrl(
            cargoItemId: envelope.payload.cargoItemId,
            mimeType: "image/jpeg"
        )
        try await NetworkService.shared.uploadPhoto(url: uploadUrl, data: photoData, mimeType: "image/jpeg")

        var quality: ScanQualityResult? = nil
        if let distance = envelope.distanceMetres,
           let pitch = envelope.pitchDegrees,
           let edgeFusion = envelope.edgeFusion {
            quality = try? await NetworkService.shared.checkScanQuality(
                imageBase64: photoData.base64EncodedString(),
                dimensions: CargoDimensions(
                    length: envelope.payload.length,
                    width: envelope.payload.width,
                    height: envelope.payload.height,
                    confidence: Double(envelope.payload.confidence)
                ),
                distanceMetres: distance,
                pitchDegrees: pitch,
                edgeFusion: edgeFusion
            )
        }

        return ScanPayload(
            cargoItemId: envelope.payload.cargoItemId,
            length: envelope.payload.length,
            width: envelope.payload.width,
            height: envelope.payload.height,
            cbm: envelope.payload.cbm,
            confidence: envelope.payload.confidence,
            scannerDevice: envelope.payload.scannerDevice,
            photoUrl: publicUrl,
            qualityStatus: quality?.status ?? envelope.payload.qualityStatus,
            qualityScore: quality?.score ?? envelope.payload.qualityScore,
            qualityReason: quality?.reason ?? envelope.payload.qualityReason,
            qualityFlags: quality?.flags ?? envelope.payload.qualityFlags
        )
    }
}
