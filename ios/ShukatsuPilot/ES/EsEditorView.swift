import SwiftUI

/// Une ES : saisie avec compteur, guide, relecture IA, historique et changements.
struct EsEditorView: View {
    @State var model: EsEditorModel
    let list: EsModel

    var body: some View {
        Form {
            Section {
                HStack {
                    TextField(tr("企業（空欄＝共通）", "Company (blank = general)", "Entreprise (vide = général)"), text: optional($model.input.company))
                    if !list.applications.isEmpty {
                        Menu {
                            ForEach(list.applications) { app in Button(app.company) { model.input.company = app.company } }
                        } label: { Image(systemName: "building.2").accessibilityLabel(tr("応募から選ぶ", "Choose from applications", "Choisir parmi les candidatures")) }
                    }
                }
                if model.linkedApplication != nil {
                    Label(tr("応募と連携", "Linked to your application", "Lié à votre candidature"), systemImage: "link").font(.caption).foregroundStyle(.green)
                }
                TextField(tr("文字数制限", "Character limit", "Limite de caractères"), value: $model.input.charLimit, format: .number)
                    .keyboardType(.numberPad)
                if let e = model.error("charLimit") { Text(e).font(.caption).foregroundStyle(.red) }
                TextField(tr("設問", "Question *", "Question *"), text: $model.input.question, axis: .vertical)
                if let e = model.error("question") { Text(e).font(.caption).foregroundStyle(.red) }
            }

            if let guide = list.guide, let type = guide.types.first(where: { $0.id == model.input.kind }) {
                GuideSection(guide: guide, type: type, lang: list.language)
            }

            Section {
                TextEditor(text: $model.input.body).frame(minHeight: 220)
            } header: {
                Text(tr("本文", "Answer", "Réponse"))
            } footer: {
                HStack {
                    Spacer()
                    Text(counter).monospacedDigit().foregroundStyle(model.isOver ? .red : .secondary).bold(model.isOver)
                }
            }

            ReviewSection(model: model, lang: list.language)
        }
        .navigationTitle(model.input.question.isEmpty ? "ES" : model.input.question)
        .cleanList()
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(model.status == .saved ? tr("保存済み ✓", "Saved ✓", "Enregistré ✓") : tr("保存", "Save", "Enregistrer")) { Task { await model.save() } }
                    .disabled(model.status == .saving)
            }
        }
        .task {
            model.applications = list.applications
            await model.load()
        }
    }

    private var counter: String {
        guard let limit = model.input.charLimit else { return "\(model.count)" + tr("字", " chars", " car.") }
        let over = model.count - limit
        return over > 0 ? "\(model.count) / \(limit)\(tr("字", " chars", " car.")) — " + tr("\(over)字オーバー", "\(over) over", "\(over) de trop") : "\(model.count) / \(limit)\(tr("字", " chars", " car."))"
    }

    private func optional(_ value: Binding<String?>) -> Binding<String> {
        Binding(get: { value.wrappedValue ?? "" },
                set: { value.wrappedValue = $0.trimmingCharacters(in: .whitespaces).isEmpty ? nil : $0 })
    }
}

/// But, structure, conseils et exemple d'un type de question.
private struct GuideSection: View {
    let guide: Guide
    let type: Guide.QuestionType
    let lang: HelpLanguage

    var body: some View {
        Section {
            DisclosureGroup(tr("書き方ガイド", "How to write", "Comment l'écrire")) {
                Text(type.purpose(lang))
                Text(tr("構成", "Structure", "Structure")).font(.caption).foregroundStyle(.secondary)
                ForEach(Array(type.structure.enumerated()), id: \.offset) { i, s in Text("\(i + 1). \(s(lang))").font(.callout) }
                Text(tr("ポイント", "Tips", "Conseils")).font(.caption).foregroundStyle(.secondary)
                ForEach(Array(type.tips.enumerated()), id: \.offset) { _, t in Text("• \(t(lang))").font(.callout) }
                DisclosureGroup(tr("例を見る（\(charCount(type.example))字）", "See an example (\(charCount(type.example)) chars)", "Voir un exemple (\(charCount(type.example)) car.)")) {
                    Text(guide.exampleWarning(lang)).font(.caption).foregroundStyle(.orange)
                    Text(type.example).font(.callout).textSelection(.enabled)
                }
            }
        }
    }
}

/// Relecture IA (S14), limites (S16), historique et changements (S15).
private struct ReviewSection: View {
    let model: EsEditorModel
    let lang: HelpLanguage

    var body: some View {
        Section(tr("AI添削", "AI review", "Relecture IA")) {
            Button {
                Task { await model.runReview(language: lang) }
            } label: {
                HStack {
                    Text(model.reviewing ? tr("添削中…", "Reviewing…", "Relecture…") : tr("AI添削", "AI review", "Relecture IA"))
                    if model.reviewing { Spacer(); ProgressView() }
                }
            }
            .disabled(model.reviewing || model.usage?.today == 0)
            if let usage = model.usage {
                Text(tr("残り：今日 \(usage.today)・今月 \(usage.month)", "Left: \(usage.today) today · \(usage.month) this month", "Restant : \(usage.today) aujourd'hui · \(usage.month) ce mois-ci")).font(.caption).foregroundStyle(.secondary)
            }
            if let refusal = model.refusal {
                Text(Self.message(refusal)).foregroundStyle(.orange)
            }
        }

        if model.history.count > 0 {
            Section(tr("履歴", "History", "Historique")) {
                ScrollView(.horizontal) {
                    HStack {
                        ForEach(Array(model.history.enumerated().reversed()), id: \.element.id) { index, review in
                            Button("\(review.score)") { model.show(index) }
                                .buttonStyle(.bordered)
                                .tint(index == model.shown ? .accentColor : .secondary)
                        }
                    }
                }
                if let review = model.review { ChangesView(since: review.bodySnapshot, current: model.input.body) }
            }
        }

        if let review = model.review {
            Section {
                Text("\(review.score) / 100").font(.title.bold())
                Text(review.summary)
                ForEach(review.strengths, id: \.self) { Text("✓ \($0)").foregroundStyle(.green) }
            }
            Section(tr("指摘", "Issues", "Remarques")) {
                ForEach(Array(review.issues.enumerated()), id: \.offset) { index, issue in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(Self.category(issue.category)).font(.caption).foregroundStyle(.secondary)
                        Text(issue.quote).strikethrough().foregroundStyle(.red)
                        Text("→ \(issue.suggestion)").foregroundStyle(.green)
                        Text(issue.problem).font(.callout).foregroundStyle(.secondary)
                        Button(model.applied.contains(index) ? tr("適用済み", "Applied", "Appliqué") : tr("適用", "Apply", "Appliquer")) { model.apply(index) }
                            .disabled(model.applied.contains(index))
                            .buttonStyle(.bordered)
                    }
                    .padding(.vertical, 4)
                }
            }
        }
    }

    static func category(_ id: String) -> String {
        ["keigo": tr("敬語", "Keigo", "Keigo"), "grammar": tr("文法", "Grammar", "Grammaire"), "wording": tr("表現", "Wording", "Formulation"),
         "structure": tr("構成", "Structure", "Structure"), "star": "STAR", "length": tr("文字数", "Length", "Longueur"),
         "fit": tr("企業との一致", "Fit with the company", "Lien avec l'entreprise")][id] ?? id
    }

    static func message(_ refusal: ReviewRefusal) -> String {
        let day = { (date: Date?) in date.map { $0.formatted(date: .numeric, time: .omitted) } ?? "" }
        switch refusal {
        case .limit(let reason, let date) where reason == "budget":
            return tr("今月のAI添削は終了しました。\(day(date))から再開します", "AI review is paused until \(day(date))", "La relecture IA reprend le \(day(date))")
        case .limit(_, let date):
            return tr("添削回数の上限です。\(day(date))から使えます", "Limit reached, available again on \(day(date))", "Limite atteinte, de nouveau disponible le \(day(date))")
        case .emptyBody: return tr("本文を入力してください", "Write your answer first", "Écrivez d'abord votre réponse")
        case .notConfigured: return tr("AI添削は準備中です", "AI review is not available yet", "La relecture IA n'est pas encore disponible")
        case .failed: return tr("AI添削に失敗しました。回数は使われていません", "The review failed; it was not counted", "La relecture a échoué ; elle n'a pas été comptée")
        }
    }
}

/// Ce qui a changé depuis une relecture : supprimé en rouge barré, ajouté en vert.
private struct ChangesView: View {
    let since: String
    /// Texte actuel (pas « body », réservé par SwiftUI pour le contenu de la vue).
    let current: String

    var body: some View {
        if since == current {
            Text(tr("この添削のあと、本文は変わっていません", "No changes since this review", "Aucun changement depuis cette relecture")).font(.caption).foregroundStyle(.secondary)
        } else {
            let parts = Diff.parts(from: since, to: current)
            let stats = Diff.stats(parts)
            VStack(alignment: .leading, spacing: 4) {
                Text(tr("この添削からの変更", "Changes", "Modifications") + " · +\(stats.added) / −\(stats.removed)" + tr("字", " chars", " car.")).font(.caption).foregroundStyle(.secondary)
                Text(parts.reduce(AttributedString()) { text, part in
                    var piece = AttributedString(part.text)
                    switch part.kind {
                    case .same: break
                    case .add: piece.foregroundColor = .green; piece.underlineStyle = .single
                    case .del: piece.foregroundColor = .red; piece.strikethroughStyle = .single
                    }
                    return text + piece
                })
            }
        }
    }
}
