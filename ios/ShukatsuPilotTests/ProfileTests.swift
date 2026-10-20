import XCTest
@testable import ShukatsuPilot

@MainActor
final class ProfileTests: XCTestCase {
    private func api() -> APIClient {
        APIClient(baseURL: URL(string: "https://example.test")!, session: StubURLProtocol.session(), token: { "jeton" })
    }

    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.lastRequest = nil
    }

    func testMissingProfileIsNil() async throws {
        StubURLProtocol.handler = { _ in (404, Data(#"{"error":"not_found"}"#.utf8)) }
        let profile = try await api().profile()
        XCTAssertNil(profile)
    }

    func testDecodesProfileAndIgnoresServerFields() async throws {
        StubURLProtocol.handler = { _ in (200, Data(#"""
        {"id":"u1","userId":"u1","updatedAt":"2026-10-20T00:00:00Z","nameKanji":"デプセ シモン","nameKana":"でぷせ しもん",
         "education":[{"school":"HAL東京","start":"2026-04","status":"enrolled"}],"work":[],"certifications":[],"languages":[]}
        """#.utf8)) }
        let loaded = try await api().profile()
        let profile = try XCTUnwrap(loaded)
        XCTAssertEqual(profile.nameKanji, "デプセ シモン")
        XCTAssertEqual(profile.education.first?.school, "HAL東京")
        XCTAssertEqual(profile.education.first?.status, .enrolled)
    }

    func testSaveSendsPutWithoutNilFieldsOrLocalIds() async throws {
        var sent: [String: Any] = [:]
        StubURLProtocol.handler = { request in
            let body = request.httpBodyStream.map { stream -> Data in
                stream.open(); defer { stream.close() }
                var data = Data(); var buffer = [UInt8](repeating: 0, count: 4096)
                while stream.hasBytesAvailable { let n = stream.read(&buffer, maxLength: buffer.count); if n <= 0 { break }; data.append(buffer, count: n) }
                return data
            } ?? request.httpBody ?? Data()
            sent = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any] ?? [:]
            return (200, body)
        }
        var profile = Profile()
        profile.nameKanji = "シモン"
        profile.nameKana = "しもん"
        profile.education = [.init(school: "HAL東京", start: "2026-04")]

        try await api().saveProfile(profile)

        XCTAssertEqual(StubURLProtocol.lastRequest?.httpMethod, "PUT")
        XCTAssertEqual(StubURLProtocol.lastRequest?.value(forHTTPHeaderField: "Content-Type"), "application/json")
        XCTAssertNil(sent["nameLatin"], "un champ facultatif vide ne doit pas être envoyé")
        let education = try XCTUnwrap(sent["education"] as? [[String: Any]])
        XCTAssertEqual(education.first?["school"] as? String, "HAL東京")
        XCTAssertNil(education.first?["id"], "l'identifiant local d'affichage ne doit pas partir")
    }

    func testValidationErrorsReachTheRightField() async {
        StubURLProtocol.handler = { _ in (400, Data(#"{"error":"invalid","issues":[{"path":"education.0.start","message":"mois au format AAAA-MM"}]}"#.utf8)) }
        let model = ProfileModel(api: api())
        model.profile.nameKanji = "シモン"

        let saved = await model.save()

        XCTAssertFalse(saved)
        XCTAssertEqual(model.status, .ready)
        XCTAssertEqual(model.error("education.0.start"), "mois au format AAAA-MM")
        XCTAssertNil(model.error("nameKanji"))
    }

    func testLoadThenSave() async {
        StubURLProtocol.handler = { request in
            request.httpMethod == "PUT" ? (200, Data(#"{"nameKanji":"シモン","nameKana":"しもん"}"#.utf8)) : (404, Data())
        }
        let model = ProfileModel(api: api())
        await model.load()
        XCTAssertEqual(model.status, .ready)
        XCTAssertEqual(model.profile, Profile())

        model.profile.nameKanji = "シモン"
        model.profile.nameKana = "しもん"
        let saved = await model.save()
        XCTAssertTrue(saved)
        XCTAssertEqual(model.status, .saved)
    }
}
