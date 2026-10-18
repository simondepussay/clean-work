import XCTest
@testable import ShukatsuPilot

final class APIClientTests: XCTestCase {
    private let base = URL(string: "https://example.test")!

    private func client(token: String = "jeton") -> APIClient {
        APIClient(baseURL: base, session: StubURLProtocol.session(), token: { token })
    }

    override func tearDown() {
        StubURLProtocol.handler = nil
        StubURLProtocol.lastRequest = nil
    }

    func testMeSendsTokenInCustomHeaderNotAuthorization() async throws {
        StubURLProtocol.handler = { _ in (200, Data(#"{"userId":"u1","email":"a@b.c","name":"Simon","hasProfile":false}"#.utf8)) }
        let me = try await client().me()

        XCTAssertEqual(me, Me(userId: "u1", email: "a@b.c", name: "Simon", hasProfile: false))
        let request = try XCTUnwrap(StubURLProtocol.lastRequest)
        XCTAssertEqual(request.url?.absoluteString, "https://example.test/api/me")
        XCTAssertEqual(request.value(forHTTPHeaderField: "x-shukatsu-token"), "jeton")
        XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
    }

    func testUnauthorized() async {
        StubURLProtocol.handler = { _ in (401, Data(#"{"error":"unauthorized"}"#.utf8)) }
        await assertThrows(APIError.unauthorized) { _ = try await self.client().me() }
    }

    func testNotConfigured() async {
        StubURLProtocol.handler = { _ in (503, Data()) }
        await assertThrows(APIError.notConfigured) { _ = try await self.client().me() }
    }

    func testServerError() async {
        StubURLProtocol.handler = { _ in (500, Data()) }
        await assertThrows(APIError.server(status: 500)) { _ = try await self.client().me() }
    }

    func testInvalidJSON() async {
        StubURLProtocol.handler = { _ in (200, Data("pas du json".utf8)) }
        await assertThrows(APIError.invalidResponse) { _ = try await self.client().me() }
    }
}

func assertThrows<E: Error & Equatable>(_ expected: E, file: StaticString = #filePath, line: UInt = #line,
                                        _ body: () async throws -> Void) async {
    do {
        try await body()
        XCTFail("aucune erreur, attendu \(expected)", file: file, line: line)
    } catch let error as E {
        XCTAssertEqual(error, expected, file: file, line: line)
    } catch {
        XCTFail("erreur inattendue \(error)", file: file, line: line)
    }
}
