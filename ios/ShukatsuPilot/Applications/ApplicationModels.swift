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
    /// 法人番号 et adresse du siège : la candidature est reliée à la fiche officielle (gBizINFO).
    var corporateNumber: String?
    var location: String?
    /// やりとり (journal des échanges) et フォローアップ (relances datées) ; absents des anciennes candidatures.
    var events: [AppEvent]?
    var followUps: [FollowUp]?
    /// 面接の振り返り : enregistrés à part de la fiche (voir DebriefsView).
    var debriefs: [Debrief]?
    /// 内定後の手続き : étapes cochées (identifiants de naitei-guide.json).
    var offerChecklist: [String]?

    struct Step: Codable, Equatable, Identifiable {
        var id = UUID().uuidString
        var type = "es"
        var dueDate: String?
        /// Heure (HH:MM, heure du Japon), surtout pour les entretiens : rappel d'encouragement 1 h avant.
        var time: String?
        var done = false
        var note: String?
        /// Lieu de l'entretien (adresse : la météo y est calculée) ou lien d'un entretien en ligne.
        var place: String?

        /// Un lien plutôt qu'une adresse : entretien en ligne.
        var isOnline: Bool { place.map { $0.lowercased().hasPrefix("http://") || $0.lowercased().hasPrefix("https://") } ?? false }
    }
}

/// Ce qu'on envoie pour créer ou modifier une candidature.
/// Un échange avec l'entreprise : メール, 電話, 説明会, OB・OG訪問, 面談, その他.
struct AppEvent: Codable, Equatable, Identifiable {
    var id = UUID().uuidString
    var date: String
    var kind = "email"
    var note: String?

    static let kinds: [(id: String, ja: String, en: String, fr: String)] = [
        ("email", "メール", "Email", "E-mail"), ("call", "電話", "Call", "Appel"), ("seminar", "説明会", "Info session", "Session d'information"),
        ("ob", "OB・OG訪問", "Alumni visit", "Rencontre avec un ancien"), ("meeting", "面談", "Meeting", "Rendez-vous"), ("other", "その他", "Other", "Autre"),
    ]
    static func kindName(_ id: String) -> String { kinds.first { $0.id == id }.map { tr($0.ja, $0.en, $0.fr) } ?? id }
}

/// 面接の振り返り : notes prises après un vrai entretien, et les conseils que l'IA en a tirés.
struct Debrief: Codable, Equatable, Identifiable {
    struct Advice: Codable, Equatable {
        let language: String
        let summary: String
        let tips: [String]
        let practice: [String]
        let createdAt: String
    }
    var id = UUID().uuidString
    var stepId: String?
    var date: String
    var questions = ""
    var good: String?
    var improve: String?
    var advice: Advice?

    var isEmpty: Bool { [questions, good ?? "", improve ?? ""].allSatisfy { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty } }
}

/// 内定後の手続き : le même fichier que le web (web/public/naitei-guide.json), téléchargé depuis le site.
struct OfferGuide: Decodable, Equatable {
    struct Step: Decodable, Equatable, Identifiable {
        let id: String
        let title: Text3
        let when: Text3
        let detail: Text3
        let items: [Text3]?
        let links: [Link]?
    }
    struct Link: Decodable, Equatable {
        let label: Text3
        let url: URL
    }
    struct Note: Decodable, Equatable {
        let title: Text3
        let detail: Text3
    }
    let updated: String
    let intro: Text3
    let disclaimer: Text3
    let steps: [Step]
    let notes: [Note]
}

/// Une relance datée (« 人事にお礼メール »), rappelée comme une échéance.
struct FollowUp: Codable, Equatable, Identifiable {
    var id = UUID().uuidString
    var date: String
    var note = ""
    var done = false
}

struct JobApplicationInput: Encodable, Equatable {
    var company = ""
    var position: String?
    var url: String?
    var status = "interested"
    var steps: [JobApplication.Step] = []
    var industry: String?
    var companyType: String?
    var notes: String?
    var corporateNumber: String?
    var location: String?
    /// Envoyés seulement quand on les modifie (nil : l'API garde ce qu'elle a).
    var events: [AppEvent]?
    var followUps: [FollowUp]?

    init() {}
    init(_ app: JobApplication) {
        company = app.company; position = app.position; url = app.url; status = app.status; steps = app.steps
        industry = app.industry; companyType = app.companyType; notes = app.notes
        corporateNumber = app.corporateNumber; location = app.location
        events = app.events ?? []; followUps = app.followUps ?? []
    }

    private enum CodingKeys: String, CodingKey { case company, position, url, status, steps, industry, companyType, notes, corporateNumber, location, events, followUps }

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
        // Comme 業界 : null défait le lien avec la fiche officielle.
        try c.encode(corporateNumber, forKey: .corporateNumber)
        try c.encode(location, forKey: .location)
        try c.encodeIfPresent(events, forKey: .events)
        try c.encodeIfPresent(followUps?.filter { !$0.note.trimmingCharacters(in: .whitespaces).isEmpty }, forKey: .followUps)
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
        .init(id: "applied", ja: "応募済み", en: "Applied", fr: "Postulé"),
        .init(id: "test", ja: "適性検査", en: "Aptitude test", fr: "Test d'aptitude"), .init(id: "interview1", ja: "一次面接", en: "1st interview", fr: "1er entretien"),
        .init(id: "interview2", ja: "二次面接", en: "2nd interview", fr: "2e entretien"), .init(id: "final", ja: "最終面接", en: "Final interview", fr: "Entretien final"),
        .init(id: "offer", ja: "内定", en: "Offer", fr: "Offre"),
    ]
    static let closed: [Stage] = [.init(id: "rejected", ja: "不合格", en: "Rejected", fr: "Refusé"), .init(id: "withdrawn", ja: "辞退", en: "Withdrawn", fr: "Désisté")]
    static let all = flow + closed
    /// Types d'étape datée (tout sauf « 気になる »).
    static let stepTypes = Array(flow.dropFirst())

    /// « Postulée » : candidature envoyée, sans réponse pour l'instant (étape 応募済み).
    static func isWaiting(_ status: String) -> Bool { status == "applied" }

    /// Recherche dans le nom, le poste et les notes, sans tenir compte des majuscules.
    static func matches(_ app: JobApplication, _ query: String) -> Bool {
        let q = query.trimmingCharacters(in: .whitespaces)
        return q.isEmpty || [app.company, app.position, app.notes].contains { $0?.localizedCaseInsensitiveContains(q) ?? false }
    }

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
