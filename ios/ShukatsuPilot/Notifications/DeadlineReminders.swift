import Foundation
import UIKit
import UserNotifications

/// Une échéance à venir (S09) : étape non terminée d'une candidature en cours.
struct Deadline: Equatable {
    let applicationId: String
    let stepId: String
    let company: String
    let step: String
    let date: String
    let days: Int
    /// Pour une relance (step « followup ») : ce qu'il faut faire.
    var note: String? = nil
}

enum Deadlines {
    private static let closed: Set<String> = ["rejected", "withdrawn"]

    /// Mêmes règles que le web : non terminées, aujourd'hui ou plus tard, la plus proche d'abord.
    static func upcoming(_ apps: [JobApplication], from today: Date = .now, within days: Int = .max, calendar: Calendar = .current) -> [Deadline] {
        apps.filter { !closed.contains($0.status) }
            .flatMap { app in
                app.steps.compactMap { step -> Deadline? in
                    guard !step.done, let date = step.dueDate,
                          let left = SelectionStage.daysUntil(date, from: today, calendar: calendar), left >= 0, left <= days else { return nil }
                    return Deadline(applicationId: app.id, stepId: step.id, company: app.company, step: step.type, date: date, days: left)
                }
                // Les relances (フォローアップ) se rappellent comme des échéances.
                + (app.followUps ?? []).compactMap { f -> Deadline? in
                    guard !f.done, let left = SelectionStage.daysUntil(f.date, from: today, calendar: calendar), left >= 0, left <= days else { return nil }
                    return Deadline(applicationId: app.id, stepId: f.id, company: app.company, step: "followup", date: f.date, days: left, note: f.note)
                }
            }
            .sorted { ($0.date, $0.company) < ($1.date, $1.company) }
    }

    static func stepName(_ step: String) -> String {
        step == "followup" ? tr("フォローアップ", "Follow-up", "Relance") : SelectionStage.name(step)
    }
}

/// Un rappel local à programmer.
struct Reminder: Equatable {
    let id: String
    let title: String
    let body: String
    let fireAt: DateComponents
}

/// Rappels locaux des échéances : la veille à 9 h et le jour même à 8 h.
/// Pas de serveur ni de clé APNs : l'app programme les rappels elle-même.
/// Depuis S26, c'est le filet de sécurité quand le serveur n'envoie pas les rappels push.
enum DeadlineReminders {
    static let prefix = "deadline."
    /// iOS garde au plus 64 rappels par app : 30 échéances × 2.
    static let maxDeadlines = 30

    static func reminders(for apps: [JobApplication], now: Date = .now, calendar: Calendar = .current) -> [Reminder] {
        Deadlines.upcoming(apps, from: now, calendar: calendar).prefix(maxDeadlines).flatMap { d -> [Reminder] in
            let parts = d.date.split(separator: "-").compactMap { Int($0) }
            guard parts.count == 3, let day = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])) else { return [] }
            let what = "\(d.company)：\(Deadlines.stepName(d.step))" + (d.note.map { "（\($0)）" } ?? "")
            let candidates: [(String, Date?, String, String)] = [
                ("eve", calendar.date(byAdding: DateComponents(day: -1, hour: 9), to: day), tr("明日締切", "Due tomorrow", "Échéance demain"), what),
                ("day", calendar.date(byAdding: DateComponents(hour: 8), to: day), tr("今日締切", "Due today", "Échéance aujourd'hui"), what),
            ]
            return candidates.compactMap { kind, fire, title, body in
                guard let fire, fire > now else { return nil }
                return Reminder(id: "\(prefix)\(d.stepId).\(kind)", title: title, body: body,
                                fireAt: calendar.dateComponents([.year, .month, .day, .hour, .minute], from: fire))
            }
        }
    }
}

/// Encouragement 1 h avant un entretien dont l'heure est connue. Programmé par l'iPhone (à la minute près),
/// même quand le serveur envoie les autres rappels : le serveur, lui, ne tourne qu'une fois par jour.
enum InterviewReminders {
    static let prefix = "interview."
    /// Les plus proches seulement : iOS garde au plus 64 rappels par app (60 pour les échéances).
    static let max = 4
    private static let interviews: Set<String> = ["interview1", "interview2", "final"]
    private static let closed: Set<String> = ["rejected", "withdrawn"]

    static func reminders(for apps: [JobApplication], weather: [String: DayWeather] = [:], now: Date = .now, calendar: Calendar = .current) -> [Reminder] {
        // Dates et heures saisies sont celles du Japon.
        var tokyo = Calendar(identifier: .gregorian)
        tokyo.timeZone = TimeZone(identifier: "Asia/Tokyo") ?? .current
        let items = apps.filter { !closed.contains($0.status) }.flatMap { app in
            app.steps.compactMap { step -> (Date, Reminder)? in
                guard interviews.contains(step.type), !step.done, let date = step.dueDate, let time = step.time else { return nil }
                let d = date.split(separator: "-").compactMap { Int($0) }, t = time.split(separator: ":").compactMap { Int($0) }
                guard d.count == 3, t.count == 2,
                      let start = tokyo.date(from: DateComponents(year: d[0], month: d[1], day: d[2], hour: t[0], minute: t[1])) else { return nil }
                let fire = start.addingTimeInterval(-3600)
                guard fire > now else { return nil }
                let stage = SelectionStage.name(step.type)
                // La météo du jour (Open-Meteo), quand elle appelle un conseil : parapluie, neige, chaleur.
                let advice = weather[step.id]?.advice.map { "\n" + $0 } ?? ""
                // Le lieu (ou « en ligne ») rappelé dans la notification ; le lien lui-même s'ouvre depuis l'app.
                let where_ = step.isOnline ? "\n" + tr("オンライン面接です。リンクはアプリから。", "Online interview: the link is in the app.", "Entretien en ligne : le lien est dans l'app.")
                    : step.place.map { "\n" + tr("会場：", "Venue: ", "Lieu : ") + $0 } ?? ""
                return (fire, Reminder(
                    id: "\(prefix)\(step.id)",
                    title: tr("まもなく面接です", "Interview in one hour", "Entretien dans une heure"),
                    body: tr("\(app.company)の\(stage)まであと1時間。ここまでの準備を信じて、いってらっしゃい！",
                             "\(stage) at \(app.company) in one hour. Trust the preparation you've done — you've got this!",
                             "\(stage) chez \(app.company) dans une heure. Faites confiance à votre préparation : vous êtes prêt·e !") + where_ + advice,
                    fireAt: calendar.dateComponents([.year, .month, .day, .hour, .minute], from: fire)))
            }
        }
        return items.sorted { $0.0 < $1.0 }.prefix(max).map(\.1)
    }
}

/// Ce dont on a besoin du centre de notifications (simulable dans les tests).
protocol NotificationScheduling: AnyObject {
    func authorizationAllowed() async -> Bool
    func pendingIdentifiers() async -> [String]
    func remove(_ ids: [String])
    func add(_ reminder: Reminder) async throws
    /// Demande à iOS le jeton APNs de l'iPhone (S26) ; la réponse arrive dans l'AppDelegate.
    func registerForRemoteNotifications()
}

/// Reprogramme tous les rappels : retire les anciens, ajoute les nouveaux.
@MainActor
final class DeadlineReminderScheduler {
    static let shared: DeadlineReminderScheduler = DeadlineReminderScheduler(center: SystemNotificationCenter(),
                                                  serverPushActive: { PushRegistration.shared.isServerActive })
    private let center: NotificationScheduling
    private let serverPushActive: @MainActor () -> Bool
    private let charms: @MainActor () -> [Charm]
    /// iOS ne garde que 64 rappels en attente par app.
    static let iosLimit = 64

    init(center: NotificationScheduling, serverPushActive: @escaping @MainActor () -> Bool = { false }, charms: @escaping @MainActor () -> [Charm] = { CharmStore.charms }) {
        self.center = center
        self.serverPushActive = serverPushActive
        self.charms = charms
    }

    /// Renvoie le nombre de rappels locaux programmés (0 si l'utilisateur a refusé, ou si le serveur s'en charge).
    @discardableResult
    func reschedule(_ apps: [JobApplication], weather: [String: DayWeather] = [:], now: Date = .now) async -> Int {
        if Self.demo { return 0 }
        await removeLocal()
        let interviews = InterviewReminders.reminders(for: apps, weather: weather, now: now)
        let charms = CharmReminders.reminders(for: apps, charms: charms(), now: now)
        let deadlines = DeadlineReminders.reminders(for: apps, now: now)
        // L'autorisation n'est demandée ici qu'au moment où il y a quelque chose à rappeler (sinon : prepare()).
        guard !(interviews + charms + deadlines).isEmpty, await center.authorizationAllowed() else { return 0 }
        // S26 : on (re)demande le jeton APNs.
        center.registerForRemoteNotifications()
        // L'encouragement 1 h avant un entretien et les お守りの言葉 sont toujours locaux (à la minute) ;
        // les échéances seulement si le serveur ne s'en charge pas, dans la place qui reste (iOS : 64 rappels par app).
        let personal = interviews + charms
        let reminders = serverPushActive() ? personal : personal + deadlines.prefix(max(0, Self.iosLimit - personal.count))
        var added = 0
        for r in reminders where (try? await center.add(r)) != nil { added += 1 }
        return added
    }

    /// À l'arrivée sur l'accueil : autorisation et jeton APNs, même sans échéance, car le serveur envoie
    /// aussi les rappels JLPT et les relances. Appelé par l'app seulement (jamais dans les tests unitaires,
    /// où la vraie question d'iOS attendrait une réponse indéfiniment).
    func prepare() async {
        guard !Self.demo, await center.authorizationAllowed() else { return }
        center.registerForRemoteNotifications()
    }

    /// Mode démo (-demo, builds de développement) : ni vraie question d'autorisation ni vrais rappels.
    private static var demo: Bool {
        #if DEBUG
        DemoMode.isOn
        #else
        false
        #endif
    }

    /// Retire nos rappels locaux (et seulement les nôtres).
    func removeLocal() async {
        center.remove(await center.pendingIdentifiers().filter {
            $0.hasPrefix(DeadlineReminders.prefix) || $0.hasPrefix(InterviewReminders.prefix) || $0.hasPrefix(CharmReminders.prefix)
        })
    }
}

/// Implémentation réelle avec UNUserNotificationCenter.
final class SystemNotificationCenter: NotificationScheduling {
    private let center = UNUserNotificationCenter.current()

    func authorizationAllowed() async -> Bool {
        switch await center.notificationSettings().authorizationStatus {
        case .authorized, .provisional, .ephemeral: return true
        case .notDetermined: return (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        default: return false
        }
    }

    func pendingIdentifiers() async -> [String] {
        await center.pendingNotificationRequests().map(\.identifier)
    }

    func remove(_ ids: [String]) {
        center.removePendingNotificationRequests(withIdentifiers: ids)
    }

    func add(_ reminder: Reminder) async throws {
        let content = UNMutableNotificationContent()
        content.title = reminder.title
        content.body = reminder.body
        content.sound = .default
        let trigger = UNCalendarNotificationTrigger(dateMatching: reminder.fireAt, repeats: false)
        try await center.add(UNNotificationRequest(identifier: reminder.id, content: content, trigger: trigger))
    }

    func registerForRemoteNotifications() {
        DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
    }
}

/// « お守りの言葉 » : les phrases que l'utilisateur veut recevoir avant ses entretiens (écrites dans こころ).
/// La veille à 21 h, le matin à 7 h, 1 h ou 10 min avant (ces deux-là demandent l'heure de l'entretien).
struct Charm: Codable, Equatable {
    let text: String
    let when: String
}

/// Copie locale des phrases : les rappels sont programmés même sans réseau, depuis l'accueil ou 応募.
enum CharmStore {
    private static let key = "charms"
    static var charms: [Charm] {
        get { (UserDefaults.standard.data(forKey: key)).flatMap { try? JSONDecoder().decode([Charm].self, from: $0) } ?? [] }
        set { UserDefaults.standard.set(try? JSONEncoder().encode(newValue), forKey: key) }
    }
}

enum CharmReminders {
    static let prefix = "charm."
    /// Les deux prochains entretiens seulement (6 phrases au plus chacun) : iOS garde 64 rappels par app.
    static let interviewsCovered = 2
    private static let interviews: Set<String> = ["interview1", "interview2", "final"]
    private static let closed: Set<String> = ["rejected", "withdrawn"]

    static func reminders(for apps: [JobApplication], charms: [Charm], now: Date = .now, calendar: Calendar = .current) -> [Reminder] {
        guard !charms.isEmpty else { return [] }
        var tokyo = Calendar(identifier: .gregorian)
        tokyo.timeZone = TimeZone(identifier: "Asia/Tokyo") ?? .current
        let upcoming = apps.filter { !closed.contains($0.status) }.flatMap { app in
            app.steps.compactMap { step -> (day: Date, start: Date?, app: JobApplication, step: JobApplication.Step)? in
                guard interviews.contains(step.type), !step.done, let date = step.dueDate else { return nil }
                let d = date.split(separator: "-").compactMap { Int($0) }
                guard d.count == 3, let day = tokyo.date(from: DateComponents(year: d[0], month: d[1], day: d[2])) else { return nil }
                let t = step.time?.split(separator: ":").compactMap { Int($0) } ?? []
                let start = t.count == 2 ? tokyo.date(from: DateComponents(year: d[0], month: d[1], day: d[2], hour: t[0], minute: t[1])) : nil
                guard (start ?? day.addingTimeInterval(86400)) > now else { return nil }
                return (day, start, app, step)
            }
        }
        .sorted { ($0.start ?? $0.day) < ($1.start ?? $1.day) }
        .prefix(interviewsCovered)

        return upcoming.flatMap { item in
            charms.enumerated().compactMap { index, charm -> Reminder? in
                let fire: Date?
                switch charm.when {
                case "eve": fire = item.day.addingTimeInterval(-3 * 3600)         // la veille, 21 h
                case "morning": fire = item.day.addingTimeInterval(7 * 3600)      // le jour même, 7 h
                case "hour": fire = item.start?.addingTimeInterval(-3600)
                case "tenmin": fire = item.start?.addingTimeInterval(-600)
                default: fire = nil
                }
                guard let fire, fire > now else { return nil }
                let stage = SelectionStage.name(item.step.type)
                return Reminder(
                    id: "\(prefix)\(item.step.id).\(index)",
                    title: tr("\(item.app.company)の\(stage)へ", "For your \(stage) at \(item.app.company)", "Pour votre \(stage) chez \(item.app.company)"),
                    body: charm.text,
                    fireAt: calendar.dateComponents([.year, .month, .day, .hour, .minute], from: fire))
            }
        }
    }
}
