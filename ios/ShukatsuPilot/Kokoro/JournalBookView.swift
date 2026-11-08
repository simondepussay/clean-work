import SwiftUI
import UIKit

/// 日記を読む : le journal comme un livre, comme sur le web. Une page sur iPhone, une double page sur
/// iPad (assez large) ; on tourne les pages du doigt ou avec ‹ ›, de la plus ancienne à la plus récente.
/// Le livre s'ouvre sur les dernières pages.
///
/// La page qui se courbe est celle d'iOS (UIPageViewController, style « pageCurl ») : le geste suit
/// le doigt, ce qu'une animation dessinée à la main ne ferait pas aussi bien.
struct JournalBookView: View {
    let entries: [JournalEntry]
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Index de la première page visible ; sur deux pages, les doubles pages commencent aux index pairs.
    @State private var at: Int?

    private var pages: [JournalEntry] { entries.sorted { $0.date < $1.date } }

    var body: some View {
        GeometryReader { geo in
            let two = geo.size.width >= 760
            let step = two ? 2 : 1
            let last = pages.count - 1
            let first = at ?? (two ? last - last % 2 : last)
            let shown = (two ? [first, first + 1] : [first]).filter { $0 <= last }
            let bookWidth = min(two ? 920 : 460, geo.size.width - 32)
            let bookHeight = min(600, geo.size.height - 150)

            VStack(spacing: 18) {
                PageCurlBook(pages: pages, two: two, at: first, animated: !reduceMotion) { at = $0 }
                    .id(two) // une page ou deux : on reconstruit le livre
                    .frame(width: bookWidth, height: bookHeight)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                    .shadow(color: .black.opacity(0.45), radius: 30, y: 20)
                HStack(spacing: 16) {
                    navButton("chevron.left", tr("前のページ", "Previous page", "Page précédente"), enabled: first > 0) {
                        at = max(0, first - step)
                    }
                    Text("\(shown.map { String($0 + 1) }.joined(separator: "–")) / \(pages.count)")
                        .font(.footnote).monospacedDigit().foregroundStyle(.white.opacity(0.8))
                        .accessibilityLabel(tr("\(pages.count)ページ中\(first + 1)ページ目", "Page \(first + 1) of \(pages.count)", "Page \(first + 1) sur \(pages.count)"))
                    navButton("chevron.right", tr("次のページ", "Next page", "Page suivante"), enabled: first + step <= last) {
                        at = first + step
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .onChange(of: two) { _, isTwo in
                // Passage à la double page : on se cale sur une page paire (gauche).
                if let a = at, isTwo { at = a - a % 2 }
            }
        }
        .padding(.top, 40)
        .background(RadialGradient(colors: [Color(red: 0.231, green: 0.227, blue: 0.275), Color(red: 0.122, green: 0.129, blue: 0.188)],
                                   center: .center, startRadius: 0, endRadius: 700).ignoresSafeArea())
        .overlay(alignment: .topTrailing) {
            Button { dismiss() } label: {
                Image(systemName: "xmark").font(.body.weight(.semibold)).foregroundStyle(.white)
                    .frame(width: 42, height: 42).background(.white.opacity(0.12), in: Circle())
                    .overlay(Circle().stroke(.white.opacity(0.25)))
            }
            .accessibilityLabel(tr("閉じる", "Close", "Fermer"))
            .padding(16)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(tr("日記を読む", "Read the journal", "Feuilleter le journal"))
    }

    private func navButton(_ icon: String, _ label: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.body.weight(.semibold)).foregroundStyle(.white)
                .frame(width: 42, height: 42).background(.white.opacity(0.12), in: Circle())
                .overlay(Circle().stroke(.white.opacity(0.25)))
        }
        .disabled(!enabled).opacity(enabled ? 1 : 0.3)
        .accessibilityLabel(label)
    }
}

// MARK: - Le livre (UIPageViewController)

private struct PageCurlBook: UIViewControllerRepresentable {
    let pages: [JournalEntry]
    let two: Bool
    let at: Int
    let animated: Bool
    let onTurn: (Int) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIViewController(context: Context) -> UIPageViewController {
        let spine: UIPageViewController.SpineLocation = two ? .mid : .min
        let book = UIPageViewController(transitionStyle: .pageCurl, navigationOrientation: .horizontal,
                                        options: [.spineLocation: NSNumber(value: spine.rawValue)])
        book.isDoubleSided = two
        book.dataSource = context.coordinator
        book.delegate = context.coordinator
        book.view.backgroundColor = .clear
        book.setViewControllers(context.coordinator.spread(at), direction: .forward, animated: false)
        context.coordinator.shown = at
        return book
    }

    func updateUIViewController(_ book: UIPageViewController, context: Context) {
        context.coordinator.parent = self
        context.coordinator.turn(book)
    }

    final class Coordinator: NSObject, UIPageViewControllerDataSource, UIPageViewControllerDelegate {
        var parent: PageCurlBook
        var shown = 0
        var turning = false

        init(_ parent: PageCurlBook) { self.parent = parent }

        /// Les flèches ‹ › changent « at » : on tourne la page vers elle (le doigt, lui, passe par le délégué).
        /// Un appui pendant qu'une page tourne est rattrapé à la fin du mouvement.
        func turn(_ book: UIPageViewController) {
            let target = parent.at
            guard target != shown, !turning else { return }
            let forward = target > shown
            shown = target
            turning = parent.animated
            book.setViewControllers(spread(target), direction: forward ? .forward : .reverse, animated: parent.animated) { [weak self, weak book] _ in
                guard let self, let book else { return }
                turning = false
                turn(book)
            }
        }

        /// Nombre de pages du livre : sur deux pages, on complète par une page blanche pour finir à droite.
        private var count: Int { parent.two && parent.pages.count % 2 == 1 ? parent.pages.count + 1 : parent.pages.count }

        func page(_ i: Int) -> UIViewController? {
            guard i >= 0, i < count else { return nil }
            let side: BookPage.Side = parent.two ? (i % 2 == 0 ? .left : .right) : .single
            let host = PageHost(rootView: BookPage(entry: parent.pages.indices.contains(i) ? parent.pages[i] : nil, folio: i + 1, side: side))
            host.index = i
            host.view.backgroundColor = UIColor(BookPage.paper)
            return host
        }

        func spread(_ first: Int) -> [UIViewController] {
            (parent.two ? [first, first + 1] : [first]).compactMap(page)
        }

        func pageViewController(_ pvc: UIPageViewController, viewControllerBefore vc: UIViewController) -> UIViewController? {
            page(((vc as? PageHost)?.index ?? 0) - 1)
        }

        func pageViewController(_ pvc: UIPageViewController, viewControllerAfter vc: UIViewController) -> UIViewController? {
            page(((vc as? PageHost)?.index ?? 0) + 1)
        }

        func pageViewController(_ pvc: UIPageViewController, didFinishAnimating finished: Bool,
                                previousViewControllers: [UIViewController], transitionCompleted completed: Bool) {
            guard completed, let first = (pvc.viewControllers?.first as? PageHost)?.index else { return }
            shown = first
            DispatchQueue.main.async { self.parent.onTurn(first) }
        }
    }
}

private final class PageHost: UIHostingController<BookPage> {
    var index = 0
}

// MARK: - Une page

/// Papier crème lignée, écriture en mincho, date en haut et folio en bas, comme sur le web.
struct BookPage: View {
    enum Side { case left, right, single }
    static let paper = Color(red: 1, green: 0.992, blue: 0.973)       // #fffdf8
    static let sand = Color(red: 0.937, green: 0.902, blue: 0.851)    // #efe6d9
    static let ink = Color(red: 0.165, green: 0.165, blue: 0.208)     // #2a2a35
    static let dateInk = Color(red: 0.541, green: 0.478, blue: 0.4)   // #8a7a66
    static let folioInk = Color(red: 0.663, green: 0.604, blue: 0.525) // #a99a86

    let entry: JournalEntry?
    let folio: Int
    let side: Side

    /// Une ligne toutes les 32 points ; l'interligne complète la hauteur de la police pour tomber dessus.
    private static let line: CGFloat = 32
    private static let font = UIFont(name: "HiraMinProN-W3", size: 16) ?? .systemFont(ofSize: 16)
    private static let dateFont = UIFont(name: "HiraMinProN-W3", size: 14) ?? .systemFont(ofSize: 14)

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .topLeading) {
                Self.paper
                if let entry {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 12) {
                            Text(Self.longDate(entry.date))
                                .font(Font(Self.dateFont)).tracking(0.7).foregroundStyle(Self.dateInk)
                            Text(entry.text)
                                .font(Font(Self.font)).lineSpacing(Self.line - Self.font.lineHeight)
                                .foregroundStyle(Self.ink)
                                // Le cahier est ligné jusqu'en bas de la page, même pour un texte court.
                                .frame(maxWidth: .infinity, minHeight: max(0, geo.size.height - 34 - Self.dateFont.lineHeight - 12 - 48), alignment: .topLeading)
                                .background(alignment: .top) { rules }
                                .textSelection(.enabled)
                        }
                        .padding(.horizontal, 30).padding(.top, 34).padding(.bottom, 48)
                    }
                    .scrollBounceBehavior(.basedOnSize)
                    Text("\(folio)").font(.custom("HiraMinProN-W3", size: 12)).foregroundStyle(Self.folioInk)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom).padding(.bottom, 14)
                        .accessibilityHidden(true)
                }
            }
        }
        .overlay { spineShadow }
        .accessibilityElement(children: .combine)
    }

    /// Les lignes du cahier, sous chaque ligne de texte, jusqu'en bas de la page.
    private var rules: some View {
        GeometryReader { geo in
            Path { p in
                var y = Self.font.lineHeight + 3
                while y < geo.size.height - 4 {
                    p.move(to: CGPoint(x: 0, y: y)); p.addLine(to: CGPoint(x: geo.size.width, y: y))
                    y += Self.line
                }
            }
            .stroke(Self.sand, lineWidth: 1)
        }
    }

    /// L'ombre de la reliure, au centre de la double page.
    @ViewBuilder private var spineShadow: some View {
        let shade = Color(red: 60 / 255, green: 40 / 255, blue: 20 / 255).opacity(0.14)
        switch side {
        case .left: LinearGradient(colors: [.clear, shade], startPoint: UnitPoint(x: 0.9, y: 0.5), endPoint: .trailing).allowsHitTesting(false)
        case .right: LinearGradient(colors: [shade, .clear], startPoint: .leading, endPoint: UnitPoint(x: 0.1, y: 0.5)).allowsHitTesting(false)
        case .single: EmptyView()
        }
    }

    /// « 2026年11月7日(土) », « Saturday, November 7, 2026 », « samedi 7 novembre 2026 ».
    static func longDate(_ key: String) -> String {
        guard let date = ISO8601DateFormatter.dayOnly.date(from: key) else { return key }
        let f = DateFormatter()
        f.locale = Locale(identifier: tr("ja_JP", "en_US", "fr_FR"))
        f.setLocalizedDateFormatFromTemplate(HelpLanguage.saved == .ja ? "yMMMdEEE" : "yMMMMdEEEE")
        return f.string(from: date)
    }
}
