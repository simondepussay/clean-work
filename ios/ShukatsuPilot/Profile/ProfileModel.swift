import Foundation
import Observation

/// État du formulaire de profil : chargement, enregistrement, erreurs par champ.
@MainActor
@Observable
final class ProfileModel {
    enum Status: Equatable { case loading, ready, saving, saved, failed }

    var profile = Profile()
    private(set) var status: Status = .loading
    private(set) var issues: [Issue] = []

    private let api: APIClient

    init(api: APIClient) { self.api = api }

    func load() async {
        do {
            profile = try await api.profile() ?? Profile()
            status = .ready
        } catch {
            status = .failed
        }
    }

    /// Enregistre ; renvoie vrai si l'API a accepté le profil.
    @discardableResult
    func save() async -> Bool {
        status = .saving
        do {
            try await api.saveProfile(profile)
            issues = []
            status = .saved
            return true
        } catch APIError.invalid(let found) {
            issues = found
            status = .ready
        } catch {
            status = .failed
        }
        return false
    }

    /// Message d'erreur pour un champ, par son chemin (« nameKanji », « education.0.start »…).
    func error(_ path: String) -> String? { issues.first { $0.path == path }?.message }
}
