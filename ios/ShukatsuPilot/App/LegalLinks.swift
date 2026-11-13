import SwiftUI

/// Liens vers la politique de confidentialité et les conditions d'utilisation (S04),
/// pages du site (web/public/privacy.html et terms.html), en anglais si l'iPhone n'est pas en japonais.
struct LegalLinks: View {
    var body: some View {
        HStack(spacing: 16) {
            Link(tr("プライバシーポリシー", "Privacy", "Confidentialité"), destination: Self.url(AppConfig.siteURL, "privacy.html"))
            Link(tr("利用規約", "Terms", "Conditions"), destination: Self.url(AppConfig.siteURL, "terms.html"))
        }
        .font(.footnote)
    }

    static func url(_ base: URL, _ page: String) -> URL {
        let japanese = Locale.preferredLanguages.first?.hasPrefix("ja") ?? false
        return base.appending(path: page).appending(queryItems: japanese ? [] : [URLQueryItem(name: "lang", value: "en")])
    }
}
