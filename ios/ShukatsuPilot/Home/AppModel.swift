import Foundation
import Observation

/// État de l'app : quel écran afficher, et ce que l'API sait du compte connecté.
@MainActor
@Observable
final class AppModel {
    enum Phase: Equatable {
        /// Annuaire ou API non configurés : la connexion est « bientôt disponible ».
        case disabled
        case signedOut
        case signedIn
    }

    enum MeState: Equatable {
        case idle
        case loading
        case loaded(Me)
        case failed
    }

    private(set) var phase: Phase
    private(set) var me: MeState = .idle

    private let account: AccountService?
    private let api: APIClient?

    init(account: AccountService?, api: APIClient?) {
        self.account = account
        self.api = api
        if let account, api != nil {
            phase = account.isSignedIn ? .signedIn : .signedOut
        } else {
            phase = .disabled
        }
    }

    /// Modèle de production : MSAL et l'API définie dans Info.plist.
    static func live() -> AppModel {
        guard AppConfig.isConfigured, let baseURL = AppConfig.apiBaseURL else {
            return AppModel(account: nil, api: nil)
        }
        let session = AccountSession.shared
        return AppModel(account: session, api: APIClient(baseURL: baseURL, token: { try await session.accessToken() }))
    }

    var email: String? { account?.email }
    var displayName: String? { account?.displayName }

    func signIn(email: String, password: String) async throws {
        guard let account else { throw AccountError.notConfigured }
        try await account.signIn(email: email, password: password)
        phase = .signedIn
        await refreshMe()
    }

    func signUp(email: String, password: String, name: String) async throws -> SignUpChallenge {
        guard let account else { throw AccountError.notConfigured }
        return try await account.signUp(email: email, password: password, name: name)
    }

    /// Fin de l'inscription : le code est vérifié et l'utilisateur connecté.
    func finishSignUp(_ challenge: SignUpChallenge, code: String) async throws {
        try await challenge.submit(code: code)
        phase = .signedIn
        await refreshMe()
    }

    func signOut() {
        account?.signOut()
        phase = account == nil ? .disabled : .signedOut
        me = .idle
    }

    /// Supprime le compte (données puis annuaire, côté API), puis déconnecte (S25).
    func deleteAccount() async throws {
        guard let api else { throw AccountError.notConfigured }
        try await api.deleteAccount()
        signOut()
    }

    func refreshMe() async {
        guard phase == .signedIn, let api else { return }
        me = .loading
        do {
            me = .loaded(try await api.me())
        } catch APIError.unauthorized {
            // Session expirée ou refusée par l'API : on repart de l'écran de connexion.
            signOut()
        } catch {
            me = .failed
        }
    }
}
