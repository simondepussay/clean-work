import XCTest
@testable import ShukatsuPilot

private final class FakeCenter: NotificationScheduling {
    var allowed = true
    var pending: [String] = ["deadline.old.eve", "autre.app"]
    var removed: [String] = []
    var added: [Reminder] = []
    var authorizationAsked = 0

    func authorizationAllowed() async -> Bool { authorizationAsked += 1; return allowed }
    func pendingIdentifiers() async -> [String] { pending }
    func remove(_ ids: [String]) { removed += ids }
    func add(_ reminder: Reminder) async throws { added.append(reminder) }
}

final class DeadlineRemindersTests: XCTestCase {
    private let calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Asia/Tokyo")!
        return c
    }()
    private var now: Date { calendar.date(from: DateComponents(year: 2026, month: 10, day: 22, hour: 12))! }

    private func app(_ id: String, status: String = "es", steps: [JobApplication.Step]) -> JobApplication {
        JobApplication(id: id, company: "楽天", position: nil, url: nil, status: status, steps: steps, nextDeadline: nil)
    }
    private func step(_ id: String, _ date: String, done: Bool = false) -> JobApplication.Step {
        .init(id: id, type: "es", dueDate: date, done: done, note: nil)
    }

    func testEveAt9AndDayAt8() {
        let r = DeadlineReminders.reminders(for: [app("a", steps: [step("s1", "2026-10-25")])], now: now, calendar: calendar)
        XCTAssertEqual(r.map(\.id), ["deadline.s1.eve", "deadline.s1.day"])
        XCTAssertEqual(r[0].fireAt.day, 24); XCTAssertEqual(r[0].fireAt.hour, 9)
        XCTAssertEqual(r[1].fireAt.day, 25); XCTAssertEqual(r[1].fireAt.hour, 8)
        XCTAssertEqual(r[0].body, "楽天：ES")
    }

    func testPastTimesAreSkipped() {
        // Échéance demain : la veille à 9 h (aujourd'hui 9 h) est déjà passée à midi.
        let r = DeadlineReminders.reminders(for: [app("a", steps: [step("s1", "2026-10-23")])], now: now, calendar: calendar)
        XCTAssertEqual(r.map(\.id), ["deadline.s1.day"])
    }

    func testDoneStepsAndClosedApplicationsHaveNoReminder() {
        let apps = [app("a", steps: [step("s1", "2026-10-30", done: true)]), app("b", status: "withdrawn", steps: [step("s2", "2026-10-30")])]
        XCTAssertTrue(DeadlineReminders.reminders(for: apps, now: now, calendar: calendar).isEmpty)
    }

    func testNeverMoreThan60Reminders() {
        let steps = (1...45).map { step("s\($0)", String(format: "2026-11-%02d", ($0 % 28) + 1)) }
        XCTAssertEqual(DeadlineReminders.reminders(for: [app("a", steps: steps)], now: now, calendar: calendar).count, 60)
    }

    @MainActor
    func testRescheduleReplacesOnlyOurReminders() async {
        let center = FakeCenter()
        let count = await DeadlineReminderScheduler(center: center).reschedule([app("a", steps: [step("s1", "2026-10-30")])], now: now)
        XCTAssertEqual(center.removed, ["deadline.old.eve"], "les rappels d'autres sources ne sont pas touchés")
        XCTAssertEqual(count, 2)
        XCTAssertEqual(center.added.count, 2)
    }

    @MainActor
    func testNoPermissionRequestWithoutDeadlines() async {
        let center = FakeCenter()
        await DeadlineReminderScheduler(center: center).reschedule([], now: now)
        XCTAssertEqual(center.authorizationAsked, 0)
        XCTAssertEqual(center.removed, ["deadline.old.eve"], "les anciens rappels sont quand même retirés")
    }

    @MainActor
    func testRefusedPermissionSchedulesNothing() async {
        let center = FakeCenter()
        center.allowed = false
        let count = await DeadlineReminderScheduler(center: center).reschedule([app("a", steps: [step("s1", "2026-10-30")])], now: now)
        XCTAssertEqual(count, 0)
        XCTAssertTrue(center.added.isEmpty)
    }
}
