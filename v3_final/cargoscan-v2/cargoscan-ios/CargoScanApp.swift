// CargoScanApp.swift
import SwiftUI
import ARKit
import RealityKit

@main
struct CargoScanApp: App {
    var body: some Scene {
        WindowGroup {
            // Inject the org's CBM rate here from your AuthState / OrgModel
            ScannerView(cbmRate: 85.0)
        }
    }
}
