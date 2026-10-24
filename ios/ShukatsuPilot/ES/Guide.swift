import Foundation

/// Guide d'écriture des ES : le même fichier que le web (web/public/es-guide.json),
/// téléchargé depuis le site, pour n'avoir qu'un seul texte à tenir à jour.
struct Guide: Decodable, Equatable {
    struct Text: Decodable, Equatable {
        let ja: String
        let en: String
        let fr: String
        func callAsFunction(_ lang: HelpLanguage) -> String {
            switch lang { case .ja: ja; case .en: en; case .fr: fr }
        }
    }

    struct QuestionType: Decodable, Equatable, Identifiable {
        let id: String
        let label: Text
        let question: String
        let charLimit: Int
        let purpose: Text
        let structure: [Text]
        let tips: [Text]
        let example: String
    }

    let intro: Text
    let steps: [Text]
    let exampleWarning: Text
    let types: [QuestionType]
}

/// Langue de l'aide et des explications de la relecture, retenue sur l'appareil.
enum HelpLanguage: String, CaseIterable, Identifiable {
    case ja, en, fr
    var id: String { rawValue }
    var label: String {
        switch self { case .ja: "日本語"; case .en: "English"; case .fr: "Français" }
    }

    static let storageKey = "help-language"
    static var saved: HelpLanguage {
        HelpLanguage(rawValue: UserDefaults.standard.string(forKey: storageKey) ?? "") ?? deviceDefault
    }
}
