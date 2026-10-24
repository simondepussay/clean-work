import XCTest
@testable import ShukatsuPilot

private final class FakeCenter: NotificationScheduling {
    var allowed = true
    var pending: [String] = ["deadline.old.eve", "autre.app"]
    var removed: [String] = []
    var added: [Reminder] = []
    var authorizationAsked = 0
    var apnsRequested = 0

    func authorizationAllowed() async -> Bool { authorizationAsked += 1; return allowed }
    func pendingIdentifiers() async -> [String] { pending }
    func remove(_ ids: [String]) { removed += ids }
    func add(_ reminder: Reminder) async throws { added.append(reminder) }
    func registerForRemoteNotifications() { apnsRequested += 1 }
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
    func testPrepareAsksPermissionAndAPNsEvenWithoutDeadlines() async {
        // Le serveur envoie aussi les rappels JLPT et les relances : il faut le jeton APNs dès l'accueil.
        let center = FakeCenter()
        await DeadlineReminderScheduler(center: center).prepare()
        XCTAssertEqual(center.authorizationAsked, 1)
        XCTAssertEqual(center.apnsRequested, 1)
    }

    // MARK: encouragement 1 h avant un entretien

    private func interview(_ id: String, _ date: String, _ time: String?, type: String = "interview1") -> JobApplication.Step {
        .init(id: id, type: type, dueDate: date, time: time, done: false, note: nil)
    }

    func testInterviewReminderOneHourBeforeWithCompany() {
        let r = InterviewReminders.reminders(for: [app("a", steps: [interview("i1", "2026-10-30", "14:00")])], now: now, calendar: calendar)
        XCTAssertEqual(r.map(\.id), ["interview.i1"])
        XCTAssertEqual(r[0].fireAt.day, 30); XCTAssertEqual(r[0].fireAt.hour, 13); XCTAssertEqual(r[0].fireAt.minute, 0)
        XCTAssertTrue(r[0].body.contains("楽天"))
    }

    func testNoInterviewReminderWithoutTimeOrForOtherSteps() {
        let steps = [interview("i1", "2026-10-30", nil), interview("e1", "2026-10-30", "14:00", type: "es"), interview("i2", "2026-10-22", "12:30")]
        XCTAssertTrue(InterviewReminders.reminders(for: [app("a", steps: steps)], now: now, calendar: calendar).isEmpty,
                      "sans heure, autre étape, ou déjà passé (12:30 - 1 h < midi)")
    }

    @MainActor
    func testInterviewReminderKeptEvenWhenServerSendsDeadlines() async {
        let center = FakeCenter()
        let count = await DeadlineReminderScheduler(center: center, serverPushActive: { true })
            .reschedule([app("a", steps: [interview("i1", "2026-10-30", "14:00")])], now: now)
        XCTAssertEqual(count, 1)
        XCTAssertEqual(center.added.map(\.id), ["interview.i1"])
    }

    @MainActor
    func testRefusedPermissionSchedulesNothing() async {
        let center = FakeCenter()
        center.allowed = false
        let count = await DeadlineReminderScheduler(center: center).reschedule([app("a", steps: [step("s1", "2026-10-30")])], now: now)
        XCTAssertEqual(count, 0)
        XCTAssertTrue(center.added.isEmpty)
        XCTAssertEqual(center.apnsRequested, 0, "pas de jeton APNs sans autorisation")
    }

    // MARK: S26 — le push serveur prend le relais

    @MainActor
    func testAuthorizedAsksForAPNsTokenAndKeepsLocalUntilServerConfirms() async {
        let center = FakeCenter()
        let count = await DeadlineReminderScheduler(center: center, serverPushActive: { false })
            .reschedule([app("a", steps: [step("s1", "2026-10-30")])], now: now)
        XCTAssertEqual(center.apnsRequested, 1)
        XCTAssertEqual(count, 2, "filet de sécurité : rappels locaux tant que le serveur n'a pas confirmé")
    }

    @MainActor
    func testNoLocalDuplicatesWhenServerSendsReminders() async {
        let center = FakeCenter()
        let count = await DeadlineReminderScheduler(center: center, serverPushActive: { true })
            .reschedule([app("a", steps: [step("s1", "2026-10-30")])], now: now)
        XCTAssertEqual(count, 0)
        XCTAssertTrue(center.added.isEmpty)
        XCTAssertEqual(center.removed, ["deadline.old.eve"])
    }
}

private final class FakeDevices: DeviceRegistering {
    var reply: Result<Bool, Error> = .success(true)
    var registered: [(String, String)] = []
    var unregistered: [String] = []

    func registerDevice(token: String, environment: String) async throws -> Bool {
        registered.append((token, environment))
        return try reply.get()
    }
    func unregisterDevice(token: String) async throws { unregistered.append(token) }
}

@MainActor
final class PushRegistrationTests: XCTestCase {
    private var cleared = 0
    private func make(_ api: FakeDevices) -> PushRegistration {
        let push = PushRegistration(defaults: UserDefaults(suiteName: UUID().uuidString)!, clearLocal: { self.cleared += 1 })
        push.api = api
        return push
    }

    func testTokenIsSentInHex() {
        XCTAssertEqual(PushRegistration.hex(Data([0x00, 0xAB, 0x0F, 0xFF])), "00ab0fff")
    }

    func testServerOnReplacesLocalReminders() async {
        let api = FakeDevices()
        let push = make(api)
        await push.didReceive(deviceToken: Data([0xAB, 0xCD]))
        XCTAssertEqual(api.registered.first?.0, "abcd")
        XCTAssertEqual(api.registered.first?.1, "sandbox", "les tests tournent en Debug")
        XCTAssertTrue(push.isServerActive)
        XCTAssertEqual(cleared, 1)
    }

    func testServerOffOrUnreachableKeepsLocalReminders() async {
        let off = FakeDevices()
        off.reply = .success(false)
        let push = make(off)
        await push.didReceive(deviceToken: Data([0x01]))
        XCTAssertFalse(push.isServerActive)

        let down = FakeDevices()
        down.reply = .failure(URLError(.notConnectedToInternet))
        let push2 = make(down)
        await push2.didReceive(deviceToken: Data([0x01]))
        XCTAssertFalse(push2.isServerActive)
        XCTAssertEqual(cleared, 0)
    }

    func testSignOutForgetsDeviceAndClearsLocalReminders() async {
        let api = FakeDevices()
        let push = make(api)
        await push.didReceive(deviceToken: Data([0xAB]))
        await push.signOut()
        XCTAssertEqual(api.unregistered, ["ab"])
        XCTAssertFalse(push.isServerActive)
        XCTAssertEqual(cleared, 2)
    }
}
