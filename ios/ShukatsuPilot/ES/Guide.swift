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
        /// Début 3部構成 ; {k1} et {k2} = mots-clés choisis.
        let starter: Starter?
    }

    struct Starter: Decodable, Equatable {
        let one: String
        let two: String

        /// Le squelette avec les mots-clés choisis (aucun : 〇〇).
        func text(_ picked: [String]) -> String {
            let k1 = picked.first ?? "〇〇"
            if picked.count >= 2 {
                return two.replacingOccurrences(of: "{k1}", with: k1).replacingOccurrences(of: "{k2}", with: picked[1])
            }
            return one.replacingOccurrences(of: "{k1}", with: k1)
        }
    }

    struct Difference: Decodable, Equatable {
        let question: Text
        let answer: Text
    }

    /// Règle de la checklist instantanée (même moteur que web/src/es/checks.ts).
    struct Check: Decodable, Equatable {
        let id: String
        let kinds: [String]
        let level: String
        let pattern: String?
        let unless: String?
        let firstSentenceOver: Int?
        let maxKeywords: Int?
        let message: Text
        let missingTip: Text?
    }

    struct CheckResult: Equatable, Identifiable {
        enum State: Int { case bad, warn, tip, good }
        let id: String
        let state: State
        let text: Text
    }

    let intro: Text
    let steps: [Text]
    let exampleWarning: Text
    let types: [QuestionType]
    let differences: [Difference]?
    let keywords: [Text]?
    let checks: [Check]?

    /// Checklist sans IA : les règles du cours appliquées au texte (repère des mots, pas le sens).
    func runChecks(kind: String, body: String) -> [CheckResult] {
        guard !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return [] }
        var results: [CheckResult] = []
        for check in checks ?? [] where check.kinds.contains(kind) {
            var hit = false
            var n = 0
            if let pattern = check.pattern {
                hit = Self.matches(pattern, body) && !(check.unless.map { Self.matches($0, body) } ?? false)
            } else if let limit = check.firstSentenceOver {
                n = charCount(Self.firstSentence(body))
                hit = n > limit
            } else if let limit = check.maxKeywords {
                n = keywordsIn(body).count
                hit = n > limit
            }
            if hit, let state = Self.state(check.level) {
                let fill = { (s: String) in s.replacingOccurrences(of: "{n}", with: String(n)) }
                results.append(CheckResult(id: check.id, state: state, text: Text(ja: fill(check.message.ja), en: fill(check.message.en), fr: fill(check.message.fr))))
            } else if !hit, check.level == "good", let tip = check.missingTip {
                results.append(CheckResult(id: check.id, state: .tip, text: tip))
            }
        }
        // À corriger d'abord, puis à vérifier, les conseils, et ce qui va bien (tri stable).
        return results.enumerated().sorted { ($0.element.state.rawValue, $0.offset) < ($1.element.state.rawValue, $1.offset) }.map(\.element)
    }

    /// Mots-clés de qualités présents dans le texte.
    func keywordsIn(_ body: String) -> [String] {
        (keywords ?? []).map(\.ja).filter { body.contains($0) }
    }

    /// Première phrase, sans le 【titre】 éventuel.
    static func firstSentence(_ body: String) -> String {
        var rest = Substring(body.drop(while: { $0.isWhitespace }))
        if rest.hasPrefix("【"), let end = rest.firstIndex(of: "】") {
            rest = rest[rest.index(after: end)...].drop(while: { $0.isWhitespace })
        }
        let stops: Set<Character> = ["。", "！", "？", "!", "?", "\n"]
        return String(rest.prefix(while: { !stops.contains($0) })).trimmingCharacters(in: .whitespaces)
    }

    private static func state(_ level: String) -> CheckResult.State? {
        switch level { case "bad": .bad; case "warn": .warn; case "good": .good; default: nil }
    }

    private static func matches(_ pattern: String, _ text: String) -> Bool {
        guard let re = try? NSRegularExpression(pattern: pattern) else { return false }
        return re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
    }
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
