import Foundation

/// Le texte dans la langue choisie (globe de l'en-tête) : `tr("日本語", "English", "Français")`.
/// Comme sur le site, chaque texte est écrit dans les trois langues à l'endroit où il sert.
func tr(_ ja: String, _ en: String, _ fr: String) -> String {
    switch HelpLanguage.saved {
    case .ja: ja
    case .en: en
    case .fr: fr
    }
}

extension HelpLanguage {
    /// Première ouverture : la langue de l'iPhone si c'est ja, en ou fr ; sinon l'anglais.
    static var deviceDefault: HelpLanguage {
        for id in Locale.preferredLanguages {
            if let lang = HelpLanguage(rawValue: String(id.prefix(2))) { return lang }
        }
        return .en
    }

    /// Code affiché sur le globe.
    var code: String { rawValue.uppercased() }
}

/// Les messages de l'API arrivent en « 日本語 / English » : on n'en garde que la langue choisie
/// (l'anglais pour le français, l'API n'ayant pas de version française).
func apiMessage(_ text: String) -> String {
    let parts = text.components(separatedBy: " / ")
    guard parts.count == 2 else { return text }
    return HelpLanguage.saved == .ja ? parts[0] : parts[1]
}
