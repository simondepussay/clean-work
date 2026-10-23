import XCTest
@testable import ShukatsuPilot

@MainActor
private final class FakeAccount: AccountService {
    var isSignedIn = false
    var email: String? = "simon@example.com"
    var displayName: String? = "Simon"
    var signInError: Error?
    private(set) var signedOut = false

    func signIn(email: String, password: String) async throws {
        if let signInError { throw signInError }
        isSignedIn = true
    }

    func signUp(email: String, password: String, name: String) async throws -> SignUpChallenge {
        FakeChallenge(account: self)
    }

    func signOut() {
        isSignedIn = false
        signedOut = true
    }

    func accessToken() async throws -> String { "jeton" }
}

private struct FakeChallenge: SignUpChallenge {
    let account: FakeAccount
    let sentTo = "simon@example.com"
    let codeLength = 6
    func submit(code: String) async throws {
        guard code == "123456" else { throw AccountError.invalidCode }
        await MainActor.run { account.isSignedIn = true }
    }
    func resend() async throws -> SignUpChallenge { self }
}

@MainActor
final class AppModelTests: XCTestCase {
    private let meJSON = Data(#"{"userId":"u1","email":"simon@example.com","name":"Simon","hasProfile":false}"#.utf8)

    private func makeModel(_ account: FakeAccount? = nil) -> AppModel {
        let account = account ?? FakeAccount()
        let api = APIClient(baseURL: URL(string: "https://example.test")!, session: StubURLProtocol.session(),
                            token: { try await account.accessToken() })
        return AppModel(account: account, api: api)
    }

    override func tearDown() { StubURLProtocol.handler = nil }

    func testDisabledWithoutConfiguration() {
        XCTAssertEqual(AppModel(account: nil, api: nil).phase, .disabled)
    }

    func testStartsSignedInWhenSessionExists() {
        let account = FakeAccount()
        account.isSignedIn = true
        XCTAssertEqual(makeModel(account).phase, .signedIn)
    }

    func testSignInLoadsMe() async throws {
        StubURLProtocol.handler = { _ in (200, self.meJSON) }
        let model = makeModel()
        XCTAssertEqual(model.phase, .signedOut)

        try await model.signIn(email: "simon@example.com", password: "motdepasse")

        XCTAssertEqual(model.phase, .signedIn)
        XCTAssertEqual(model.me, .loaded(Me(userId: "u1", email: "simon@example.com", name: "Simon", hasProfile: false)))
    }

    func testFailedSignInStaysSignedOut() async {
        let account = FakeAccount()
        account.signInError = AccountError.wrongEmailOrPassword
        let model = makeModel(account)
        await assertThrows(AccountError.wrongEmailOrPassword) { try await model.signIn(email: "x@y.z", password: "mauvais!") }
        XCTAssertEqual(model.phase, .signedOut)
    }

    func testSignUpWithCode() async throws {
        StubURLProtocol.handler = { _ in (200, self.meJSON) }
        let model = makeModel()
        let challenge = try await model.signUp(email: "simon@example.com", password: "motdepasse", name: "Simon")
        await assertThrows(AccountError.invalidCode) { try await model.finishSignUp(challenge, code: "000000") }
        XCTAssertEqual(model.phase, .signedOut)

        try await model.finishSignUp(challenge, code: "123456")
        XCTAssertEqual(model.phase, .signedIn)
    }

    func testRejectedTokenSignsOut() async throws {
        StubURLProtocol.handler = { _ in (401, Data()) }
        let account = FakeAccount()
        account.isSignedIn = true
        let model = makeModel(account)

        await model.refreshMe()

        XCTAssertEqual(model.phase, .signedOut)
        XCTAssertTrue(account.signedOut)
    }

    func testServerErrorKeepsSessionAndShowsFailure() async {
        StubURLProtocol.handler = { _ in (500, Data()) }
        let account = FakeAccount()
        account.isSignedIn = true
        let model = makeModel(account)

        await model.refreshMe()

        XCTAssertEqual(model.phase, .signedIn)
        XCTAssertEqual(model.me, .failed)
    }

    func testSignOut() async {
        let account = FakeAccount()
        account.isSignedIn = true
        let model = makeModel(account)
        await model.signOut()
        XCTAssertEqual(model.phase, .signedOut)
        XCTAssertEqual(model.me, .idle)
    }

    func testDeleteAccountCallsAPIThenSignsOut() async throws {
        StubURLProtocol.handler = { _ in (204, Data()) }
        let account = FakeAccount()
        account.isSignedIn = true
        let model = makeModel(account)

        try await model.deleteAccount()

        XCTAssertEqual(StubURLProtocol.lastRequest?.httpMethod, "DELETE")
        XCTAssertEqual(StubURLProtocol.lastRequest?.url?.path, "/api/me")
        XCTAssertEqual(model.phase, .signedOut)
        XCTAssertTrue(account.signedOut)
    }

    func testFailedDeletionKeepsSession() async {
        StubURLProtocol.handler = { _ in (503, Data()) }
        let account = FakeAccount()
        account.isSignedIn = true
        let model = makeModel(account)

        await assertThrows(APIError.notConfigured) { try await model.deleteAccount() }

        XCTAssertEqual(model.phase, .signedIn)
        XCTAssertFalse(account.signedOut)
    }
}
