import SwiftUI

/// Onglet « 書類 » : les ES (guide et relecture par IA), les CV en PDF ou la スキル辞典, choisis par
/// trois petits boutons en haut de la feuille (comme sur le site).
struct DocumentsView: View {
    let api: APIClient
    @State private var kind: Kind = .es

    enum Kind { case es, pdf, skills }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 4) {
                switchButton(.es, title: "ES") { EsIcon() }
                switchButton(.pdf, title: tr("履歴書PDF", "CV in PDF", "CV en PDF")) { CvIcon() }
                switchButton(.skills, title: tr("スキル", "Skills", "Compétences")) { SkillsIcon() }
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
            case .skills:
                SkillsView(api: api)
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

/// スキル : une petite fiche, un ◎ bordeaux et un ○ bleu (même dessin que le site).
struct SkillsIcon: View {
    var body: some View {
        Canvas { c, size in
            let s = size.width / 28
            let card = Path(roundedRect: CGRect(x: 3.5 * s, y: 4 * s, width: 21 * s, height: 20 * s), cornerRadius: 3 * s)
            c.fill(card, with: .color(.cwBlue100)); c.stroke(card, with: .color(.cwBlue800), lineWidth: 1.6 * s)
            func ring(_ y: CGFloat, _ r: CGFloat) -> Path { Path(ellipseIn: CGRect(x: (9.5 - r) * s, y: (y - r) * s, width: 2 * r * s, height: 2 * r * s)) }
            c.fill(ring(10.5, 3), with: .color(.white)); c.stroke(ring(10.5, 3), with: .color(.cwBordeaux), lineWidth: 1.5 * s)
            c.stroke(ring(10.5, 1.2), with: .color(.cwBordeaux), lineWidth: 1.2 * s)
            c.fill(ring(18, 3), with: .color(.white)); c.stroke(ring(18, 3), with: .color(.cwBlue800), lineWidth: 1.5 * s)
            var lines = Path(); lines.move(to: CGPoint(x: 15 * s, y: 10.5 * s)); lines.addLine(to: CGPoint(x: 21 * s, y: 10.5 * s))
            lines.move(to: CGPoint(x: 15 * s, y: 18 * s)); lines.addLine(to: CGPoint(x: 19.5 * s, y: 18 * s))
            c.stroke(lines, with: .color(.cwBlue800), style: StrokeStyle(lineWidth: 1.6 * s, lineCap: .round))
        }
        .accessibilityHidden(true)
    }
}

/// スキル辞典 : des compétences classées ; un toucher = ○ (des notions), deux = ◎ (bien maîtrisée),
/// trois = plus rien. Une auto-évaluation : rien n'est vérifié.
struct SkillsView: View {
    let api: APIClient
    @State private var catalog: SkillCatalog?
    @State private var levels: [String: Int]?
    @State private var loadFailed = false
    @State private var saveFailed = false
    @State private var query = ""
    @State private var saveTask: Task<Void, Never>?

    var body: some View {
        ScrollView {
            if let catalog, let levels {
                content(catalog, levels)
            } else if loadFailed {
                Text(tr("読み込めませんでした", "Could not load", "Chargement impossible")).foregroundStyle(Color.cwMuted).padding(.top, 40)
            } else {
                ProgressView().padding(.top, 40)
            }
        }
        .task { await load() }
        .onDisappear { flush() }
    }

    private func content(_ catalog: SkillCatalog, _ levels: [String: Int]) -> some View {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        let sections = catalog.categories.map { c in
            (c, c.skills.filter { s in q.isEmpty || [s.name.ja, s.name.en, s.name.fr].contains { $0.lowercased().contains(q) } })
        }.filter { !$0.1.isEmpty }
        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Label { Text(tr("基礎がある", "Some knowledge", "Des notions")) } icon: { SkillMark(level: 1).scaleEffect(0.75).frame(width: 18, height: 18) }
                Label { Text(tr("得意", "Confident", "Bien maîtrisée")) } icon: { SkillMark(level: 2).scaleEffect(0.75).frame(width: 18, height: 18) }
                Spacer()
                Text("◎ \(levels.values.filter { $0 == 2 }.count)・○ \(levels.values.filter { $0 == 1 }.count)")
                    .fontWeight(.bold).foregroundStyle(Color.cwBlue800).monospacedDigit()
            }
            .font(.footnote).foregroundStyle(Color.cwMuted)
            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass").foregroundStyle(Color.cwMuted)
                TextField(tr("スキルを探す", "Find a skill", "Chercher une compétence"), text: $query)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
            }
            .padding(.horizontal, 12).padding(.vertical, 8)
            .overlay(Capsule().stroke(Color.cwLine))
            Text(tr("自己評価です。1回押すと○、2回で◎、もう1回で消えます。",
                    "A self-assessment: tap once for ○, twice for ◎, once more to clear.",
                    "Une auto-évaluation : un toucher pour ○, deux pour ◎, un de plus pour effacer."))
                .font(.footnote).foregroundStyle(Color.cwMuted)
            if saveFailed {
                Text(tr("保存できませんでした", "Could not save", "Enregistrement impossible")).font(.footnote).foregroundStyle(Color.cwBordeaux)
            }
            if sections.isEmpty {
                Text(tr("見つかりませんでした", "No match", "Aucun résultat")).foregroundStyle(Color.cwMuted)
            }
            ForEach(sections, id: \.0.id) { category, skills in
                Text(category.name.current).font(.subheadline.weight(.bold)).foregroundStyle(Color.cwBlue800).padding(.top, 8)
                    .accessibilityAddTraits(.isHeader)
                SkillFlow(spacing: 8) {
                    ForEach(skills) { skill in
                        SkillChip(name: skill.name.current, level: levels[skill.id] ?? 0) { cycle(skill.id) }
                    }
                }
            }
        }
        .padding(16)
    }

    private func load() async {
        guard catalog == nil else { return }
        async let list: SkillCatalog? = {
            guard let (data, _) = try? await URLSession.shared.data(from: AppConfig.siteURL.appending(path: "skills.json")) else { return nil }
            return try? JSONDecoder().decode(SkillCatalog.self, from: data)
        }()
        let saved = (try? await api.skillLevels()) ?? [:]
        guard let list = await list else { loadFailed = true; return }
        catalog = list
        levels = saved
    }

    private func cycle(_ id: String) {
        guard var next = levels else { return }
        switch next[id] ?? 0 {
        case 0: next[id] = 1
        case 1: next[id] = 2
        default: next[id] = nil
        }
        levels = next
        // Plusieurs touchers d'affilée partent en un seul envoi.
        saveTask?.cancel()
        saveTask = Task {
            try? await Task.sleep(for: .milliseconds(700))
            guard !Task.isCancelled else { return }
            await save(next)
        }
    }

    private func flush() {
        guard let task = saveTask, let levels else { return }
        task.cancel()
        saveTask = nil
        Task { await save(levels) }
    }

    private func save(_ next: [String: Int]) async {
        do { try await api.saveSkillLevels(next); saveFailed = false } catch { saveFailed = true }
    }
}

/// Une compétence : le rond à gauche, le nom ; la couleur suit le niveau.
private struct SkillChip: View {
    let name: String
    let level: Int
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                SkillMark(level: level)
                Text(name).font(.subheadline.weight(level == 2 ? .semibold : .regular))
            }
            .foregroundStyle(level == 2 ? Color.cwBordeaux : Color.cwBlue950)
            .padding(.leading, 6).padding(.trailing, 12).padding(.vertical, 5)
            .background(level == 2 ? Color.cwBordeaux50 : level == 1 ? Color.cwBlue50 : Color.white, in: Capsule())
            .overlay(Capsule().stroke(level == 2 ? Color.cwBordeaux : level == 1 ? Color.cwBlue300 : Color.cwLine))
            .animation(.easeOut(duration: 0.25), value: level)
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.selection, trigger: level)
        .accessibilityLabel("\(name)：\([tr("未選択", "not marked", "non cochée"), tr("○ 基礎がある", "○ some knowledge", "○ des notions"), tr("◎ 得意", "◎ confident", "◎ bien maîtrisée")][min(level, 2)])")
    }
}

/// Le rond dessiné à la main : le trait se dessine (et se défait quand on l'enlève), un petit rebond,
/// et pour ◎ un second trait à l'intérieur avec quelques éclats.
struct SkillMark: View {
    let level: Int
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var bounce = 1.0
    @State private var burst = 0.0

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.cwLine, style: StrokeStyle(lineWidth: 1.4, dash: [1.8, 3.6]))
                .padding(3)
                .opacity(level == 0 ? 1 : 0)
            SkillRing(drawn: level >= 1, color: level == 2 ? .cwBordeaux : .cwBlue700, inset: 3)
            SkillRing(drawn: level == 2, color: .cwBordeaux, inset: 7)
                .animation(reduceMotion ? nil : .easeInOut(duration: 0.4).delay(level == 2 ? 0.12 : 0), value: level)
            ForEach(0..<6, id: \.self) { i in
                Capsule()
                    .fill(Color.cwBordeaux)
                    .frame(width: 1.7, height: 2.4)
                    .offset(y: -12 - 3 * burst)
                    .opacity(burst > 0 && burst < 1 ? 1 - burst : 0)
                    .rotationEffect(.degrees(Double(i) * 60))
            }
        }
        .frame(width: 24, height: 24)
        .scaleEffect(bounce)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.45), value: level)
        .onChange(of: level) { _, new in
            guard !reduceMotion, new > 0 else { return }
            bounce = 0.75
            withAnimation(.bouncy(duration: 0.4)) { bounce = 1 }
            if new == 2 {
                burst = 0.01
                withAnimation(.easeOut(duration: 0.5).delay(0.2)) { burst = 1 }
            }
        }
        .accessibilityHidden(true)
    }
}

/// Un trait de cercle qui se dessine en partant d'en haut à gauche, comme au stylo.
private struct SkillRing: View {
    let drawn: Bool
    let color: Color
    let inset: CGFloat

    var body: some View {
        Circle()
            .trim(from: 0, to: drawn ? 1 : 0)
            .stroke(color, style: StrokeStyle(lineWidth: 2.2, lineCap: .round))
            .rotationEffect(.degrees(-115))
            .padding(inset)
            .opacity(drawn ? 1 : 0)
    }
}

/// Les étiquettes vont à la ligne quand la largeur est pleine.
private struct SkillFlow: Layout {
    var spacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(width: proposal.width ?? .infinity, subviews)
        return CGSize(width: proposal.width ?? rows.map(\.width).max() ?? 0, height: rows.last.map { $0.y + $0.height } ?? 0)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for row in arrange(width: bounds.width, subviews) {
            for (index, x) in row.items {
                subviews[index].place(at: CGPoint(x: bounds.minX + x, y: bounds.minY + row.y), proposal: .unspecified)
            }
        }
    }

    private struct Row { var items: [(Int, CGFloat)] = []; var width: CGFloat = 0; var height: CGFloat = 0; var y: CGFloat = 0 }

    private func arrange(width: CGFloat, _ subviews: Subviews) -> [Row] {
        var rows = [Row()]
        for (i, view) in subviews.enumerated() {
            let size = view.sizeThatFits(.unspecified)
            if rows[rows.count - 1].width > 0 && rows[rows.count - 1].width + spacing + size.width > width {
                let last = rows[rows.count - 1]
                rows.append(Row(y: last.y + last.height + spacing))
            }
            let x = rows[rows.count - 1].width == 0 ? 0 : rows[rows.count - 1].width + spacing
            rows[rows.count - 1].items.append((i, x))
            rows[rows.count - 1].width = x + size.width
            rows[rows.count - 1].height = max(rows[rows.count - 1].height, size.height)
        }
        return rows
    }
}
