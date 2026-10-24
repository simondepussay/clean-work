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
    /// Vrai juste après un import de CV : le formulaire est rempli mais pas encore enregistré.
    private(set) var imported = false

    let api: APIClient

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
            imported = false
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

    /// Remplit le formulaire avec un CV (comme sur le site) : seuls les champs vides sont remplis,
    /// les lignes nouvelles sont ajoutées, et les dates devinées sont signalées à vérifier.
    func apply(_ cv: CvImport) {
        var p = profile
        func fill(_ field: WritableKeyPath<Profile, String?>, _ value: String?) {
            if let value, !value.isEmpty, (p[keyPath: field] ?? "").isEmpty { p[keyPath: field] = value }
        }
        if let v = cv.nameKanji, !v.isEmpty, p.nameKanji.isEmpty { p.nameKanji = v }
        if let v = cv.nameKana, !v.isEmpty, p.nameKana.isEmpty { p.nameKana = v }
        fill(\.nameLatin, cv.nameLatin); fill(\.birthDate, cv.birthDate); fill(\.email, cv.email)
        fill(\.phone, cv.phone); fill(\.address, cv.address)

        func same(_ a: String, _ b: String) -> Bool {
            a.trimmingCharacters(in: .whitespaces).lowercased() == b.trimmingCharacters(in: .whitespaces).lowercased()
        }
        // Pour chaque ligne du CV : son index dans le formulaire, ou nil si elle y était déjà.
        var rows: [String: [Int?]] = [:]
        rows["education"] = cv.education.map { e in
            if p.education.contains(where: { same($0.school, e.school) }) { return nil }
            p.education.append(e); return p.education.count - 1
        }
        rows["work"] = cv.work.map { w in
            if p.work.contains(where: { same($0.company, w.company) }) { return nil }
            p.work.append(w); return p.work.count - 1
        }
        rows["certifications"] = cv.certifications.map { c in
            if p.certifications.contains(where: { same($0.name, c.name) }) { return nil }
            p.certifications.append(c); return p.certifications.count - 1
        }
        rows["languages"] = cv.languages.map { l in
            if p.languages.contains(where: { $0.language == l.language }) { return nil }
            p.languages.append(l); return p.languages.count - 1
        }
        profile = p
        imported = true
        // « education.1.start » dans la réponse → l'index de la ligne dans le formulaire.
        issues = cv.check.compactMap { check in
            let parts = check.path.split(separator: ".").map(String.init)
            guard parts.count == 3, let i = Int(parts[1]), let list = rows[parts[0]], list.indices.contains(i), let row = list[i] else { return nil }
            return Issue(path: "\(parts[0]).\(row).\(parts[2])", message: check.reason == "date"
                ? tr("取得年月を入力してください（CVに書いていませんでした）", "Enter the date (it wasn't in the CV)", "Indiquez la date (absente du CV)")
                : tr("月を確認してください（CVに書いていませんでした）", "Check the month (it wasn't in the CV)", "Vérifiez le mois (absent du CV)"))
        }
    }

    /// Message d'erreur pour un champ, par son chemin (« nameKanji », « education.0.start »…).
    func error(_ path: String) -> String? { issues.first { $0.path == path }.map { apiMessage($0.message) } }
}
