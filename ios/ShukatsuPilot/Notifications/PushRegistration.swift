import Foundation

/// Ce dont l'enregistrement a besoin de l'API (simulable dans les tests).
protocol DeviceRegistering {
    func registerDevice(token: String, environment: String) async throws -> Bool
    func unregisterDevice(token: String) async throws
}

extension APIClient: DeviceRegistering {}

/// Notifications push envoyées par le serveur (S26).
///
/// iOS donne à l'app un jeton propre à cet iPhone ; on l'envoie à l'API, qui s'en sert chaque
/// matin pour envoyer le résumé des échéances. Si le serveur confirme qu'il enverra
/// (« push: on »), les rappels locaux (S09) sont retirés pour ne pas recevoir tout en double.
/// Sinon (pas de réseau, APNs pas configuré), les rappels locaux restent : c'est le filet de sécurité.
@MainActor
final class PushRegistration {
    static let shared: PushRegistration = PushRegistration(clearLocal: { await DeadlineReminderScheduler.shared.removeLocal() })

    /// Builds lancés depuis Xcode : serveurs « sandbox » d'Apple ; TestFlight et App Store : « production ».
    static var environment: String {
        #if DEBUG
        "sandbox"
        #else
        "production"
        #endif
    }

    var api: DeviceRegistering?
    private let defaults: UserDefaults
    private let clearLocal: () async -> Void
    private enum Key {
        static let token = "push.token"
        static let serverActive = "push.serverActive"
    }

    init(defaults: UserDefaults = .standard, clearLocal: @escaping () async -> Void) {
        self.defaults = defaults
        self.clearLocal = clearLocal
    }

    /// Le serveur envoie-t-il les rappels de cet iPhone ?
    var isServerActive: Bool { defaults.bool(forKey: Key.serverActive) }

    /// Le jeton d'APNs est une suite d'octets ; l'API l'attend en hexadécimal.
    static func hex(_ token: Data) -> String {
        token.map { String(format: "%02x", $0) }.joined()
    }

    /// Appelé quand iOS fournit le jeton (à chaque lancement : il peut changer).
    func didReceive(deviceToken: Data) async {
        guard let api else { return }
        let token = Self.hex(deviceToken)
        let active = (try? await api.registerDevice(token: token, environment: Self.environment)) ?? false
        defaults.set(token, forKey: Key.token)
        defaults.set(active, forKey: Key.serverActive)
        if active { await clearLocal() }
    }

    /// À la déconnexion : l'API oublie cet iPhone, et les rappels locaux du compte sont retirés
    /// (la personne suivante sur cet iPhone ne doit pas voir les échéances de l'autre).
    func signOut() async {
        if let token = defaults.string(forKey: Key.token), let api {
            try? await api.unregisterDevice(token: token)
        }
        defaults.removeObject(forKey: Key.token)
        defaults.removeObject(forKey: Key.serverActive)
        await clearLocal()
    }
}
