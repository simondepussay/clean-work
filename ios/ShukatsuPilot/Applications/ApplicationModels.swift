import Foundation

/// Une candidature (S07), au format de l'API.
struct JobApplication: Codable, Equatable, Identifiable {
    var id: String
    var company: String
    var position: String?
    var url: String?
    var status: String
    var steps: [Step]
    var nextDeadline: String?
    /// 業界, type d'entreprise et notes : pour adapter l'entraînement aux entretiens.
    var industry: String?
    var companyType: String?
    var notes: String?

    struct Step: Codable, Equatable, Identifiable {
        var id = UUID().uuidString
        var type = "es"
        var dueDate: String?
        var done = false
        var note: String?
    }
}

/// Ce qu'on envoie pour créer ou modifier une candidature.
struct JobApplicationInput: Encodable, Equatable {
    var company = ""
    var position: String?
    var url: String?
    var status = "interested"
    var steps: [JobApplication.Step] = []
    var industry: String?
    var companyType: String?
    var notes: String?

    init() {}
    init(_ app: JobApplication) {
        company = app.company; position = app.position; url = app.url; status = app.status; steps = app.steps
        industry = app.industry; companyType = app.companyType; notes = app.notes
    }

    private enum CodingKeys: String, CodingKey { case company, position, url, status, steps, industry, companyType, notes }

    /// 業界 et type sont toujours envoyés, null compris : null efface le choix côté API
    /// (Swift omet les nil, et l'ancienne valeur resterait).
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(company, forKey: .company)
        try c.encodeIfPresent(position, forKey: .position)
        try c.encodeIfPresent(url, forKey: .url)
        try c.encode(status, forKey: .status)
        try c.encode(steps, forKey: .steps)
        try c.encode(industry, forKey: .industry)
        try c.encode(companyType, forKey: .companyType)
        try c.encodeIfPresent(notes, forKey: .notes)
    }
}

/// Étapes du 就活 (mêmes codes et même ordre que l'API et le web).
enum SelectionStage {
    struct Stage: Identifiable {
        let id: String; let ja: String; let en: String; var fr = ""
        /// Dans la langue choisie (globe).
        var name: String { tr(ja, en, fr.isEmpty ? en : fr) }
    }

    static let flow: [Stage] = [
        .init(id: "interested", ja: "気になる", en: "Interested", fr: "Intéressé"), .init(id: "es", ja: "ES", en: "Entry sheet", fr: "ES"),
        .init(id: "test", ja: "適性検査", en: "Aptitude test", fr: "Test d'aptitude"), .init(id: "interview1", ja: "一次面接", en: "1st interview", fr: "1er entretien"),
        .init(id: "interview2", ja: "二次面接", en: "2nd interview", fr: "2e entretien"), .init(id: "final", ja: "最終面接", en: "Final interview", fr: "Entretien final"),
        .init(id: "offer", ja: "内定", en: "Offer", fr: "Offre"),
    ]
    static let closed: [Stage] = [.init(id: "rejected", ja: "不合格", en: "Rejected", fr: "Refusé"), .init(id: "withdrawn", ja: "辞退", en: "Withdrawn", fr: "Désisté")]
    static let all = flow + closed
    /// Types d'étape datée (tout sauf « 気になる »).
    static let stepTypes = Array(flow.dropFirst())

    /// Nom d'une étape dans la langue choisie.
    static func name(_ id: String) -> String { all.first { $0.id == id }?.name ?? id }

    static func label(_ id: String) -> String {
        name(id)
    }

    /// Étape suivante ou précédente ; jamais de passage automatique vers « 終了 ».
    static func neighbour(of status: String, _ direction: Int) -> String? {
        guard let i = flow.firstIndex(where: { $0.id == status }) else { return nil }
        let j = i + direction
        return flow.indices.contains(j) ? flow[j].id : nil
    }

    /// Jours restants avant une date AAAA-MM-JJ, en dates locales (0 = aujourd'hui).
    static func daysUntil(_ date: String, from today: Date = .now, calendar: Calendar = .current) -> Int? {
        let parts = date.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, let target = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])) else { return nil }
        return calendar.dateComponents([.day], from: calendar.startOfDay(for: today), to: target).day
    }

    static func deadlineLabel(_ days: Int) -> String {
        switch days {
        case 0: tr("今日", "today", "aujourd'hui")
        case 1: tr("明日", "tomorrow", "demain")
        default: tr("あと\(days)日", "\(days) days left", "encore \(days) j")
        }
    }
}

/// 業界 et types d'entreprise (mêmes codes que l'API et le web).
enum CompanyProfile {
    struct Option: Identifiable {
        let id: String; let ja: String; let en: String; let fr: String
        var name: String { tr(ja, en, fr) }
    }

    static let industries: [Option] = [
        .init(id: "it", ja: "IT・通信", en: "IT & telecom", fr: "IT et télécoms"),
        .init(id: "maker", ja: "メーカー", en: "Manufacturing", fr: "Industrie"),
        .init(id: "trading", ja: "商社", en: "Trading", fr: "Maison de commerce"),
        .init(id: "finance", ja: "金融", en: "Finance", fr: "Finance"),
        .init(id: "consulting", ja: "コンサル", en: "Consulting", fr: "Conseil"),
        .init(id: "retail", ja: "小売・流通", en: "Retail", fr: "Commerce et distribution"),
        .init(id: "service", ja: "サービス・人材", en: "Services & HR", fr: "Services et RH"),
        .init(id: "media", ja: "広告・マスコミ", en: "Advertising & media", fr: "Publicité et médias"),
        .init(id: "infrastructure", ja: "インフラ・交通", en: "Infrastructure & transport", fr: "Infrastructures et transports"),
        .init(id: "public", ja: "官公庁・団体", en: "Public sector", fr: "Secteur public"),
        .init(id: "other", ja: "その他", en: "Other", fr: "Autre"),
    ]

    static let types: [Option] = [
        .init(id: "large", ja: "大手", en: "Large company", fr: "Grande entreprise"),
        .init(id: "sme", ja: "中小企業", en: "Small / medium", fr: "PME"),
        .init(id: "startup", ja: "ベンチャー", en: "Startup", fr: "Start-up"),
        .init(id: "foreign", ja: "外資系", en: "Foreign-owned", fr: "Entreprise étrangère"),
    ]
}
