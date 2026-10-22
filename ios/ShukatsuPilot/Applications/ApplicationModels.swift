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

    init() {}
    init(_ app: JobApplication) {
        company = app.company; position = app.position; url = app.url; status = app.status; steps = app.steps
    }
}

/// Étapes du 就活 (mêmes codes et même ordre que l'API et le web).
enum SelectionStage {
    struct Stage: Identifiable { let id: String; let ja: String; let en: String }

    static let flow: [Stage] = [
        .init(id: "interested", ja: "気になる", en: "Interested"), .init(id: "es", ja: "ES", en: "Entry sheet"),
        .init(id: "test", ja: "適性検査", en: "Aptitude test"), .init(id: "interview1", ja: "一次面接", en: "1st interview"),
        .init(id: "interview2", ja: "二次面接", en: "2nd interview"), .init(id: "final", ja: "最終面接", en: "Final interview"),
        .init(id: "offer", ja: "内定", en: "Offer"),
    ]
    static let closed: [Stage] = [.init(id: "rejected", ja: "不合格", en: "Rejected"), .init(id: "withdrawn", ja: "辞退", en: "Withdrawn")]
    static let all = flow + closed
    /// Types d'étape datée (tout sauf « 気になる »).
    static let stepTypes = Array(flow.dropFirst())

    static func label(_ id: String) -> String {
        all.first { $0.id == id }.map { "\($0.ja) / \($0.en)" } ?? id
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
        case 0: "今日 / today"
        case 1: "明日 / tomorrow"
        default: "あと\(days)日 / \(days) days left"
        }
    }
}
