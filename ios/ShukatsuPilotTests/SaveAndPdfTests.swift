import XCTest
@testable import ShukatsuPilot

@MainActor
final class SaveAndPdfTests: XCTestCase {
    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.headers = nil
    }

    private func api() -> APIClient {
        APIClient(baseURL: URL(string: "https://example.test")!, session: StubURLProtocol.session(), token: { "jeton" })
    }

    private let saved = #"{"id":"d1","kind":"free","question":"Q","body":"avant","updatedAt":"t"}"#

    func testTextChangedDuringTheSaveIsNotMarkedSaved() async throws {
        let body = saved
        StubURLProtocol.handler = { _ in Thread.sleep(forTimeInterval: 0.4); return (201, Data(body.utf8)) }
        let model = EsEditorModel(api: api(), draft: nil, input: DraftInput(question: "Q"))
        model.input.body = "avant"
        let saving = Task { await model.save() }
        try await Task.sleep(for: .milliseconds(150))
        model.input.body = "avant, puis collé pendant l'envoi"
        _ = await saving.value
        XCTAssertNotEqual(model.status, .saved, "ce texte n'a pas été enregistré")
        XCTAssertTrue(model.hasChanges)
    }

    func testSavedTextHasNoChangesLeft() async throws {
        let body = saved
        StubURLProtocol.handler = { _ in (201, Data(body.utf8)) }
        let model = EsEditorModel(api: api(), draft: nil, input: DraftInput(question: "Q"))
        XCTAssertFalse(model.hasChanges, "nouvelle ES vide : rien à perdre")
        model.input.body = "avant"
        XCTAssertTrue(model.hasChanges)
        await model.save()
        XCTAssertEqual(model.status, .saved)
        XCTAssertFalse(model.hasChanges)
    }

    func testACopyWithTextCountsAsUnsaved() {
        let copy = EsEditorModel(api: api(), draft: nil, input: DraftInput(question: "Q", body: "別パターン"))
        XCTAssertTrue(copy.hasChanges)
    }

    func testRefusedTextIsReported() async throws {
        StubURLProtocol.handler = { _ in (400, Data(#"{"issues":[{"path":"body","message":"5000文字以内で入力してください / 5000 characters max"}]}"#.utf8)) }
        let model = EsEditorModel(api: api(), draft: nil, input: DraftInput(question: "Q", body: "x"))
        await model.save()
        XCTAssertNotNil(model.error("body"))
        XCTAssertNotEqual(model.status, .saved)
    }

    func testResumeReportsTheSectionsThatDoNotFit() async throws {
        StubURLProtocol.handler = { _ in (200, Data("%PDF-1.7".utf8)) }
        StubURLProtocol.headers = ["X-Resume-Cut": "history,appeal"]
        guard case .success(let pdf) = try await api().resume(.init()) else { return XCTFail("PDF attendu") }
        XCTAssertEqual(pdf.cut, ["history", "appeal"])
        XCTAssertTrue(ResumeView.cutMessage(pdf.cut).contains("志望動機") || ResumeView.cutMessage(pdf.cut).contains("Motivation"))
    }

    func testNothingCutWithoutTheHeader() async throws {
        StubURLProtocol.handler = { _ in (200, Data("%PDF-1.7".utf8)) }
        guard case .success(let pdf) = try await api().resume(.init()) else { return XCTFail("PDF attendu") }
        XCTAssertEqual(pdf.cut, [])
    }

    func testAmpersandAndPlusAreEncodedInQueries() {
        XCTAssertEqual(APIClient.queryValue("H&M"), "H%26M")
        XCTAssertEqual(APIClient.queryValue("A+B=C?"), "A%2BB%3DC%3F")
        XCTAssertEqual(APIClient.queryValue("東京"), "%E6%9D%B1%E4%BA%AC")
    }

    func testCompanySearchSendsTheWholeName() async {
        StubURLProtocol.handler = { _ in (200, Data("[]".utf8)) }
        _ = await api().searchCompanies("H&M")
        XCTAssertEqual(StubURLProtocol.lastRequest?.url?.query, "name=H%26M")
    }
}
