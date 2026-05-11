import Foundation

class OfflineManager {
    static let shared = OfflineManager()
    private let queueKey = "offline_scan_queue"
    
    private init() {}
    
    func queueScan(payload: ScanPayload) {
        var queue = getQueue()
        queue.append(payload)
        saveQueue(queue)
    }
    
    func getQueue() -> [ScanPayload] {
        guard let data = UserDefaults.standard.data(forKey: queueKey) else { return [] }
        return (try? JSONDecoder().decode([ScanPayload].self, from: data)) ?? []
    }
    
    func saveQueue(_ queue: [ScanPayload]) {
        if let data = try? JSONEncoder().encode(queue) {
            UserDefaults.standard.set(data, forKey: queueKey)
        }
    }
    
    func syncQueue() async {
        let queue = getQueue()
        guard !queue.isEmpty else { return }
        
        var remainingQueue: [ScanPayload] = []
        
        for payload in queue {
            do {
                _ = try await NetworkService.shared.saveScan(payload: payload)
            } catch {
                // If failed (e.g. network error), keep in queue
                // But if it's a validation error (400), we might want to drop it or handle it!
                // For now, let's keep it if it's a network error.
                remainingQueue.append(payload)
            }
        }
        
        saveQueue(remainingQueue)
    }
}
