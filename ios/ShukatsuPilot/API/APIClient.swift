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

    // MARK: Candidatures (S07, S08)

    func applications() async throws -> [JobApplication] {
        try decode([JobApplication].self, from: try await send("GET", "api/applications"))
    }

    func createApplication(_ input: JobApplicationInput) async throws -> JobApplication {
        try decode(JobApplication.self, from: try await send("POST", "api/applications", body: try JSONEncoder().encode(input)))
    }

    func updateApplication(_ id: String, _ input: JobApplicationInput) async throws -> JobApplication {
        try decode(JobApplication.self, from: try await send("PUT", "api/applications/\(id)", body: try JSONEncoder().encode(input)))
    }

    /// Change seulement le statut (passage d'une étape à l'autre).
    func moveApplication(_ id: String, to status: String) async throws -> JobApplication {
        try decode(JobApplication.self, from: try await send("PUT", "api/applications/\(id)", body: try JSONEncoder().encode(["status": status])))
    }

    func deleteApplication(_ id: String) async throws {
        try await send("DELETE", "api/applications/\(id)")
    }

    // MARK: 履歴書 PDF (S11)

    /// 履歴書 : trois modèles, comme au Japon. 新卒用 par défaut (c'est le 就活), comme sur le web.
    struct ResumeOptions: Encodable, Equatable {
        enum Era: String, Encodable, CaseIterable { case western, japanese }
        enum Template: String, Encodable, CaseIterable { case student, standard, baito }
        var era: Era = .western
        var template: Template = .student
        var appeal: String?
        var wishes: String?
        /// 新卒用
        var gakuchika: String?
        var selfPr: String?
        /// アルバイト用 : jours (mon…sun), horaires, gare, trajet en minutes.
        var days: [String]?
        var hours: String?
        var station: String?
        var commute: Int?

        /// Ce qui part au serveur : seulement les cases du modèle choisi.
        var forSending: ResumeOptions {
            var o = self
            if template != .student { o.gakuchika = nil; o.selfPr = nil }
            if template != .baito { o.days = nil; o.hours = nil; o.station = nil; o.commute = nil }
            if o.days?.isEmpty == true { o.days = nil }
            if let c = o.commute, c <= 0 { o.commute = nil }
            return o
        }
    }

    /// 職務経歴書 (S12)
    struct WorkHistoryOptions: Encodable, Equatable {
        var era: ResumeOptions.Era = .western
        var summary: String?
        var skills: String?
        var selfPr: String?
    }

    enum ResumeError: Error, Equatable { case profileMissing, noWork, invalid, failed }

    /// Le PDF et son nom de fichier (japonais), ou la raison de l'échec.
    func resume(_ options: ResumeOptions) async throws -> Result<(data: Data, filename: String), ResumeError> {
        try await pdf("api/resume", options.forSending, filename: "履歴書.pdf")
    }

    func workHistory(_ options: WorkHistoryOptions) async throws -> Result<(data: Data, filename: String), ResumeError> {
        try await pdf("api/work-history", options, filename: "職務経歴書.pdf")
    }

    private func pdf(_ path: String, _ options: some Encodable, filename: String) async throws -> Result<(data: Data, filename: String), ResumeError> {
        let (data, status) = try await raw("POST", path, body: try JSONEncoder().encode(options))
        switch status {
        case 200: return .success((data, filename))
        case 401: throw APIError.unauthorized
        case 404: return .failure(.profileMissing)
        case 400:
            return .failure((try? JSONDecoder().decode(ErrorBody.self, from: data))?.error == "no_work" ? .noWork : .invalid)
        default: return .failure(.failed)
        }
    }

    /// Supprime le compte et toutes ses données (S25).
    func deleteAccount() async throws {
        try await send("DELETE", "api/me")
    }

    // MARK: Entraînement aux entretiens (S17–S19)

    func interviews() async throws -> [InterviewListItem] {
        try decode([InterviewListItem].self, from: try await send("GET", "api/interviews"))
    }

    func interview(_ id: String) async throws -> Interview {
        try decode(Interview.self, from: try await send("GET", "api/interviews/\(id)"))
    }

    func interviewUsage() async throws -> Usage {
        try decode(Usage.self, from: try await send("GET", "api/interview-usage"))
    }

    func deleteInterview(_ id: String) async throws {
        try await send("DELETE", "api/interviews/\(id)")
    }

    func startInterview(applicationId: String?, stepId: String? = nil, stage: InterviewStage, language: HelpLanguage) async throws -> Result<Interview, InterviewRefusal> {
        struct Body: Encodable { let applicationId: String?; let stepId: String?; let stage: InterviewStage; let language: String }
        return try await interviewCall("api/interviews", Body(applicationId: applicationId, stepId: stepId, stage: stage, language: language.rawValue))
    }

    func answerInterview(_ id: String, answer: String, durationSec: Int?, spoken: Bool) async throws -> Result<Interview, InterviewRefusal> {
        struct Body: Encodable { let answer: String; let durationSec: Int?; let spoken: Bool }
        return try await interviewCall("api/interviews/\(id)/answers", Body(answer: answer, durationSec: durationSec, spoken: spoken))
    }

    func finishInterview(_ id: String) async throws -> Result<Interview, InterviewRefusal> {
        try await interviewCall("api/interviews/\(id)/finish", [String: String]())
    }

    private func interviewCall(_ path: String, _ body: some Encodable) async throws -> Result<Interview, InterviewRefusal> {
        let (data, status) = try await raw("POST", path, body: try JSONEncoder().encode(body))
        if (200..<300).contains(status) { return .success(try decode(Interview.self, from: data)) }
        if status == 401 { throw APIError.unauthorized }
        let refusal = try? JSONDecoder().decode(RefusalBody.self, from: data)
        switch (status, refusal?.error) {
        case (_, "limit"):
            let date = refusal?.retryAfter.flatMap { ISO8601DateFormatter.withFractions.date(from: $0) }
            return .failure(.limit(reason: refusal?.reason ?? "day", retryAfter: date))
        case (400, _): return .failure(.invalid)
        case (404, _): return .failure(.notFound)
        case (409, _): return .failure(.finished)
        case (_, "ai_not_configured"): return .failure(.notConfigured)
        default: return .failure(.failed)
        }
    }

    // MARK: Notifications push (S26)

    /// Enregistre le jeton APNs de l'iPhone ; renvoie true si le serveur enverra les rappels.
    func registerDevice(token: String, environment: String) async throws -> Bool {
        // La langue du globe : le serveur écrit ses notifications dans cette langue.
        struct Body: Encodable { let token: String; let environment: String; var language = HelpLanguage.saved.rawValue }
        struct Reply: Decodable { let push: String }
        let data = try await send("POST", "api/devices", body: try JSONEncoder().encode(Body(token: token, environment: environment)))
        return try decode(Reply.self, from: data).push == "on"
    }

    /// À la déconnexion : cet iPhone ne recevra plus les rappels du compte.
    func unregisterDevice(token: String) async throws {
        try await send("DELETE", "api/devices/\(token)")
    }

    /// Requête brute : données et code HTTP, sans interprétation.
    private func raw(_ method: String, _ path: String, body: Data? = nil) async throws -> (Data, Int) {
        // Un « ?… » éventuel est une requête, pas une partie du chemin (sinon il serait encodé).
        let parts = path.split(separator: "?", maxSplits: 1).map(String.init)
        var url = baseURL.appending(path: parts[0])
        if parts.count == 2, var components = URLComponents(url: url, resolvingAgainstBaseURL: false) {
            components.percentEncodedQuery = parts[1]
            url = components.url ?? url
        }
        var request = URLRequest(url: url)
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

    /// Pour les extensions (NewFeatures.swift) : même gestion des erreurs que les autres appels.
    @discardableResult
    func sendRaw(_ method: String, _ path: String, body: Data? = nil) async throws -> Data {
        try await send(method, path, body: body)
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

/// Corps d'erreur de l'API : { "error": "…" }.
private struct ErrorBody: Decodable { let error: String? }

/// Refus d'une fonction IA : limite atteinte (avec la date de reprise), IA indisponible…
/// Déclaré ici : Swift n'accepte pas un type dans une fonction générique (interviewCall).
private struct RefusalBody: Decodable { let error: String?; let reason: String?; let retryAfter: String? }

extension ISO8601DateFormatter {
    /// Dates de l'API (« 2026-10-21T00:00:00.000Z »), avec les millisecondes.
    static let withFractions: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}
