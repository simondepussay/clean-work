import XCTest
@testable import ShukatsuPilot

final class SelectionStageTests: XCTestCase {
    func testNeighbourNeverJumpsToClosed() {
        XCTAssertEqual(SelectionStage.neighbour(of: "applied", 1), "test")
        XCTAssertNil(SelectionStage.neighbour(of: "interested", -1))
        XCTAssertNil(SelectionStage.neighbour(of: "offer", 1))
        XCTAssertNil(SelectionStage.neighbour(of: "rejected", 1))
    }

    func testDaysUntilAndLabels() {
        let calendar = Calendar(identifier: .gregorian)
        let today = calendar.date(from: DateComponents(year: 2026, month: 10, day: 29))!
        XCTAssertEqual(SelectionStage.daysUntil("2026-11-01", from: today, calendar: calendar), 3)
        XCTAssertEqual(SelectionStage.daysUntil("2026-10-29", from: today, calendar: calendar), 0)
        UserDefaults.standard.set("ja", forKey: HelpLanguage.storageKey)
        defer { UserDefaults.standard.removeObject(forKey: HelpLanguage.storageKey) }
        XCTAssertEqual(SelectionStage.deadlineLabel(1), "明日")
        XCTAssertEqual(SelectionStage.deadlineLabel(4), "あと4日")
    }
}

@MainActor
final class ApplicationsModelTests: XCTestCase {
    private func model() -> ApplicationsModel {
        ApplicationsModel(api: APIClient(baseURL: URL(string: "https://example.test")!, session: StubURLProtocol.session(), token: { "jeton" }))
    }

    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.lastRequest = nil
    }

    private let list = #"""
    [{"id":"a1","company":"楽天","status":"es","steps":[],"nextDeadline":"2026-11-01"},
     {"id":"a2","company":"LINEヤフー","status":"rejected","steps":[],"nextDeadline":null},
     {"id":"a3","company":"ソニー","status":"es","steps":[],"nextDeadline":null}]
    """#

    func testSectionsFollowTheFlowWithClosedLast() async {
        StubURLProtocol.handler = { _ in (200, Data(self.list.utf8)) }
        let m = model()
        await m.load()
        XCTAssertEqual(m.sections.map(\.stage.id), ["es", "rejected"])
        XCTAssertEqual(m.sections.first?.items.map(\.company), ["楽天", "ソニー"])
    }

    func testClearedIndustryIsSentAsNull() throws {
        var input = JobApplicationInput()
        input.company = "ソニー"
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(input)) as? [String: Any])
        XCTAssertTrue(json["industry"] is NSNull, "null efface le 業界 côté API")
        XCTAssertTrue(json["companyType"] is NSNull)
        XCTAssertNil(json["notes"])
    }

    func testMoveSendsOnlyTheStatus() async throws {
        StubURLProtocol.handler = { request in
            request.httpMethod == "PUT"
                ? (200, Data(#"{"id":"a1","company":"楽天","status":"test","steps":[],"nextDeadline":null}"#.utf8))
                : (200, Data(self.list.utf8))
        }
        let m = model()
        await m.load()
        let app = try XCTUnwrap(m.applications?.first { $0.id == "a1" })
        await m.move(app, to: "test")

        XCTAssertEqual(StubURLProtocol.lastRequest?.url?.path, "/api/applications/a1")
        XCTAssertEqual(m.applications?.first { $0.id == "a1" }?.status, "test")
        XCTAssertFalse(m.failed)
    }

    func testAppliedFilterAndSearch() {
        let apps = [("interested", "楽天", nil), ("applied", "ソニー", "ゲーム事業"), ("interview1", "任天堂", nil)].enumerated().map { i, t in
            JobApplication(id: "a\(i)", company: t.1, status: t.0, steps: [], notes: t.2)
        }
        XCTAssertEqual(apps.filter { SelectionStage.isWaiting($0.status) }.map(\.company), ["ソニー"])
        XCTAssertEqual(apps.filter { SelectionStage.matches($0, "ゲーム") }.map(\.company), ["ソニー"])
        XCTAssertEqual(apps.filter { SelectionStage.matches($0, " ") }.count, 3)
        XCTAssertEqual(SelectionStage.neighbour(of: "es", 1), "applied")
    }
}

final class FollowUpTests: XCTestCase {
    override func tearDown() { UserDefaults.standard.removeObject(forKey: HelpLanguage.storageKey) }

    func testOldApplicationsDecode_andNewOnesDoNotSendTheLists() throws {
        let old = try JSONDecoder().decode(JobApplication.self, from: Data(#"{"id":"a","company":"楽天","status":"es","steps":[]}"#.utf8))
        XCTAssertNil(old.followUps)
        let fresh = try JSONSerialization.jsonObject(with: JSONEncoder().encode(JobApplicationInput())) as! [String: Any]
        XCTAssertNil(fresh["events"], "nouvelle candidature : l'API met des listes vides")
        XCTAssertNil(fresh["followUps"])
    }

    func testEditingSendsTheListsBack_withoutEmptyFollowUps() throws {
        var app = JobApplication(id: "a", company: "楽天", status: "es", steps: [], nextDeadline: nil)
        app.events = [AppEvent(id: "e", date: "2026-10-20", kind: "seminar", note: "説明会")]
        app.followUps = [FollowUp(id: "f", date: "2026-11-05", note: "お礼メール"), FollowUp(id: "g", date: "2026-11-06", note: " ")]
        let sent = try JSONSerialization.jsonObject(with: JSONEncoder().encode(JobApplicationInput(app))) as! [String: Any]
        XCTAssertEqual((sent["events"] as? [[String: Any]])?.first?["kind"] as? String, "seminar")
        XCTAssertEqual((sent["followUps"] as? [[String: Any]])?.map { $0["id"] as? String }, ["f"])
    }

    func testFollowUpsAreRemindedLikeDeadlines() {
        UserDefaults.standard.set("ja", forKey: HelpLanguage.storageKey)
        var tokyo = Calendar(identifier: .gregorian)
        tokyo.timeZone = TimeZone(identifier: "Asia/Tokyo")!
        let now = tokyo.date(from: DateComponents(year: 2026, month: 10, day: 29, hour: 12))!
        var app = JobApplication(id: "a", company: "楽天", status: "applied", steps: [], nextDeadline: nil)
        app.followUps = [FollowUp(id: "f", date: "2026-11-02", note: "お礼メール"), FollowUp(id: "g", date: "2026-11-03", note: "済", done: true)]
        let r = DeadlineReminders.reminders(for: [app], now: now, calendar: tokyo)
        XCTAssertEqual(r.map(\.id), ["deadline.f.eve", "deadline.f.day"])
        XCTAssertEqual(r[0].body, "楽天：フォローアップ（お礼メール）")
        XCTAssertEqual(Agenda.build([app], []).first?.detail, "フォローアップ：お礼メール")
    }
}
