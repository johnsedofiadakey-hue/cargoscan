// CargoScanApp.swift
import SwiftUI
import ARKit
import RealityKit

@main
struct CargoScanApp: App {
    @State private var isLoggedIn = KeychainHelper.shared.getToken(key: "cs_token") != nil
    @Environment(\.scenePhase) private var scenePhase
    
    var body: some SwiftUI.Scene {
        WindowGroup {
            if isLoggedIn {
                HomeView()
                    .task {
                        await OfflineManager.shared.syncQueue()
                    }
            } else {
                LoginView(isLoggedIn: $isLoggedIn)
            }
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active, isLoggedIn else { return }
            Task { await OfflineManager.shared.syncQueue() }
        }
    }
}
