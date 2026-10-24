import Foundation
import Observation

/// Un élément du calendrier de l'accueil : étape d'une candidature, ou événement / objectif / note.
struct AgendaItem: Identifiable, Equatable {
    enum Kind: String { case interview, step, event, goal, note }
    let id: String
    let date: String
    let time: String?
    let kind: Kind
    let title: String
    let detail: String?
    let done: Bool
    var plan: Plan?
    var applicationId: String?
    var stepId: String?

    var kindName: String {
        switch kind {
        case .interview: tr("面接", "Interview", "Entretien")
        case .step: tr("選考・締切", "Deadline", "Échéance")
        case .event: tr("予定", "Event", "Événement")
        case .goal: tr("目標", "Goal", "Objectif")
        case .note: tr("メモ", "Note", "Note")
        }
    }
}

enum Agenda {
    private static let interviews: Set<String> = ["interview1", "interview2", "final"]
    private static let closed: Set<String> = ["rejected", "withdrawn"]
    private static let order: [AgendaItem.Kind: Int] = [.interview: 0, .goal: 1, .step: 2, .event: 3, .note: 4]

    /// Tout ce qui a une date, trié par jour puis heure (mêmes règles que le site).
    static func build(_ apps: [JobApplication], _ plans: [Plan]) -> [AgendaItem] {
        let steps = apps.filter { !closed.contains($0.status) }.flatMap { app in
            app.steps.compactMap { step -> AgendaItem? in
                guard let date = step.dueDate else { return nil }
                return AgendaItem(id: "step-\(app.id)-\(step.id)", date: date, time: nil,
                                  kind: interviews.contains(step.type) ? .interview : .step,
                                  title: app.company, detail: SelectionStage.name(step.type), done: step.done,
                                  applicationId: app.id, stepId: step.id)
            }
        }
        let own = plans.map { p in
            AgendaItem(id: "plan-\(p.id)", date: p.date, time: p.kind == "event" ? p.time : nil,
                       kind: AgendaItem.Kind(rawValue: p.kind) ?? .event, title: p.title, detail: nil, done: p.done, plan: p)
        }
        return (steps + own).sorted {
            ($0.date, $0.time ?? "99", order[$0.kind] ?? 9) < ($1.date, $1.time ?? "99", order[$1.kind] ?? 9)
        }
    }

    /// Les semaines d'un mois, du dimanche au samedi (calendrier japonais).
    static func weeks(year: Int, month: Int, calendar: Calendar = .current) -> [[Date]] {
        guard let first = calendar.date(from: DateComponents(year: year, month: month, day: 1)) else { return [] }
        let offset = calendar.component(.weekday, from: first) - 1
        guard var day = calendar.date(byAdding: .day, value: -offset, to: first) else { return [] }
        var weeks: [[Date]] = []
        repeat {
            var week: [Date] = []
            for _ in 0..<7 {
                week.append(day)
                day = calendar.date(byAdding: .day, value: 1, to: day) ?? day
            }
            weeks.append(week)
        } while calendar.component(.month, from: day) == month
        return weeks
    }

    static func key(_ date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }
}

/// État de l'accueil : candidatures et agenda, mois affiché, jour choisi.
@MainActor
@Observable
final class HomeModel {
    private(set) var applications: [JobApplication] = []
    private(set) var plans: [Plan] = []
    private(set) var loaded = false
    var month: DateComponents
    var selected: String
    var message: String?

    let api: APIClient

    init(api: APIClient, today: Date = .now) {
        self.api = api
        month = Calendar.current.dateComponents([.year, .month], from: today)
        selected = Agenda.key(today)
    }

    var agenda: [AgendaItem] { Agenda.build(applications, plans) }
    var today: String { Agenda.key(.now) }
    func items(on day: String) -> [AgendaItem] { agenda.filter { $0.date == day } }
    var nextInterview: AgendaItem? { agenda.first { $0.kind == .interview && !$0.done && $0.date >= today } }
    var goals: [Plan] { plans.filter { $0.kind == "goal" && !$0.done && $0.date >= today }.sorted { $0.date < $1.date } }

    func load() async {
        async let apps = try? api.applications()
        async let own = try? api.plans()
        applications = await apps ?? applications
        plans = await own ?? plans
        loaded = true
        await DeadlineReminderScheduler.shared.reschedule(applications)
    }

    func shift(_ delta: Int) {
        let cal = Calendar.current
        guard let current = cal.date(from: month), let next = cal.date(byAdding: .month, value: delta, to: current) else { return }
        month = cal.dateComponents([.year, .month], from: next)
    }

    func goToday() {
        month = Calendar.current.dateComponents([.year, .month], from: .now)
        selected = today
    }

    @discardableResult
    func add(kind: String, title: String, time: String?) async -> Bool {
        let text = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return false }
        do {
            let plan = try await api.createPlan(PlanInput(kind: kind, title: text, date: selected, time: kind == "event" ? time : nil))
            plans.append(plan)
            message = nil
            return true
        } catch {
            message = tr("追加できませんでした", "Could not add", "Ajout impossible")
            return false
        }
    }

    func toggle(_ plan: Plan) async {
        guard let updated = try? await api.setPlanDone(plan.id, !plan.done) else { return }
        plans = plans.map { $0.id == plan.id ? updated : $0 }
    }

    func delete(_ plan: Plan) async {
        try? await api.deletePlan(plan.id)
        plans.removeAll { $0.id == plan.id }
    }
}
