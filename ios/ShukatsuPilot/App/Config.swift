import Foundation

/// Réglages lus dans Info.plist (voir project.yml). Tous publics : l'identifiant
/// d'une app dans un annuaire n'est pas un secret, la sécurité repose sur le mot
/// de passe de l'utilisateur et sur la vérification des jetons par l'API.
enum AppConfig {
    static var entraClientId: String? { string("EntraClientID") }
    static var entraTenantSubdomain: String? { string("EntraTenantSubdomain") }
    static var entraAPIScope: String? { string("EntraAPIScope") }
    static var apiBaseURL: URL? { string("APIBaseURL").flatMap(URL.init(string:)) }
    /// Le site (guides partagés avec le web, pages légales). L'API est sur un autre domaine depuis
    /// son passage sur Azure Functions : ces fichiers ne sont plus à l'adresse de l'API.
    static var siteURL: URL {
        #if DEBUG
        // Pour essayer un guide pas encore en ligne : argument de lancement « -siteURL http://localhost:5174 ».
        if let local = UserDefaults.standard.string(forKey: "siteURL").flatMap(URL.init(string:)) { return local }
        #endif
        return string("SiteURL").flatMap(URL.init(string:)) ?? URL(string: "https://cleanwork.simondepussay.com")!
    }
    static var supportEmail: String { string("SupportEmail") ?? "" }
    /// Délai avant la suppression définitive ; identique à RETENTION_DAYS dans l'API.
    static let retentionDays = 30

    /// Faux tant que l'annuaire n'est pas renseigné : l'app affiche alors « bientôt disponible ».
    static var isConfigured: Bool {
        entraClientId != nil && entraTenantSubdomain != nil && entraAPIScope != nil && apiBaseURL != nil
    }

    private static func string(_ key: String) -> String? {
        guard let value = Bundle.main.object(forInfoDictionaryKey: key) as? String,
              !value.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
        return value
    }
}
