import Foundation

actor ScanSyncService {
    private let storageKey = "cargoscan.pending_scan_records"
    private let endpointKey = "cargoscan.scan_sync_endpoint"
    private let defaultEndpoint = "https://api.cargoscan.app/api/scans"

    private var queue: [ScanRecord] = []

    init() {
        queue = loadQueue()
    }

    func pendingCount() -> Int {
        queue.count
    }

    func enqueueAndSync(_ record: ScanRecord) async -> ScanSyncOutcome {
        queue.append(record)
        persistQueue()

        do {
            try await flushQueue()
            return .synced
        } catch {
            return .queued(reason: error.localizedDescription)
        }
    }

    func flushQueue() async throws {
        while let next = queue.first {
            try await submit(record: next)
            queue.removeFirst()
            persistQueue()
        }
    }

    func findPackage(by trackingNumber: String) async throws -> PackageRecord? {
        guard !trackingNumber.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        let base = try packageBaseURL()
        var components = URLComponents(url: base.appendingPathComponent("packages"), resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "tracking", value: trackingNumber)]

        guard let url = components?.url else { throw URLError(.badURL) }

        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
            throw URLError(.badServerResponse)
        }

        let payload = try JSONDecoder().decode(PackageLookupResponse.self, from: data)
        return payload.packages.first
    }

    private func submit(record: ScanRecord) async throws {
        guard let url = URL(string: endpointURL()) else {
            throw URLError(.badURL)
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let envelope = ScanRecordEnvelope(scan: record)
        request.httpBody = try JSONEncoder().encode(envelope)

        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse,
              200..<300 ~= http.statusCode else {
            throw URLError(.badServerResponse)
        }
    }

    private func endpointURL() -> String {
        UserDefaults.standard.string(forKey: endpointKey) ?? defaultEndpoint
    }

    private func packageBaseURL() throws -> URL {
        guard let scanURL = URL(string: endpointURL()) else { throw URLError(.badURL) }
        return scanURL.deletingLastPathComponent()
    }

    private func loadQueue() -> [ScanRecord] {
        guard let data = UserDefaults.standard.data(forKey: storageKey) else { return [] }
        return (try? JSONDecoder().decode([ScanRecord].self, from: data)) ?? []
    }

    private func persistQueue() {
        guard let data = try? JSONEncoder().encode(queue) else { return }
        UserDefaults.standard.set(data, forKey: storageKey)
    }
}
