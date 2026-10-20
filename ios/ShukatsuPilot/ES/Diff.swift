import Foundation

/// Différences entre deux versions d'une ES (S15) : même algorithme que le web (LCS par
/// programmation dynamique), caractère par caractère, phrase par phrase pour les très longs textes.
enum Diff {
    enum Kind: Equatable { case same, add, del }

    struct Part: Equatable {
        let kind: Kind
        var text: String
    }

    private static let maxCells = 4_000_000

    static func parts(from before: String, to after: String) -> [Part] {
        let byChar = before.count * after.count <= maxCells
        let a = byChar ? before.map(String.init) : sentences(before)
        let b = byChar ? after.map(String.init) : sentences(after)

        var dp = Array(repeating: Array(repeating: 0, count: b.count + 1), count: a.count + 1)
        for i in stride(from: a.count - 1, through: 0, by: -1) {
            for j in stride(from: b.count - 1, through: 0, by: -1) {
                dp[i][j] = a[i] == b[j] ? dp[i + 1][j + 1] + 1 : max(dp[i + 1][j], dp[i][j + 1])
            }
        }

        var result: [Part] = []
        func push(_ kind: Kind, _ text: String) {
            if result.last?.kind == kind { result[result.count - 1].text += text } else { result.append(Part(kind: kind, text: text)) }
        }
        var i = 0, j = 0
        while i < a.count && j < b.count {
            if a[i] == b[j] { push(.same, a[i]); i += 1; j += 1 }
            else if dp[i + 1][j] >= dp[i][j + 1] { push(.del, a[i]); i += 1 }
            else { push(.add, b[j]); j += 1 }
        }
        while i < a.count { push(.del, a[i]); i += 1 }
        while j < b.count { push(.add, b[j]); j += 1 }
        return result
    }

    static func stats(_ parts: [Part]) -> (added: Int, removed: Int) {
        parts.reduce(into: (0, 0)) { total, part in
            if part.kind == .add { total.0 += part.text.count }
            if part.kind == .del { total.1 += part.text.count }
        }
    }

    private static func sentences(_ text: String) -> [String] {
        var out: [String] = []
        var current = ""
        for c in text {
            current.append(c)
            if "。！？!?".contains(c) || c.isNewline { out.append(current); current = "" }
        }
        if !current.isEmpty { out.append(current) }
        return out
    }
}
