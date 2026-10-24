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
            }
            .sorted { ($0.date, $0.company) < ($1.date, $1.company) }
    }

    static func stepName(_ step: String) -> String {
        SelectionStage.name(step)
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
            let what = "\(d.company)：\(Deadlines.stepName(d.step))"
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

    static func reminders(for apps: [JobApplication], now: Date = .now, calendar: Calendar = .current) -> [Reminder] {
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
                return (fire, Reminder(
                    id: "\(prefix)\(step.id)",
                    title: tr("まもなく面接です", "Interview in one hour", "Entretien dans une heure"),
                    body: tr("\(app.company)の\(stage)まであと1時間。ここまでの準備を信じて、いってらっしゃい！",
                             "\(stage) at \(app.company) in one hour. Trust the preparation you've done — you've got this!",
                             "\(stage) chez \(app.company) dans une heure. Faites confiance à votre préparation : vous êtes prêt·e !"),
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

    init(center: NotificationScheduling, serverPushActive: @escaping @MainActor () -> Bool = { false }) {
        self.center = center
        self.serverPushActive = serverPushActive
    }

    /// Renvoie le nombre de rappels locaux programmés (0 si l'utilisateur a refusé, ou si le serveur s'en charge).
    @discardableResult
    func reschedule(_ apps: [JobApplication], now: Date = .now) async -> Int {
        await removeLocal()
        let interviews = InterviewReminders.reminders(for: apps, now: now)
        let deadlines = DeadlineReminders.reminders(for: apps, now: now)
        // L'autorisation n'est demandée ici qu'au moment où il y a quelque chose à rappeler (sinon : prepare()).
        guard !(interviews + deadlines).isEmpty, await center.authorizationAllowed() else { return 0 }
        // S26 : on (re)demande le jeton APNs.
        center.registerForRemoteNotifications()
        // L'encouragement 1 h avant un entretien est toujours local ; les échéances seulement si le serveur ne s'en charge pas.
        let reminders = serverPushActive() ? interviews : interviews + deadlines
        var added = 0
        for r in reminders where (try? await center.add(r)) != nil { added += 1 }
        return added
    }

    /// À l'arrivée sur l'accueil : autorisation et jeton APNs, même sans échéance, car le serveur envoie
    /// aussi les rappels JLPT et les relances. Appelé par l'app seulement (jamais dans les tests unitaires,
    /// où la vraie question d'iOS attendrait une réponse indéfiniment).
    func prepare() async {
        guard await center.authorizationAllowed() else { return }
        center.registerForRemoteNotifications()
    }

    /// Retire nos rappels locaux (et seulement les nôtres).
    func removeLocal() async {
        center.remove(await center.pendingIdentifiers().filter { $0.hasPrefix(DeadlineReminders.prefix) || $0.hasPrefix(InterviewReminders.prefix) })
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
