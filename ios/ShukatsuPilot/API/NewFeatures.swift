import Foundation

/// Un texte dans les trois langues (articles et actualités de l'onglet « 情報 »).
struct Text3: Codable, Equatable {
    let ja: String
    let en: String
    let fr: String
    var current: String { tr(ja, en, fr) }
}

/// Événement, objectif ou note de l'agenda (calendrier de l'accueil).
struct Plan: Codable, Equatable, Identifiable {
    let id: String
    var kind: String
    var title: String
    var date: String
    var time: String?
    var note: String?
    var done: Bool
}

struct PlanInput: Encodable {
    var kind: String
    var title: String
    var date: String
    var time: String?
}

/// Une carte de l'onglet « 情報 ».
struct InfoCard: Codable, Equatable, Identifiable {
    let id: String
    let kind: String
    let date: String
    let title: Text3
    let summary: Text3
    let body: String?
    let link: String?
    let source: String?
}

struct InfoPageData: Codable, Equatable {
    struct Source: Codable, Equatable, Identifiable { let id: String; let name: String }
    let items: [InfoCard]
    let page: Int
    let pages: Int
    let total: Int
    let sources: [Source]
    let articles: [InfoCard]
}

extension APIClient {
    // MARK: Agenda (événements, objectifs, notes)

    func plans() async throws -> [Plan] {
        try JSONDecoder().decode([Plan].self, from: try await sendRaw("GET", "api/plans"))
    }

    func createPlan(_ input: PlanInput) async throws -> Plan {
        try JSONDecoder().decode(Plan.self, from: try await sendRaw("POST", "api/plans", body: try JSONEncoder().encode(input)))
    }

    func setPlanDone(_ id: String, _ done: Bool) async throws -> Plan {
        try JSONDecoder().decode(Plan.self, from: try await sendRaw("PUT", "api/plans/\(id)", body: try JSONEncoder().encode(["done": done])))
    }

    func deletePlan(_ id: String) async throws {
        _ = try await sendRaw("DELETE", "api/plans/\(id)")
    }

    // MARK: Onglet « 情報 »

    func info(page: Int, source: String?) async throws -> InfoPageData {
        let query = "api/info?page=\(page)" + (source.map { "&source=\($0)" } ?? "")
        return try JSONDecoder().decode(InfoPageData.self, from: try await sendRaw("GET", query))
    }
}

extension ISO8601DateFormatter {
    /// Date du jour (AAAA-MM-JJ) dans le fuseau de l'iPhone.
    static let dayOnly: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withFullDate]
        f.timeZone = .current
        return f
    }()
}
