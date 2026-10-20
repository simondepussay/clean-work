import XCTest
@testable import ShukatsuPilot

final class CharCountAndDiffTests: XCTestCase {
    func testCharCountLikeCompanies() {
        XCTAssertEqual(charCount("私の強みは、粘り強さです。"), 13)
        XCTAssertEqual(charCount("一行目\n二行目"), 6)
        XCTAssertEqual(charCount("\r\n"), 0)
        XCTAssertEqual(charCount("👨‍👩‍👧"), 1)
    }

    func testDiffFindsCommonPartAndChanges() {
        XCTAssertEqual(Diff.parts(from: "御社で働きたい", to: "貴社で働きたいです"), [
            .init(kind: .del, text: "御"), .init(kind: .add, text: "貴"),
            .init(kind: .same, text: "社で働きたい"), .init(kind: .add, text: "です"),
        ])
    }

    func testDiffRebuildsBothTexts() {
        let before = "私の強みはすごく粘り強いところだ。なので、御社でも活かせれると思います。"
        let after = "私の強みは粘り強さです。そのため、貴社でも活かせると考えております。"
        let parts = Diff.parts(from: before, to: after)
        XCTAssertEqual(parts.filter { $0.kind != .add }.map(\.text).joined(), before)
        XCTAssertEqual(parts.filter { $0.kind != .del }.map(\.text).joined(), after)
        let stats = Diff.stats(Diff.parts(from: "御社で働きたいと思う", to: "貴社で働きたい"))
        XCTAssertEqual(stats.added, 1)
        XCTAssertEqual(stats.removed, 4)
    }

    func testGuideDecodesTheSharedFormat() throws {
        let json = #"""
        {"intro":{"ja":"ES","en":"ES","fr":"ES"},"steps":[],"exampleWarning":{"ja":"w","en":"w","fr":"w"},
         "types":[{"id":"gakuchika","label":{"ja":"ガクチカ","en":"G","fr":"G"},"question":"Q","charLimit":400,
         "purpose":{"ja":"p","en":"p","fr":"but"},"structure":[],"tips":[],"example":"例"}]}
        """#
        let guide = try JSONDecoder().decode(Guide.self, from: Data(json.utf8))
        XCTAssertEqual(guide.types.first?.charLimit, 400)
        XCTAssertEqual(guide.types.first?.purpose(.fr), "but")
    }
}

@MainActor
final class EsEditorModelTests: XCTestCase {
    private let review = #"{"id":"r1","createdAt":"2026-10-20T10:00:00.000Z","bodySnapshot":"御社で働きたい","score":65,"summary":"s","strengths":[],"issues":[{"category":"keigo","quote":"御社","problem":"p","suggestion":"貴社"}]}"#

    private func api() -> APIClient {
        APIClient(baseURL: URL(string: "https://example.test")!, session: StubURLProtocol.session(), token: { "jeton" })
    }

    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.lastRequest = nil
    }

    func testReviewSavesFirstThenAppliesSuggestion() async {
        var paths: [String] = []
        StubURLProtocol.handler = { request in
            paths.append("\(request.httpMethod!) \(request.url!.path)")
            switch (request.httpMethod!, request.url!.path) {
            case ("POST", "/api/drafts"): return (201, Data(#"{"id":"d1","kind":"jikopr","question":"Q","body":"御社で働きたい","updatedAt":"t"}"#.utf8))
            case ("POST", "/api/drafts/d1/review"): return (201, Data(self.review.utf8))
            default: return (200, Data(#"{"today":9,"month":29}"#.utf8))
            }
        }
        let model = EsEditorModel(api: api(), draft: nil, input: DraftInput(kind: "jikopr", question: "Q", body: "御社で働きたい"))

        await model.runReview(language: .fr)

        XCTAssertEqual(paths.prefix(2), ["POST /api/drafts", "POST /api/drafts/d1/review"], "l'ES est enregistrée avant la relecture")
        XCTAssertEqual(model.review?.score, 65)
        XCTAssertEqual(model.usage, Usage(today: 9, month: 29))

        model.apply(0)
        XCTAssertEqual(model.input.body, "貴社で働きたい")
        XCTAssertTrue(model.applied.contains(0))
        XCTAssertEqual(model.status, .idle, "le texte a changé : il faudra enregistrer")
    }

    func testDailyLimitIsExplainedWithTheResumeDate() async {
        StubURLProtocol.handler = { request in
            request.url!.path.hasSuffix("/review")
                ? (429, Data(#"{"error":"limit","reason":"day","retryAfter":"2026-10-21T00:00:00.000Z"}"#.utf8))
                : (200, Data(#"{"today":0,"month":20}"#.utf8))
        }
        let draft = Draft(id: "d1", kind: "free", question: "Q", body: "本文", updatedAt: "t")
        let model = EsEditorModel(api: api(), draft: draft)

        await model.runReview(language: .en)

        guard case .limit(let reason, let date)? = model.refusal else { return XCTFail("refus attendu") }
        XCTAssertEqual(reason, "day")
        XCTAssertEqual(date, ISO8601DateFormatter.withFractions.date(from: "2026-10-21T00:00:00.000Z"))
        XCTAssertTrue(model.history.isEmpty)
    }

    func testCounterAndOverLimit() {
        let model = EsEditorModel(api: api(), draft: nil, input: DraftInput(question: "Q", charLimit: 5, body: "あいうえおか"))
        XCTAssertEqual(model.count, 6)
        XCTAssertTrue(model.isOver)
    }

    func testValidationErrorsFromTheAPI() async {
        StubURLProtocol.handler = { _ in (400, Data(#"{"error":"invalid","issues":[{"path":"question","message":"入力してください / Required"}]}"#.utf8)) }
        let model = EsEditorModel(api: api(), draft: nil)
        let id = await model.save()
        XCTAssertNil(id)
        XCTAssertEqual(model.error("question"), "入力してください / Required")
    }
}

final class LegalLinksTests: XCTestCase {
    func testLinksPointToTheSitePages() {
        let url = LegalLinks.url(URL(string: "https://example.test")!, "privacy.html")
        XCTAssertEqual(url.host(), "example.test")
        XCTAssertEqual(url.lastPathComponent, "privacy.html")
    }
}

@MainActor
final class ResumeTests: XCTestCase {
    private func api() -> APIClient {
        APIClient(baseURL: URL(string: "https://example.test")!, session: StubURLProtocol.session(), token: { "jeton" })
    }

    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.lastRequest = nil
    }

    func testReturnsThePDFAndSendsOptions() async throws {
        StubURLProtocol.handler = { _ in (200, Data("%PDF-1.7".utf8)) }
        let result = try await api().resume(.init(era: .japanese, appeal: "強み", wishes: nil))
        guard case .success(let pdf) = result else { return XCTFail("PDF attendu") }
        XCTAssertEqual(String(decoding: pdf.data.prefix(5), as: UTF8.self), "%PDF-")
        XCTAssertEqual(StubURLProtocol.lastRequest?.url?.path, "/api/resume")
    }

    func testMissingProfile() async throws {
        StubURLProtocol.handler = { _ in (404, Data(#"{"error":"profile_missing"}"#.utf8)) }
        let result = try await api().resume(.init())
        guard case .failure(let error) = result else { return XCTFail("échec attendu") }
        XCTAssertEqual(error, .profileMissing)
    }

    func testOptionsEncodeWithoutEmptyFields() throws {
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(APIClient.ResumeOptions(era: .western))) as? [String: String]
        XCTAssertEqual(json, ["era": "western"])
    }
}

@MainActor
final class WorkHistoryTests: XCTestCase {
    override func tearDown() { StubURLProtocol.handler = nil }

    func testNoWorkIsExplained() async throws {
        StubURLProtocol.handler = { _ in (400, Data(#"{"error":"no_work"}"#.utf8)) }
        let api = APIClient(baseURL: URL(string: "https://example.test")!, session: StubURLProtocol.session(), token: { "jeton" })
        let result = try await api.workHistory(.init(summary: "要約"))
        guard case .failure(let error) = result else { return XCTFail("échec attendu") }
        XCTAssertEqual(error, .noWork)
        XCTAssertEqual(StubURLProtocol.lastRequest?.url?.path, "/api/work-history")
    }
}
