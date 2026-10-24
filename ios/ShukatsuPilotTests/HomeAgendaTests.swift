import XCTest
@testable import ShukatsuPilot

final class HomeAgendaTests: XCTestCase {
    private func app(_ id: String, status: String, steps: [JobApplication.Step]) -> JobApplication {
        JobApplication(id: id, company: "\(id)社", position: nil, url: nil, status: status, steps: steps, nextDeadline: nil)
    }

    func testAgendaMixesStepsAndPlansSortedByDateTimeAndKind() {
        let items = Agenda.build([
            app("A", status: "interview1", steps: [.init(id: "s1", type: "interview1", dueDate: "2026-10-28", done: false, note: nil),
                                                  .init(id: "s2", type: "es", dueDate: "2026-10-25", done: true, note: nil)]),
            app("B", status: "withdrawn", steps: [.init(id: "s3", type: "es", dueDate: "2026-10-26", done: false, note: nil)]),
        ], [
            Plan(id: "p1", kind: "goal", title: "ES 3本", date: "2026-10-28", time: nil, note: nil, done: false),
            Plan(id: "p2", kind: "event", title: "説明会", date: "2026-10-28", time: "10:00", note: nil, done: false),
        ])
        XCTAssertEqual(items.map { [$0.date, $0.kind.rawValue, $0.title] }, [
            ["2026-10-25", "step", "A社"],
            ["2026-10-28", "event", "説明会"],
            ["2026-10-28", "interview", "A社"],
            ["2026-10-28", "goal", "ES 3本"],
        ])
        XCTAssertEqual(items[2].stepId, "s1", "un entretien garde son étape (pour « 練習する »)")
    }

    func testMonthGridStartsOnSundayAndCoversTheMonth() {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Asia/Tokyo")!
        let weeks = Agenda.weeks(year: 2026, month: 10, calendar: cal)
        XCTAssertTrue(weeks.allSatisfy { $0.count == 7 })
        XCTAssertEqual(Agenda.key(weeks[0][0], calendar: cal), "2026-09-27")
        XCTAssertEqual(Agenda.key(weeks.last![6], calendar: cal), "2026-10-31")
        XCTAssertEqual(Agenda.weeks(year: 2026, month: 2, calendar: cal).count, 4, "février 2026 commence un dimanche")
    }

    func testTranslationFollowsChosenLanguage() {
        let key = HelpLanguage.storageKey
        let saved = UserDefaults.standard.string(forKey: key)
        defer { UserDefaults.standard.set(saved, forKey: key) }
        UserDefaults.standard.set("fr", forKey: key)
        XCTAssertEqual(tr("面接", "Interview", "Entretien"), "Entretien")
        UserDefaults.standard.set("ja", forKey: key)
        XCTAssertEqual(tr("面接", "Interview", "Entretien"), "面接")
    }
}
