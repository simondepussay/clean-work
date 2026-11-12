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

// MARK: Mails de 就活 rédigés par l'IA (お礼, 日程調整, 辞退…)

struct EmailDraft: Decodable, Equatable {
    struct Point: Decodable, Equatable, Identifiable {
        let expression: String
        let meaning: String
        var id: String { expression }
    }
    var subject: String
    var body: String
    let points: [Point]
    let remaining: Usage?
}

enum EmailKind: String, CaseIterable, Identifiable {
    case thanks, schedule, reschedule, inquiry, decline, acceptOffer, declineOffer
    var id: String { rawValue }

    var name: String {
        switch self {
        case .thanks: tr("面接のお礼", "Thank-you after an interview", "Remerciement après un entretien")
        case .schedule: tr("日程調整", "Arrange a date", "Fixer une date")
        case .reschedule: tr("日程変更のお願い", "Ask to change the date", "Demander un changement de date")
        case .inquiry: tr("問い合わせ", "Ask a question", "Poser une question")
        case .decline: tr("選考辞退", "Withdraw from the selection", "Se retirer de la sélection")
        case .acceptOffer: tr("内定承諾", "Accept the offer", "Accepter l'offre")
        case .declineOffer: tr("内定辞退", "Decline the offer", "Refuser l'offre")
        }
    }

    /// Ce que l'étudiant peut préciser pour ce mail.
    var hint: String {
        switch self {
        case .thanks: tr("面接で印象に残ったこと（任意）", "What stayed with you from the interview (optional)", "Ce qui vous a marqué pendant l'entretien (facultatif)")
        case .schedule: tr("都合のよい日時（例：11/20 午後）", "When you are free (e.g. 11/20 afternoon)", "Vos disponibilités (ex. : 20/11 après-midi)")
        case .reschedule: tr("理由と、代わりに都合のよい日時", "The reason, and when you are free instead", "La raison, et vos autres disponibilités")
        case .inquiry: tr("聞きたいこと", "What you want to ask", "Ce que vous voulez demander")
        case .decline, .declineOffer: tr("伝えたいこと（任意）", "Anything to mention (optional)", "À mentionner (facultatif)")
        case .acceptOffer: tr("確認したいこと（任意）", "Anything to confirm (optional)", "À confirmer (facultatif)")
        }
    }

    /// Le mail parle d'une étape précise (l'entretien dont on remercie, celui qu'on déplace).
    var needsStep: Bool { self == .thanks || self == .reschedule }
}

enum EmailRefusal: Error, Equatable {
    case limit(reason: String, retryAfter: Date?)
    case notConfigured
    case failed

    var message: String {
        switch self {
        case .limit(let reason, let date):
            let day = date.map { $0.formatted(date: .abbreviated, time: .omitted) } ?? ""
            return reason == "budget"
                ? tr("今月のAI機能は終了しました（\(day)から再開）", "AI features are paused until \(day)", "Les fonctions IA reprennent le \(day)")
                : tr("回数の上限です（\(day)から使えます）", "Limit reached, available again on \(day)", "Limite atteinte, de nouveau disponible le \(day)")
        case .notConfigured: return tr("この機能は準備中です", "This feature is not available yet", "Cette fonction n'est pas encore disponible")
        case .failed: return tr("作成に失敗しました。回数は使われていません", "Writing failed; it was not counted", "La rédaction a échoué ; elle n'a pas été comptée")
        }
    }
}

extension APIClient {
    func emailUsage() async throws -> Usage {
        try JSONDecoder().decode(Usage.self, from: try await sendRaw("GET", "api/email-usage"))
    }

    /// Un mail pour une candidature ; un refus (limite, IA indisponible) n'est pas une erreur réseau.
    func writeEmail(applicationId: String, kind: EmailKind, stepId: String?, details: String?, language: HelpLanguage) async -> Result<EmailDraft, EmailRefusal> {
        struct Body: Encodable { let kind: String; let language: String; let stepId: String?; let details: String? }
        struct Refusal: Decodable { let error: String?; let reason: String?; let retryAfter: String? }
        do {
            let body = try JSONEncoder().encode(Body(kind: kind.rawValue, language: language.rawValue, stepId: stepId, details: details))
            let (data, status) = try await sendUnchecked("POST", "api/applications/\(applicationId)/email", body: body)
            if (200..<300).contains(status), let draft = try? JSONDecoder().decode(EmailDraft.self, from: data) { return .success(draft) }
            let refusal = try? JSONDecoder().decode(Refusal.self, from: data)
            switch refusal?.error {
            case "limit":
                let date = refusal?.retryAfter.flatMap { ISO8601DateFormatter.withFractions.date(from: $0) }
                return .failure(.limit(reason: refusal?.reason ?? "day", retryAfter: date))
            case "ai_not_configured": return .failure(.notConfigured)
            default: return .failure(.failed)
            }
        } catch {
            return .failure(.failed)
        }
    }
}

// MARK: 面接の振り返り (bilan après un vrai entretien)

extension APIClient {
    func debriefUsage() async throws -> Usage {
        try JSONDecoder().decode(Usage.self, from: try await sendRaw("GET", "api/debrief-usage"))
    }

    /// Enregistre les bilans d'une candidature, sans toucher au reste de la fiche.
    func saveDebriefs(applicationId: String, _ debriefs: [Debrief]) async throws -> JobApplication {
        let body = try JSONEncoder().encode(["debriefs": debriefs])
        return try JSONDecoder().decode(JobApplication.self, from: try await sendRaw("PUT", "api/applications/\(applicationId)", body: body))
    }

    /// Conseils de l'IA pour un bilan déjà enregistré ; ils reviennent rangés dans la candidature.
    func adviseDebrief(applicationId: String, debriefId: String, language: HelpLanguage) async -> Result<(application: JobApplication, remaining: Usage?), EmailRefusal> {
        struct Reply: Decodable { let application: JobApplication; let remaining: Usage? }
        struct Refusal: Decodable { let error: String?; let reason: String?; let retryAfter: String? }
        do {
            let body = try JSONEncoder().encode(["language": language.rawValue])
            let (data, status) = try await sendUnchecked("POST", "api/applications/\(applicationId)/debriefs/\(debriefId)/advice", body: body)
            if (200..<300).contains(status), let reply = try? JSONDecoder().decode(Reply.self, from: data) { return .success((reply.application, reply.remaining)) }
            let refusal = try? JSONDecoder().decode(Refusal.self, from: data)
            switch refusal?.error {
            case "limit":
                let date = refusal?.retryAfter.flatMap { ISO8601DateFormatter.withFractions.date(from: $0) }
                return .failure(.limit(reason: refusal?.reason ?? "day", retryAfter: date))
            case "ai_not_configured": return .failure(.notConfigured)
            default: return .failure(.failed)
            }
        } catch {
            return .failure(.failed)
        }
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
