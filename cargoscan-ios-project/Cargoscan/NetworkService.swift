//
//  NetworkService.swift
//  Cargoscan
//
//  Created for CargoScan iOS Scanner
//

import Foundation
import UIKit

enum NetworkError: Error {
    case invalidURL
    case noData
    case decodingError
    case serverError(String)
}

struct ScanPayload: Codable {
    let cargoItemId: String
    let length: Float
    let width: Float
    let height: Float
    let cbm: Float
    let confidence: Float
    let scannerDevice: String
    let photoUrl: String?
}

class NetworkService {
    static let shared = NetworkService()
    private let baseURL = "https://cargoscan.onrender.com/api"
    
    // In a real app we would grab the auth token from user defaults / keychain
    // For this module test we'll assume the API accepts it or we mock the auth header.
    // If auth is strictly required, the user must login on iOS first.
    // Let's pass the token if available.
    var currentToken: String? {
        UserDefaults.standard.string(forKey: "cs_token")
    }
    
    func saveScan(payload: ScanPayload) async throws -> String {
        guard let url = URL(string: "\(baseURL)/scans") else {
            throw NetworkError.invalidURL
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = currentToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let encoder = JSONEncoder()
        request.httpBody = try encoder.encode(payload)
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.serverError("Invalid response type")
        }
        
        if !(200...299).contains(httpResponse.statusCode) {
            // Try to parse the error message
            if let errorJson = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let msg = errorJson["error"] as? String {
                throw NetworkError.serverError(msg)
            }
            throw NetworkError.serverError("Server returned status \(httpResponse.statusCode)")
        }
        
        // Success
        return "Scan saved successfully"
    }
}
