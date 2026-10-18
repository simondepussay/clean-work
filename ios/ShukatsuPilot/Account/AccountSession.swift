import Foundation
import MSAL

// Adapté de Kanji Otter (même principe, autre annuaire) : MSAL travaille par
// délégués, chaque étape est enveloppée ici en async/await pour que les écrans
// se lisent de haut en bas.

// MARK: - Ce dont l'app a besoin

/// Erreurs de compte, en termes que les écrans savent traduire.
enum AccountError: Error, Equatable {
    case notConfigured
    case emailAlreadyUsed
    case passwordTooWeak
    case invalidEmail
    case invalidCode
    case wrongEmailOrPassword
    case missingAttributes
    case other(String)
}

/// Inscription en attente du code envoyé par email.
protocol SignUpChallenge {
    var sentTo: String { get }
    var codeLength: Int { get }
    /// Vérifie le code ; en cas de succès l'utilisateur est connecté.
    func submit(code: String) async throws
    func resend() async throws -> SignUpChallenge
}

/// Le compte dans l'annuaire, indépendamment de MSAL (et simulable dans les tests).
@MainActor
protocol AccountService: AnyObject {
    var isSignedIn: Bool { get }
    var email: String? { get }
    var displayName: String? { get }
    func signIn(email: String, password: String) async throws
    func signUp(email: String, password: String, name: String) async throws -> SignUpChallenge
    func signOut()
    func accessToken() async throws -> String
}

// MARK: - Implémentation MSAL (authentification native)

@MainActor
final class AccountSession: AccountService {
    static let shared = AccountSession()

    private var client: MSALNativeAuthPublicClientApplication?
    private var account: MSALNativeAuthUserAccountResult?

    private init() {
        guard let clientId = AppConfig.entraClientId,
              let subdomain = AppConfig.entraTenantSubdomain else { return }
        do {
            // .password pour email + mot de passe, .OOB pour le code envoyé par email.
            client = try MSALNativeAuthPublicClientApplication(
                clientId: clientId,
                tenantSubdomain: subdomain,
                challengeTypes: [.OOB, .password]
            )
            account = client?.getNativeAuthUserAccount()
        } catch {
            print("🔐 MSAL indisponible :", error.localizedDescription)
        }
    }

    var isSignedIn: Bool { account != nil }

    var email: String? {
        guard let account else { return nil }
        let claims = account.account.accountClaims
        return (claims?["preferred_username"] as? String) ?? (claims?["email"] as? String) ?? account.account.username
    }

    var displayName: String? {
        account?.account.accountClaims?["name"] as? String
    }

    // MARK: Connexion

    func signIn(email: String, password: String) async throws {
        let client = try requireClient()
        let parameters = MSALNativeAuthSignInParameters(username: email)
        parameters.password = password
        account = try await withCheckedThrowingContinuation { continuation in
            let delegate = SignInAdapter(continuation: continuation)
            retain(delegate)
            client.signIn(parameters: parameters, delegate: delegate)
        }
    }

    func signOut() {
        account?.signOut()
        account = nil
    }

    // MARK: Inscription

    func signUp(email: String, password: String, name: String) async throws -> SignUpChallenge {
        let client = try requireClient()
        let parameters = MSALNativeAuthSignUpParameters(username: email)
        parameters.password = password
        // Le parcours de l'annuaire exige le nom (attribut displayName).
        parameters.attributes = ["displayName": name]
        let (state, sentTo, codeLength) = try await withCheckedThrowingContinuation { continuation in
            let delegate = SignUpStartAdapter(continuation: continuation)
            retain(delegate)
            client.signUp(parameters: parameters, delegate: delegate)
        }
        return PendingSignUp(session: self, state: state, sentTo: sentTo, codeLength: codeLength)
    }

    fileprivate func complete(_ state: SignUpCodeRequiredState, code: String) async throws {
        let signInState: SignInAfterSignUpState = try await withCheckedThrowingContinuation { continuation in
            let delegate = SignUpVerifyAdapter(continuation: continuation)
            retain(delegate)
            state.submitCode(code: code, delegate: delegate)
        }
        // Connexion dans la foulée, sans ressaisir le mot de passe.
        account = try await withCheckedThrowingContinuation { continuation in
            let delegate = SignInAfterSignUpAdapter(continuation: continuation)
            retain(delegate)
            signInState.signIn(parameters: MSALNativeAuthSignInAfterSignUpParameters(), delegate: delegate)
        }
    }

    fileprivate func resend(_ state: SignUpCodeRequiredState) async throws -> SignUpChallenge {
        let (newState, sentTo, codeLength) = try await withCheckedThrowingContinuation { continuation in
            let delegate = SignUpResendAdapter(continuation: continuation)
            retain(delegate)
            state.resendCode(delegate: delegate)
        }
        return PendingSignUp(session: self, state: newState, sentTo: sentTo, codeLength: codeLength)
    }

    // MARK: Jeton pour l'API

    /// Jeton valable pour la permission « access » ; MSAL le renouvelle tout seul.
    func accessToken() async throws -> String {
        guard let account else { throw APIError.unauthorized }
        guard let scope = AppConfig.entraAPIScope else { throw AccountError.notConfigured }
        let parameters = MSALNativeAuthGetAccessTokenParameters()
        parameters.scopes = [scope]
        return try await withCheckedThrowingContinuation { continuation in
            let delegate = AccessTokenAdapter(continuation: continuation)
            retain(delegate)
            account.getAccessToken(parameters: parameters, delegate: delegate)
        }
    }

    // MARK: Détails

    private func requireClient() throws -> MSALNativeAuthPublicClientApplication {
        guard let client else { throw AccountError.notConfigured }
        return client
    }

    /// MSAL ne garde pas ses délégués : sans cette référence, l'objet
    /// disparaîtrait avant la réponse et la continuation ne reprendrait jamais.
    private var pendingDelegates: [AnyObject] = []
    private func retain(_ delegate: AnyObject) { pendingDelegates.append(delegate) }
    fileprivate func release(_ delegate: AnyObject) { pendingDelegates.removeAll { $0 === delegate } }
}

private struct PendingSignUp: SignUpChallenge {
    let session: AccountSession
    let state: SignUpCodeRequiredState
    let sentTo: String
    let codeLength: Int

    func submit(code: String) async throws { try await session.complete(state, code: code) }
    func resend() async throws -> SignUpChallenge { try await session.resend(state) }
}

// MARK: - Adaptateurs délégué → async/await
//
// Un adaptateur par étape : il reprend la continuation une seule fois, puis se
// retire de la liste des délégués retenus.

private func describe(_ error: MSALNativeAuthError, fallback: String) -> AccountError {
    .other(error.errorDescription ?? fallback)
}

/// Reprend une continuation une seule fois, puis libère l'adaptateur.
/// (Pas de classe de base générique : les délégués MSAL sont des protocoles @objc,
/// qu'une classe à ascendance générique ne peut pas adopter.)
private final class Once<Value> {
    private var continuation: CheckedContinuation<Value, Error>?
    init(_ continuation: CheckedContinuation<Value, Error>) { self.continuation = continuation }

    func resume(_ result: Result<Value, Error>, releasing owner: AnyObject) {
        guard let continuation else { return }
        self.continuation = nil
        continuation.resume(with: result)
        Task { @MainActor in AccountSession.shared.release(owner) }
    }
}

private typealias CodeRequired = (SignUpCodeRequiredState, String, Int)

private final class SignInAdapter: SignInStartDelegate {
    private let once: Once<MSALNativeAuthUserAccountResult>
    init(continuation: CheckedContinuation<MSALNativeAuthUserAccountResult, Error>) { once = Once(continuation) }
    private func finish(_ result: Result<MSALNativeAuthUserAccountResult, Error>) { once.resume(result, releasing: self) }

    func onSignInStartError(error: SignInStartError) {
        if error.isUserNotFound || error.isInvalidUsername || error.isInvalidCredentials {
            finish(.failure(AccountError.wrongEmailOrPassword))
        } else {
            finish(.failure(describe(error, fallback: "connexion impossible")))
        }
    }

    func onSignInCompleted(result: MSALNativeAuthUserAccountResult) { finish(.success(result)) }

    /// Le parcours est « email + mot de passe » : un code demandé ici est anormal,
    /// on le signale plutôt que de laisser l'écran attendre.
    func onSignInCodeRequired(newState: SignInCodeRequiredState, sentTo: String,
                              channelTargetType: MSALNativeAuthChannelType, codeLength: Int) {
        finish(.failure(AccountError.other("code demandé à la connexion")))
    }
}

private final class SignUpStartAdapter: SignUpStartDelegate {
    private let once: Once<CodeRequired>
    init(continuation: CheckedContinuation<CodeRequired, Error>) { once = Once(continuation) }
    private func finish(_ result: Result<CodeRequired, Error>) { once.resume(result, releasing: self) }

    func onSignUpStartError(error: SignUpStartError) {
        if error.isUserAlreadyExists {
            finish(.failure(AccountError.emailAlreadyUsed))
        } else if error.isInvalidPassword {
            finish(.failure(AccountError.passwordTooWeak))
        } else if error.isInvalidUsername {
            finish(.failure(AccountError.invalidEmail))
        } else {
            finish(.failure(describe(error, fallback: "inscription impossible")))
        }
    }

    func onSignUpAttributesInvalid(attributeNames: [String]) {
        finish(.failure(AccountError.missingAttributes))
    }

    func onSignUpCodeRequired(newState: SignUpCodeRequiredState, sentTo: String,
                              channelTargetType: MSALNativeAuthChannelType, codeLength: Int) {
        finish(.success((newState, sentTo, codeLength)))
    }
}

private final class SignUpResendAdapter: SignUpResendCodeDelegate {
    private let once: Once<CodeRequired>
    init(continuation: CheckedContinuation<CodeRequired, Error>) { once = Once(continuation) }
    private func finish(_ result: Result<CodeRequired, Error>) { once.resume(result, releasing: self) }

    func onSignUpResendCodeError(error: ResendCodeError, newState: SignUpCodeRequiredState?) {
        finish(.failure(describe(error, fallback: "envoi du code impossible")))
    }

    func onSignUpResendCodeCodeRequired(newState: SignUpCodeRequiredState, sentTo: String,
                                        channelTargetType: MSALNativeAuthChannelType, codeLength: Int) {
        finish(.success((newState, sentTo, codeLength)))
    }
}

private final class SignUpVerifyAdapter: SignUpVerifyCodeDelegate {
    private let once: Once<SignInAfterSignUpState>
    init(continuation: CheckedContinuation<SignInAfterSignUpState, Error>) { once = Once(continuation) }
    private func finish(_ result: Result<SignInAfterSignUpState, Error>) { once.resume(result, releasing: self) }

    func onSignUpVerifyCodeError(error: VerifyCodeError, newState: SignUpCodeRequiredState?) {
        finish(.failure(error.isInvalidCode ? AccountError.invalidCode : describe(error, fallback: "code refusé")))
    }

    func onSignUpCompleted(newState: SignInAfterSignUpState) { finish(.success(newState)) }

    /// Ne devrait pas arriver (le nom est envoyé dès le début) : on le signale.
    func onSignUpAttributesRequired(attributes: [MSALNativeAuthRequiredAttribute], newState: SignUpAttributesRequiredState) {
        finish(.failure(AccountError.missingAttributes))
    }
}

private final class SignInAfterSignUpAdapter: SignInAfterSignUpDelegate {
    private let once: Once<MSALNativeAuthUserAccountResult>
    init(continuation: CheckedContinuation<MSALNativeAuthUserAccountResult, Error>) { once = Once(continuation) }
    private func finish(_ result: Result<MSALNativeAuthUserAccountResult, Error>) { once.resume(result, releasing: self) }

    func onSignInAfterSignUpError(error: SignInAfterSignUpError) {
        finish(.failure(describe(error, fallback: "connexion impossible après l'inscription")))
    }

    func onSignInCompleted(result: MSALNativeAuthUserAccountResult) { finish(.success(result)) }
}

private final class AccessTokenAdapter: CredentialsDelegate {
    private let once: Once<String>
    init(continuation: CheckedContinuation<String, Error>) { once = Once(continuation) }
    private func finish(_ result: Result<String, Error>) { once.resume(result, releasing: self) }

    func onAccessTokenRetrieveError(error: RetrieveAccessTokenError) {
        finish(.failure(describe(error, fallback: "jeton indisponible")))
    }

    func onAccessTokenRetrieveCompleted(result: MSALNativeAuthTokenResult) { finish(.success(result.accessToken)) }
}
