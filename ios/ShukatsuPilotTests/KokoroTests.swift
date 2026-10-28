import XCTest
@testable import ShukatsuPilot

@MainActor
final class KokoroTests: XCTestCase {
    override func tearDown() {
        StubURLProtocol.handler = nil
        UserDefaults.standard.removeObject(forKey: HelpLanguage.storageKey)
    }

    private func api() -> APIClient {
        APIClient(baseURL: URL(string: "https://example.test")!, session: StubURLProtocol.session(), token: { "jeton" })
    }

    private func app(_ company: String, status: String = "interview1", _ steps: [JobApplication.Step]) -> JobApplication {
        JobApplication(id: company, company: company, status: status, steps: steps, nextDeadline: nil)
    }

    func testRitualIsForTheNextInterviewWithinAWeek() {
        let apps = [
            app("楽天", [.init(id: "1", type: "interview2", dueDate: "2026-11-02")]),
            app("ソニー", [.init(id: "2", type: "interview1", dueDate: "2026-10-30"), .init(id: "3", type: "es", dueDate: "2026-10-29")]),
            app("トヨタ", status: "rejected", [.init(id: "4", type: "final", dueDate: "2026-10-29")]),
            app("メルカリ", [.init(id: "5", type: "final", dueDate: "2026-10-28", done: true)]),
            app("LINEヤフー", [.init(id: "6", type: "final", dueDate: "2026-11-10")]),
        ]
        let next = KokoroModel.nextInterview(in: apps, today: "2026-10-28")
        XCTAssertEqual(next?.company, "ソニー", "ni l'ES, ni une candidature refusée, ni un entretien passé")
        XCTAssertEqual(next?.date, "2026-10-30")
        XCTAssertNil(KokoroModel.nextInterview(in: [apps[4]], today: "2026-10-28"), "au-delà de 7 jours : pas de rituel dédié")
    }

    func testClearingTheDaySendsNull() async throws {
        var sent: [String: Any] = [:]
        StubURLProtocol.handler = { request in
            if request.httpMethod == "PUT" {
                let body = request.httpBody ?? request.httpBodyStream.map { s in
                    s.open(); defer { s.close() }
                    var d = Data(); var b = [UInt8](repeating: 0, count: 1024)
                    while s.hasBytesAvailable { let n = s.read(&b, maxLength: b.count); if n <= 0 { break }; d.append(b, count: n) }
                    return d
                } ?? Data()
                sent = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any] ?? [:]
            }
            return (204, Data())
        }
        try await api().setMood(date: "2026-10-28", weather: nil, word: "不安")
        XCTAssertEqual(sent["date"] as? String, "2026-10-28")
        XCTAssertTrue(sent["weather"] is NSNull, "null efface la note du jour")
        XCTAssertNil(sent["word"], "pas de mot sans météo")

        try await api().setMood(date: "2026-10-28", weather: "rainy", word: "  焦り ")
        XCTAssertEqual(sent["weather"] as? String, "rainy")
        XCTAssertEqual(sent["word"] as? String, "焦り")
    }

    func testDecodesTheServerView() async throws {
        let json = #"{"moods":[{"date":"2026-10-28","weather":"rainy","word":"不安"}],"values":["家族を安心させたい"],"support":{"level":"often","rainy7":3,"rainy14":4},"week":{"applications":2,"drafts":1,"interviews":0,"rejections":1},"prefecture":"東京都","international":true}"#
        StubURLProtocol.handler = { request in
            request.url?.path == "/api/kokoro" ? (200, Data(json.utf8)) : (200, Data("[]".utf8))
        }
        var tokyo = Calendar(identifier: .gregorian)
        tokyo.timeZone = .current
        let model = KokoroModel(api: api(), now: { tokyo.date(from: DateComponents(year: 2026, month: 10, day: 28, hour: 12))! })
        await model.load()
        XCTAssertEqual(StubURLProtocol.lastRequest?.url?.path, "/api/applications")
        XCTAssertEqual(model.data?.support.level, "often")
        XCTAssertEqual(model.data?.prefecture, "東京都")
        XCTAssertEqual(model.todayMood?.word, "不安")
    }

    func testShortDateFollowsTheLanguage() {
        UserDefaults.standard.set("ja", forKey: HelpLanguage.storageKey)
        XCTAssertEqual(KokoroView.shortDate("2026-11-03"), "11月3日(火)")
    }
}
