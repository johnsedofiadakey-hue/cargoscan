import SwiftUI
import ARKit
import RealityKit

@main
struct CargoScanApp: App {
    init() {
        UserDefaults.standard.set("http://172.20.10.3:3000/api/scans", forKey: "cargoscan.scan_sync_endpoint")
    }

    var body: some Scene {
        WindowGroup {
            ScannerView()
        }
    }
}
