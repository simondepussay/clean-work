import SwiftUI

/// Onglet « 書類 » : les ES (guide et relecture par IA) ou les CV en PDF, choisis par deux petits
/// boutons en haut de la feuille (comme sur le site).
struct DocumentsView: View {
    let api: APIClient
    @State private var kind: Kind = .es

    enum Kind { case es, pdf }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 4) {
                switchButton(.es, title: "ES") { EsIcon() }
                switchButton(.pdf, title: tr("履歴書PDF", "CV in PDF", "CV en PDF")) { CvIcon() }
            }
            .padding(4)
            .background(Color.cwBlue50, in: Capsule())
            .overlay(Capsule().stroke(Color.cwLine))
            .padding(.top, 12).padding(.bottom, 4)

            switch kind {
            case .es:
                NavigationStack {
                    // Le commutateur ES / CV sert déjà de titre : pas de barre en double.
                    EsListView(model: EsModel(api: api, guideURL: AppConfig.siteURL.appending(path: "es-guide.json")))
                        .toolbar(.hidden, for: .navigationBar)
                }
            case .pdf:
                NavigationStack { ResumeView(api: api).toolbar(.hidden, for: .navigationBar) }
            }
        }
    }

    private func switchButton(_ value: Kind, title: String, @ViewBuilder icon: () -> some View) -> some View {
        Button { kind = value } label: {
            HStack(spacing: 6) {
                icon().frame(width: 24, height: 24)
                Text(title).font(.subheadline.weight(.semibold))
            }
            .foregroundStyle(kind == value ? Color.cwBordeaux : Color.cwBlue800)
            .padding(.leading, 8).padding(.trailing, 14).padding(.vertical, 5)
            .background(kind == value ? Color.white : Color.clear, in: Capsule())
            .shadow(color: kind == value ? Color.cwBlue950.opacity(0.12) : .clear, radius: 2, y: 1)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(kind == value ? [.isSelected] : [])
    }
}

/// ES : une feuille, un trait d'écriture bordeaux et une plume (même dessin que le site).
struct EsIcon: View {
    var body: some View {
        Canvas { c, size in
            let s = size.width / 28
            func r(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> CGRect { CGRect(x: x * s, y: y * s, width: w * s, height: h * s) }
            let sheet = Path(roundedRect: r(4, 3.5, 15, 20), cornerRadius: 3 * s)
            c.fill(sheet, with: .color(.cwBlue100)); c.stroke(sheet, with: .color(.cwBlue800), lineWidth: 1.6 * s)
            var lines = Path(); lines.move(to: CGPoint(x: 7.5 * s, y: 9.5 * s)); lines.addLine(to: CGPoint(x: 15.5 * s, y: 9.5 * s))
            lines.move(to: CGPoint(x: 7.5 * s, y: 13 * s)); lines.addLine(to: CGPoint(x: 12.5 * s, y: 13 * s))
            c.stroke(lines, with: .color(.cwBlue800), style: StrokeStyle(lineWidth: 1.6 * s, lineCap: .round))
            var squiggle = Path(); squiggle.move(to: CGPoint(x: 7.5 * s, y: 17.5 * s))
            squiggle.addCurve(to: CGPoint(x: 11.1 * s, y: 17.5 * s), control1: CGPoint(x: 8.8 * s, y: 16.1 * s), control2: CGPoint(x: 9.8 * s, y: 18.7 * s))
            squiggle.addCurve(to: CGPoint(x: 14 * s, y: 17.7 * s), control1: CGPoint(x: 12.4 * s, y: 16.3 * s), control2: CGPoint(x: 13.1 * s, y: 16.2 * s))
            c.stroke(squiggle, with: .color(.cwBordeaux), style: StrokeStyle(lineWidth: 1.6 * s, lineCap: .round))
            var pen = Path(); pen.move(to: CGPoint(x: 17 * s, y: 21.5 * s)); pen.addLine(to: CGPoint(x: 18 * s, y: 17.9 * s))
            pen.addLine(to: CGPoint(x: 24.4 * s, y: 11.5 * s)); pen.addLine(to: CGPoint(x: 26.8 * s, y: 13.9 * s))
            pen.addLine(to: CGPoint(x: 20.4 * s, y: 20.3 * s)); pen.closeSubpath()
            c.fill(pen, with: .color(.white)); c.stroke(pen, with: .color(.cwBlue800), style: StrokeStyle(lineWidth: 1.6 * s, lineJoin: .round))
        }
        .accessibilityHidden(true)
    }
}

/// CV en PDF : une fiche avec photo et lignes, coin plié, étiquette « PDF » bordeaux.
struct CvIcon: View {
    var body: some View {
        Canvas { c, size in
            let s = size.width / 28
            var page = Path(); page.move(to: CGPoint(x: 6 * s, y: 3.5 * s)); page.addLine(to: CGPoint(x: 16.5 * s, y: 3.5 * s))
            page.addLine(to: CGPoint(x: 22 * s, y: 9 * s)); page.addLine(to: CGPoint(x: 22 * s, y: 23 * s))
            page.addLine(to: CGPoint(x: 4.5 * s, y: 23 * s)); page.addLine(to: CGPoint(x: 4.5 * s, y: 5 * s)); page.closeSubpath()
            c.fill(page, with: .color(.cwBlue100)); c.stroke(page, with: .color(.cwBlue800), style: StrokeStyle(lineWidth: 1.6 * s, lineJoin: .round))
            var fold = Path(); fold.move(to: CGPoint(x: 16.5 * s, y: 3.5 * s)); fold.addLine(to: CGPoint(x: 16.5 * s, y: 9 * s)); fold.addLine(to: CGPoint(x: 22 * s, y: 9 * s))
            c.stroke(fold, with: .color(.cwBlue800), style: StrokeStyle(lineWidth: 1.6 * s, lineJoin: .round))
            let photo = Path(roundedRect: CGRect(x: 7.5 * s, y: 8 * s, width: 5 * s, height: 6 * s), cornerRadius: 1.2 * s)
            c.fill(photo, with: .color(.white)); c.stroke(photo, with: .color(.cwBlue800), lineWidth: 1.4 * s)
            var line = Path(); line.move(to: CGPoint(x: 8 * s, y: 16.5 * s)); line.addLine(to: CGPoint(x: 15 * s, y: 16.5 * s))
            c.stroke(line, with: .color(.cwBlue800), style: StrokeStyle(lineWidth: 1.6 * s, lineCap: .round))
            c.fill(Path(roundedRect: CGRect(x: 13 * s, y: 18 * s, width: 12 * s, height: 7 * s), cornerRadius: 2 * s), with: .color(.cwBordeaux))
            c.draw(Text("PDF").font(.system(size: 5.2 * s, weight: .bold)).foregroundColor(.white), at: CGPoint(x: 19 * s, y: 21.6 * s))
        }
        .accessibilityHidden(true)
    }
}
