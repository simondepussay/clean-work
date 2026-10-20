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
    /// Données refusées par l'API (400), avec le détail champ par champ.
    case invalid([Issue])
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
        try decode(Me.self, from: try await send("GET", "api/me"))
    }

    private func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do {
            return try JSONDecoder().decode(type, from: data)
        } catch {
            throw APIError.invalidResponse
        }
    }

    /// Le profil, ou nil s'il n'existe pas encore (S05).
    func profile() async throws -> Profile? {
        do {
            return try decode(Profile.self, from: try await send("GET", "api/profile"))
        } catch APIError.server(status: 404) {
            return nil
        }
    }

    @discardableResult
    func saveProfile(_ profile: Profile) async throws -> Profile {
        try decode(Profile.self, from: try await send("PUT", "api/profile", body: try JSONEncoder().encode(profile)))
    }

    /// Supprime le compte et toutes ses données (S25).
    func deleteAccount() async throws {
        try await send("DELETE", "api/me")
    }

    @discardableResult
    private func send(_ method: String, _ path: String, body: Data? = nil) async throws -> Data {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.setValue(try await token(), forHTTPHeaderField: Self.tokenHeader)
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        switch http.statusCode {
        case 200..<300: return data
        case 400:
            struct Invalid: Decodable { let issues: [Issue] }
            throw APIError.invalid((try? JSONDecoder().decode(Invalid.self, from: data))?.issues ?? [])
        case 401: throw APIError.unauthorized
        case 503: throw APIError.notConfigured
        default: throw APIError.server(status: http.statusCode)
        }
    }
}
