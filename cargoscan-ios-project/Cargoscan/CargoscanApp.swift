// CargoScanApp.swift
import SwiftUI
import ARKit
import RealityKit

@main
struct CargoScanApp: App {
    @State private var isLoggedIn = KeychainHelper.shared.getToken(key: "cs_token") != nil
    
    var body: some SwiftUI.Scene {
        WindowGroup {
            if isLoggedIn {
                HomeView()
            } else {
                LoginView(isLoggedIn: $isLoggedIn)
            }
        }
    }
}
