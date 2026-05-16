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

struct CargoItem: Codable, Identifiable {
    let id: String
    let length: Float
    let width: Float
    let height: Float
    let cbm: Float
    let status: String?
    let description: String?
    let shipmentId: String
}

class NetworkService {
    static let shared = NetworkService()
    private let baseURL: String = {
        if let value = Bundle.main.object(forInfoDictionaryKey: "CARGOSCAN_API_URL") as? String,
           !value.isEmpty {
            return value
        }
        return "https://cargoscan-api.onrender.com/api"
    }()
    
    var currentToken: String? {
        KeychainHelper.shared.getToken(key: "cs_token")
    }
    
    var refreshToken: String? {
        KeychainHelper.shared.getToken(key: "cs_refresh_token")
    }
    
    func refreshAccessToken() async throws -> String {
        guard let rToken = refreshToken else {
            throw NetworkError.serverError("No refresh token available")
        }
        
        guard let url = URL(string: "\(baseURL)/auth/refresh") else {
            throw NetworkError.invalidURL
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body = ["refreshToken": rToken]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode) else {
            throw NetworkError.serverError("Failed to refresh token")
        }
        
        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let newToken = (json["token"] as? String) ?? (json["accessToken"] as? String) {
            KeychainHelper.shared.saveToken(newToken, key: "cs_token")
            return newToken
        }
        
        throw NetworkError.decodingError
    }
    
    func login(email: String, password: String) async throws -> Bool {
        guard let url = URL(string: "\(baseURL)/auth/login") else {
            throw NetworkError.invalidURL
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body = ["email": email, "password": password]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.serverError("Invalid response type")
        }
        
        if !(200...299).contains(httpResponse.statusCode) {
            if let errorJson = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let msg = errorJson["error"] as? String {
                throw NetworkError.serverError(msg)
            }
            throw NetworkError.serverError("Login failed")
        }
        
        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let token = json["token"] as? String {
            KeychainHelper.shared.saveToken(token, key: "cs_token")
            if let rToken = json["refreshToken"] as? String {
                KeychainHelper.shared.saveToken(rToken, key: "cs_refresh_token")
            }
            return true
        }
        
        throw NetworkError.decodingError
    }
    
    func performRequest(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        var req = request
        if let token = currentToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let (data, response) = try await URLSession.shared.data(for: req)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.serverError("Invalid response type")
        }
        
        if httpResponse.statusCode == 401 {
            // Try to refresh token
            do {
                let newToken = try await refreshAccessToken()
                var retryReq = request
                retryReq.setValue("Bearer \(newToken)", forHTTPHeaderField: "Authorization")
                
                let (retryData, retryResponse) = try await URLSession.shared.data(for: retryReq)
                guard let retryHttpResponse = retryResponse as? HTTPURLResponse else {
                    throw NetworkError.serverError("Invalid response type")
                }
                return (retryData, retryHttpResponse)
            } catch {
                throw NetworkError.serverError("Session expired")
            }
        }
        
        return (data, httpResponse)
    }
    
    func saveScan(payload: ScanPayload) async throws -> String {
        guard let url = URL(string: "\(baseURL)/scans") else {
            throw NetworkError.invalidURL
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let encoder = JSONEncoder()
        request.httpBody = try encoder.encode(payload)
        
        let (data, httpResponse) = try await performRequest(request)
        
        if !(200...299).contains(httpResponse.statusCode) {
            if let errorJson = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let msg = errorJson["error"] as? String {
                throw NetworkError.serverError(msg)
            }
            throw NetworkError.serverError("Server returned status \(httpResponse.statusCode)")
        }
        
        return "Scan saved successfully"
    }
    
    func getUploadUrl(cargoItemId: String, mimeType: String) async throws -> (uploadUrl: String, publicUrl: String) {
        guard let url = URL(string: "\(baseURL)/scans/\(cargoItemId)/photo") else {
            throw NetworkError.invalidURL
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: String] = ["mimeType": mimeType]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        let (data, httpResponse) = try await performRequest(request)
        
        guard (200...299).contains(httpResponse.statusCode) else {
            throw NetworkError.serverError("Failed to get upload URL")
        }
        
        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let uploadUrl = json["uploadUrl"] as? String,
           let publicUrl = json["publicUrl"] as? String {
            return (uploadUrl, publicUrl)
        }
        
        throw NetworkError.decodingError
    }
    
    func uploadPhoto(url: String, data: Data, mimeType: String) async throws {
        guard let url = URL(string: url) else {
            throw NetworkError.invalidURL
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue(mimeType, forHTTPHeaderField: "Content-Type")
        request.httpBody = data
        
        // Photo upload to S3/Supabase usually doesn't need our backend auth token
        let (_, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode) else {
            throw NetworkError.serverError("Failed to upload photo")
        }
    }
    
    func getShipments() async throws -> [Shipment] {
        guard let url = URL(string: "\(baseURL)/shipments") else {
            throw NetworkError.invalidURL
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        
        let (data, httpResponse) = try await performRequest(request)
        
        guard (200...299).contains(httpResponse.statusCode) else {
            throw NetworkError.serverError("Failed to fetch shipments")
        }
        
        let decoder = JSONDecoder()
        return try decoder.decode([Shipment].self, from: data)
    }

    func getItems(shipmentId: String? = nil) async throws -> [CargoItem] {
        guard var components = URLComponents(string: "\(baseURL)/items") else {
            throw NetworkError.invalidURL
        }
        if let shipmentId {
            components.queryItems = [URLQueryItem(name: "shipmentId", value: shipmentId)]
        }
        guard let url = components.url else {
            throw NetworkError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"

        let (data, httpResponse) = try await performRequest(request)

        guard (200...299).contains(httpResponse.statusCode) else {
            throw NetworkError.serverError("Failed to fetch cargo items")
        }

        return try JSONDecoder().decode([CargoItem].self, from: data)
    }

    func createCargoItem(shipmentId: String, description: String?) async throws -> CargoItem {
        guard let url = URL(string: "\(baseURL)/items") else {
            throw NetworkError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "shipmentId": shipmentId,
            "length": 1,
            "width": 1,
            "height": 1,
            "description": description?.isEmpty == false ? description! : "Created from iPhone scan"
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, httpResponse) = try await performRequest(request)

        if !(200...299).contains(httpResponse.statusCode) {
            if let errorJson = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let msg = errorJson["error"] as? String {
                throw NetworkError.serverError(msg)
            }
            throw NetworkError.serverError("Failed to create cargo item")
        }

        return try JSONDecoder().decode(CargoItem.self, from: data)
    }
    
    func getConsignees(shipmentId: String) async throws -> [Consignee] {
        guard let url = URL(string: "\(baseURL)/consignees?shipmentId=\(shipmentId)") else {
            throw NetworkError.invalidURL
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        
        let (data, httpResponse) = try await performRequest(request)
        
        guard (200...299).contains(httpResponse.statusCode) else {
            throw NetworkError.serverError("Failed to fetch consignees")
        }
        
        let decoder = JSONDecoder()
        return try decoder.decode([Consignee].self, from: data)
    }
}

struct Shipment: Codable, Identifiable {
    let id: String
    let code: String
    let from: String?
    let to: String?
    let status: String?
}

struct Consignee: Codable, Identifiable {
    let id: String
    let name: String
}
