import XCTest
@testable import ShukatsuPilot

@MainActor
final class InterviewTests: XCTestCase {
    private let base = URL(string: "https://example.test")!

    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.lastRequest = nil
    }

    private func api() -> APIClient {
        APIClient(baseURL: base, session: StubURLProtocol.session(), token: { "jeton" })
    }

    private func session(turns: String, status: String = "active", summary: String = "null") -> Data {
        Data("""
        {"id":"i1","applicationId":"a1","company":"ソニー","stage":"interview2","language":"fr","status":"\(status)",
         "turns":\(turns),"summary":\(summary),"createdAt":"2026-10-23T03:00:00.000Z","updatedAt":""}
        """.utf8)
    }
    private let twoQuestions = #"[{"question":"自己紹介をお願いします。","intent":"Clarté","kind":"main"},{"question":"志望動機は？","intent":"Motivation","kind":"main"}]"#
    private let firstAnswered = #"[{"question":"自己紹介をお願いします。","intent":"Clarté","kind":"main","answer":"シモンです","spoken":true,"durationSec":30,"feedback":{"score":72,"comment":"Clair.","improvements":["Chiffres"],"expressions":[{"quote":"バイト","suggestion":"アルバイト"}]}},{"question":"具体的には？","intent":"","kind":"followUp"},{"question":"志望動機は？","intent":"Motivation","kind":"main"}]"#

    func testSuggestedStageFollowsApplicationStatus() {
        func app(_ status: String) -> JobApplication {
            JobApplication(id: "a", company: "X", position: nil, url: nil, status: status, steps: [], nextDeadline: nil)
        }
        XCTAssertEqual(InterviewStage.suggested(for: nil), .interview1)
        XCTAssertEqual(InterviewStage.suggested(for: app("es")), .interview1)
        XCTAssertEqual(InterviewStage.suggested(for: app("interview2")), .interview2)
        XCTAssertEqual(InterviewStage.suggested(for: app("offer")), .final)
    }

    func testStartSendsChoicesAndShowsFirstQuestion() async throws {
        StubURLProtocol.handler = { _ in (201, self.session(turns: self.twoQuestions)) }
        let model = InterviewModel(api: api(), applicationId: "a1")
        model.stage = .interview2
        UserDefaults.standard.set("fr", forKey: HelpLanguage.storageKey)
        defer { UserDefaults.standard.removeObject(forKey: HelpLanguage.storageKey) }
        await model.start()

        let request = try XCTUnwrap(StubURLProtocol.lastRequest)
        XCTAssertEqual(request.url?.path, "/api/interviews")
        let body = try XCTUnwrap(request.httpBodyStream.map { stream -> Data in
            stream.open(); defer { stream.close() }
            var data = Data(); var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable { let n = stream.read(&buffer, maxLength: buffer.count); if n <= 0 { break }; data.append(buffer, count: n) }
            return data
        } ?? request.httpBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: String])
        XCTAssertEqual(json, ["applicationId": "a1", "stage": "interview2", "language": "fr"])
        XCTAssertEqual(model.shownIndex, 0)
        XCTAssertEqual(model.session?.turns.first?.question, "自己紹介をお願いします。")
    }

    func testAnswerShowsFeedbackThenFollowUp() async {
        StubURLProtocol.handler = { _ in (201, self.session(turns: self.twoQuestions)) }
        let model = InterviewModel(api: api())
        await model.start()
        StubURLProtocol.handler = { _ in (200, self.session(turns: self.firstAnswered)) }
        let ok = await model.answer("シモンです", durationSec: 30, spoken: true)

        XCTAssertTrue(ok)
        XCTAssertEqual(model.reviewing, 0, "on lit d'abord l'avis de la réponse")
        XCTAssertEqual(model.session?.turns[0].feedback?.expressions.first?.suggestion, "アルバイト")
        model.next()
        XCTAssertEqual(model.shownIndex, 1)
        XCTAssertTrue(model.session?.turns[1].isFollowUp ?? false)
    }

    func testLimitIsExplained() async {
        StubURLProtocol.handler = { _ in (429, Data(#"{"error":"limit","reason":"day","retryAfter":"2026-10-24T00:00:00.000Z"}"#.utf8)) }
        UserDefaults.standard.set("ja", forKey: HelpLanguage.storageKey)
        defer { UserDefaults.standard.removeObject(forKey: HelpLanguage.storageKey) }
        let model = InterviewModel(api: api())
        await model.start()
        XCTAssertNil(model.session)
        XCTAssertTrue(model.message?.contains("上限") ?? false)
    }

    func testFinishedSessionDecodesSummary() async {
        let summary = #"{"score":70,"summary":"Bonne base.","strengths":["Clair"],"improvements":["Chiffres"]}"#
        StubURLProtocol.handler = { _ in (200, self.session(turns: self.firstAnswered, status: "finished", summary: summary)) }
        let model = InterviewModel(api: api())
        await model.open("i1")
        XCTAssertEqual(model.session?.isFinished, true)
        XCTAssertEqual(model.session?.summary?.score, 70)
    }
}
