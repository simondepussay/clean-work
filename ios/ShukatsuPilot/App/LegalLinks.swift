import SwiftUI

/// Liens vers la politique de confidentialité et les conditions d'utilisation (S04),
/// pages du site (web/public/privacy.html et terms.html), en anglais si l'iPhone n'est pas en japonais.
struct LegalLinks: View {
    var body: some View {
        if let base = AppConfig.apiBaseURL {
            HStack(spacing: 16) {
                Link("プライバシーポリシー / Privacy", destination: Self.url(base, "privacy.html"))
                Link("利用規約 / Terms", destination: Self.url(base, "terms.html"))
            }
            .font(.footnote)
        }
    }

    static func url(_ base: URL, _ page: String) -> URL {
        let japanese = Locale.preferredLanguages.first?.hasPrefix("ja") ?? false
        return base.appending(path: page).appending(queryItems: japanese ? [] : [URLQueryItem(name: "lang", value: "en")])
    }
}
