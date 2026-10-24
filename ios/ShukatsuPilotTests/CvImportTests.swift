import XCTest
@testable import ShukatsuPilot

@MainActor
final class CvImportTests: XCTestCase {
    private func api() -> APIClient {
        APIClient(baseURL: URL(string: "https://example.test")!, session: StubURLProtocol.session(), token: { "jeton" })
    }

    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.lastRequest = nil
        UserDefaults.standard.removeObject(forKey: HelpLanguage.storageKey)
    }

    private let response = Data(#"""
    {"nameKanji":"デプセ シモン","email":"cv@example.test",
     "education":[{"school":"HAL東京","start":"2026-04","status":"enrolled"},{"school":"Université de Genève","start":"2019-01","end":"2022-01","status":"graduated"}],
     "work":[],"certifications":[{"category":"language","name":"日本語能力試験 N2","date":""}],"languages":[{"language":"fr","level":"native"}],
     "check":[{"path":"education.1.start","reason":"month"},{"path":"certifications.0.date","reason":"date"}]}
    """#.utf8)

    func testImportPostsTextAndDecodes() async throws {
        StubURLProtocol.handler = { _ in (200, self.response) }
        let cv = try await api().importCv("CV text long enough to be read by the model")
        XCTAssertEqual(StubURLProtocol.lastRequest?.url?.path, "/api/profile/import")
        XCTAssertEqual(cv.education.count, 2)
        XCTAssertEqual(cv.check.first, CvImport.Check(path: "education.1.start", reason: "month"))
    }

    func testLimitAndTooShortAreDistinguished() async {
        StubURLProtocol.handler = { _ in (429, Data(#"{"error":"limit","reason":"day"}"#.utf8)) }
        do { _ = try await api().importCv("x"); XCTFail() } catch { XCTAssertEqual(error as? CvImportError, .limit) }
        StubURLProtocol.handler = { _ in (400, Data(#"{"error":"invalid","issues":[]}"#.utf8)) }
        do { _ = try await api().importCv("x"); XCTFail() } catch { XCTAssertEqual(error as? CvImportError, .tooShort) }
    }

    /// Comme sur le site : champs vides seulement, lignes déjà présentes ignorées, dates devinées signalées.
    func testApplyFillsEmptyFieldsAndFlagsGuessedDates() throws {
        UserDefaults.standard.set("en", forKey: HelpLanguage.storageKey)
        let cv = try JSONDecoder().decode(CvImport.self, from: response)
        let model = ProfileModel(api: api())
        model.profile.email = "kept@example.test"
        model.profile.education = [.init(school: "hal東京 ", start: "2026-04")]

        model.apply(cv)

        XCTAssertEqual(model.profile.nameKanji, "デプセ シモン")
        XCTAssertEqual(model.profile.email, "kept@example.test")
        XCTAssertEqual(model.profile.education.map(\.school), ["hal東京 ", "Université de Genève"])
        XCTAssertEqual(model.profile.certifications.count, 1)
        XCTAssertTrue(model.imported)
        XCTAssertEqual(model.issues.map(\.path), ["education.1.start", "certifications.0.date"])
        XCTAssertEqual(model.error("certifications.0.date"), "Enter the date (it wasn't in the CV)")
    }
}
