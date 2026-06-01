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
            Group {
                if isLoggedIn {
                    HomeView()
                        .task {
                            await OfflineManager.shared.syncQueue()
                        }
                } else {
                    LoginView(isLoggedIn: $isLoggedIn)
                }
            }
            .onOpenURL { url in
                handleAuthURL(url)
            }
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active, isLoggedIn else { return }
            Task { await OfflineManager.shared.syncQueue() }
        }
    }

    private func handleAuthURL(_ url: URL) {
        guard url.scheme == "cargoscan",
              url.host == "auth",
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let code = components.queryItems?.first(where: { $0.name == "code" })?.value,
              !code.isEmpty else {
            return
        }

        Task {
            do {
                let success = try await NetworkService.shared.redeemMobileLoginCode(code)
                await MainActor.run {
                    if success {
                        UINotificationFeedbackGenerator().notificationOccurred(.success)
                        isLoggedIn = true
                    }
                }
            } catch {
                await MainActor.run {
                    UINotificationFeedbackGenerator().notificationOccurred(.error)
                }
            }
        }
    }
}
