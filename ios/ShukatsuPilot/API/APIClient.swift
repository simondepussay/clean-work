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

    // MARK: ES (S13) et relecture (S14–S16)

    func drafts() async throws -> [Draft] {
        try decode([Draft].self, from: try await send("GET", "api/drafts"))
    }

    func createDraft(_ input: DraftInput) async throws -> Draft {
        try decode(Draft.self, from: try await send("POST", "api/drafts", body: try JSONEncoder().encode(input)))
    }

    func updateDraft(_ id: String, _ input: DraftInput) async throws -> Draft {
        try decode(Draft.self, from: try await send("PUT", "api/drafts/\(id)", body: try JSONEncoder().encode(input)))
    }

    func deleteDraft(_ id: String) async throws {
        try await send("DELETE", "api/drafts/\(id)")
    }

    func reviews(of draftId: String) async throws -> [Review] {
        try decode([Review].self, from: try await send("GET", "api/drafts/\(draftId)/reviews"))
    }

    func usage() async throws -> Usage {
        try decode(Usage.self, from: try await send("GET", "api/usage"))
    }

    /// Relecture par IA ; un refus (limite, ES vide, IA indisponible) n'est pas une erreur réseau.
    func review(_ draftId: String, language: HelpLanguage) async throws -> Result<Review, ReviewRefusal> {
        struct Body: Encodable { let language: String }
        struct Refusal: Decodable { let error: String?; let reason: String?; let retryAfter: String? }
        let (data, status) = try await raw("POST", "api/drafts/\(draftId)/review", body: try JSONEncoder().encode(Body(language: language.rawValue)))
        if status == 201 { return .success(try decode(Review.self, from: data)) }
        if status == 401 { throw APIError.unauthorized }
        let refusal = try? JSONDecoder().decode(Refusal.self, from: data)
        switch (status, refusal?.error) {
        case (_, "limit"):
            let date = refusal?.retryAfter.flatMap { ISO8601DateFormatter.withFractions.date(from: $0) }
            return .failure(.limit(reason: refusal?.reason ?? "day", retryAfter: date))
        case (400, _): return .failure(.emptyBody)
        case (_, "ai_not_configured"): return .failure(.notConfigured)
        default: return .failure(.failed)
        }
    }

    /// Supprime le compte et toutes ses données (S25).
    func deleteAccount() async throws {
        try await send("DELETE", "api/me")
    }

    /// Requête brute : données et code HTTP, sans interprétation.
    private func raw(_ method: String, _ path: String, body: Data? = nil) async throws -> (Data, Int) {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.setValue(try await token(), forHTTPHeaderField: Self.tokenHeader)
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        // La relecture prend une quinzaine de secondes : marge au-delà des 40 s côté serveur.
        request.timeoutInterval = 60
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        return (data, http.statusCode)
    }

    @discardableResult
    private func send(_ method: String, _ path: String, body: Data? = nil) async throws -> Data {
        let (data, status) = try await raw(method, path, body: body)
        switch status {
        case 200..<300: return data
        case 400:
            struct Invalid: Decodable { let issues: [Issue] }
            throw APIError.invalid((try? JSONDecoder().decode(Invalid.self, from: data))?.issues ?? [])
        case 401: throw APIError.unauthorized
        case 503: throw APIError.notConfigured
        default: throw APIError.server(status: status)
        }
    }
}

extension ISO8601DateFormatter {
    /// Dates de l'API (« 2026-10-21T00:00:00.000Z »), avec les millisecondes.
    static let withFractions: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}
