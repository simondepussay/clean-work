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
        XCTAssertNil(guide.checks) // ancien format : les nouveaux champs sont facultatifs
    }

    /// Le vrai es-guide.json du site : la checklist iOS doit donner les mêmes résultats que le web (checks.test.ts).
    private func sharedGuide() throws -> Guide {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../web/public/es-guide.json")
        guard let data = try? Data(contentsOf: url) else { throw XCTSkip("es-guide.json introuvable") }
        return try JSONDecoder().decode(Guide.self, from: data)
    }

    private func ids(_ g: Guide, _ kind: String, _ body: String, _ state: Guide.CheckResult.State? = nil) -> [String] {
        g.runChecks(kind: kind, body: body).filter { state == nil || $0.state == state }.map(\.id)
    }

    func testChecklistFlagsTheClassRules() throws {
        let g = try sharedGuide()
        let bad = Set(ids(g, "jikopr", "私は高知県出身の田中と申します。僕は色々なことを学んだと思います。", .bad))
        XCTAssertTrue(bad.isSuperset(of: ["introduction", "boku", "vague", "omoimasu"]))
        XCTAssertTrue(ids(g, "jikopr", "私の強みは行動力です。以前は短所だった慎重さを克服しました。", .warn).contains("weakness"))
        XCTAssertTrue(ids(g, "jikopr", "私の強みは協調性です。高校の部活で学びました。").contains("schoolOnly"))
        XCTAssertFalse(ids(g, "jikopr", "私の強みは協調性です。高校とアルバイトで学びました。").contains("schoolOnly"))
        XCTAssertTrue(ids(g, "jikopr", "私の強みは協調性と計画性と行動力です。", .warn).contains("keywords"))
        XCTAssertTrue(ids(g, "strengths", "私の短所は心配性なところです。").contains("strengthsImprove"))
        XCTAssertFalse(ids(g, "strengths", "私の短所は心配性なところです。改善するため、期限を決めています。").contains("strengthsImprove"))
        XCTAssertEqual(ids(g, "free", "僕は趣味は旅行です。"), ["boku"])
        XCTAssertEqual(g.runChecks(kind: "jikopr", body: "  "), [])
    }

    func testChecklistGoodPracticesAndOrder() throws {
        let g = try sharedGuide()
        XCTAssertTrue(Set(ids(g, "jikopr", "【粘り強さで目標を達成】\n私の強みは2つあります。1年でN1に合格しました。", .good)).isSuperset(of: ["title", "twoPoints", "number"]))
        XCTAssertTrue(Set(ids(g, "jikopr", "私の強みは粘り強さです。", .tip)).isSuperset(of: ["title", "number"]))
        let states = g.runChecks(kind: "jikopr", body: "【強み】僕の強みは2つあります。").map(\.state.rawValue)
        XCTAssertEqual(states, states.sorted())
        let long = "私の強みは、どんなに難しい状況でも最後まであきらめずに周りの人と協力しながら目標に向かって進み続けられる粘り強さです。"
        let first = g.runChecks(kind: "jikopr", body: long).first { $0.id == "firstSentence" }
        XCTAssertTrue(first?.text.ja.contains("\(charCount(Guide.firstSentence(long)))字") ?? false)
    }

    func testGuideExamplesHaveNoErrorsAndStarterFills() throws {
        let g = try sharedGuide()
        for t in g.types { XCTAssertEqual(ids(g, t.id, t.example, .bad), [], t.id) }
        let starter = try XCTUnwrap(g.types.first { $0.id == "jikopr" }?.starter)
        XCTAssertTrue(starter.text(["協調性"]).contains("私の強みは協調性です。"))
        XCTAssertTrue(starter.text(["協調性", "計画性"]).contains("1つめは協調性、2つめは計画性です。"))
        XCTAssertTrue(starter.text([]).contains("私の強みは〇〇です。"))
        // Le squelette seul : 【〇〇】 n'est pas un vrai titre, 1つめ/2つめ ne sont pas des chiffres.
        let good = ids(g, "jikopr", starter.text(["協調性", "計画性"]), .good)
        XCTAssertFalse(good.contains("title"))
        XCTAssertFalse(good.contains("number"))
        XCTAssertTrue(good.contains("twoPoints"))
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
        UserDefaults.standard.set("en", forKey: HelpLanguage.storageKey)
        defer { UserDefaults.standard.removeObject(forKey: HelpLanguage.storageKey) }
        XCTAssertEqual(model.error("question"), "Required")
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
        XCTAssertEqual(json, ["era": "western", "template": "student"])
    }

    func testOnlyTheChosenTemplateFieldsAreSent() throws {
        var options = APIClient.ResumeOptions(gakuchika: "部活", selfPr: "粘り強さ", days: ["mon", "sat"], hours: "17時以降", commute: 0)
        XCTAssertEqual(options.forSending.gakuchika, "部活")
        XCTAssertNil(options.forSending.days, "新卒用 : pas de cases アルバイト")
        options.template = .baito
        XCTAssertNil(options.forSending.selfPr, "アルバイト用 : pas de 自己PR séparé")
        XCTAssertEqual(options.forSending.days, ["mon", "sat"])
        XCTAssertNil(options.forSending.commute, "0 minute = non renseigné")
        options.template = .standard
        XCTAssertNil(options.forSending.hours)
        XCTAssertNil(options.forSending.gakuchika)
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

@MainActor
final class EsLinkTests: XCTestCase {
    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.lastRequest = nil
    }

    func testApplicationIdIsAlwaysSentAndNullUnlinks() throws {
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: JSONEncoder().encode(DraftInput(question: "Q"))) as? [String: Any])
        XCTAssertTrue(json["applicationId"] is NSNull, "null explicite pour délier côté serveur")
        XCTAssertTrue(json["industry"] is NSNull, "null explicite pour effacer le secteur côté serveur")
    }

    func testLinksByCompanyName() {
        let api = APIClient(baseURL: URL(string: "https://example.test")!, session: StubURLProtocol.session(), token: { "jeton" })
        let model = EsEditorModel(api: api, draft: nil, input: DraftInput(company: " 楽天 ", question: "Q"))
        model.applications = [JobApplication(id: "a1", company: "楽天", position: nil, url: nil, status: "es", steps: [], nextDeadline: nil)]
        XCTAssertEqual(model.linkedApplication?.id, "a1")
        model.input.company = "ソニー"
        XCTAssertNil(model.linkedApplication)
    }
}
