import Foundation

/// Ce que renvoie GET /api/me.
struct Me: Decodable, Equatable {
    let userId: String
    let email: String?
    let name: String?
    let hasProfile: Bool
}

enum APIError: Error, Equatable {
    /// Jeton absent, expiré ou refusé : il faut se reconnecter.
    case unauthorized
    /// L'annuaire n'est pas configuré côté serveur (503).
    case notConfigured
    case server(status: Int)
    case invalidResponse
}

/// Appels à l'API. Le jeton voyage dans `x-shukatsu-token` : Static Web Apps
/// se réserve l'en-tête `Authorization`.
struct APIClient {
    static let tokenHeader = "x-shukatsu-token"

    let baseURL: URL
    var session: URLSession = .shared
    /// Fournit un jeton d'accès valide (MSAL le renouvelle tout seul).
    let token: () async throws -> String

    func me() async throws -> Me {
        let data = try await send("GET", "api/me")
        do {
            return try JSONDecoder().decode(Me.self, from: data)
        } catch {
            throw APIError.invalidResponse
        }
    }

    /// Supprime le compte et toutes ses données (S25).
    func deleteAccount() async throws {
        try await send("DELETE", "api/me")
    }

    @discardableResult
    private func send(_ method: String, _ path: String) async throws -> Data {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.setValue(try await token(), forHTTPHeaderField: Self.tokenHeader)

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        switch http.statusCode {
        case 200..<300: return data
        case 401: throw APIError.unauthorized
        case 503: throw APIError.notConfigured
        default: throw APIError.server(status: http.statusCode)
        }
    }
}
