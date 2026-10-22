import SwiftUI

/// Une ES : saisie avec compteur, guide, relecture IA, historique et changements.
struct EsEditorView: View {
    @State var model: EsEditorModel
    let list: EsModel

    var body: some View {
        Form {
            Section {
                HStack {
                    TextField("企業 / Company（空欄＝共通）", text: optional($model.input.company))
                    if !list.applications.isEmpty {
                        Menu {
                            ForEach(list.applications) { app in Button(app.company) { model.input.company = app.company } }
                        } label: { Image(systemName: "building.2").accessibilityLabel("応募から選ぶ / Choose from applications") }
                    }
                }
                if model.linkedApplication != nil {
                    Label("応募と連携 / Linked to your application", systemImage: "link").font(.caption).foregroundStyle(.green)
                }
                TextField("文字数制限 / Character limit", value: $model.input.charLimit, format: .number)
                    .keyboardType(.numberPad)
                if let e = model.error("charLimit") { Text(e).font(.caption).foregroundStyle(.red) }
                TextField("設問 / Question *", text: $model.input.question, axis: .vertical)
                if let e = model.error("question") { Text(e).font(.caption).foregroundStyle(.red) }
            }

            if let guide = list.guide, let type = guide.types.first(where: { $0.id == model.input.kind }) {
                GuideSection(guide: guide, type: type, lang: list.language)
            }

            Section {
                TextEditor(text: $model.input.body).frame(minHeight: 220)
            } header: {
                Text("本文 / Answer")
            } footer: {
                HStack {
                    Spacer()
                    Text(counter).monospacedDigit().foregroundStyle(model.isOver ? .red : .secondary).bold(model.isOver)
                }
            }

            ReviewSection(model: model, lang: list.language)
        }
        .navigationTitle(model.input.question.isEmpty ? "ES" : model.input.question)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(model.status == .saved ? "保存済み ✓" : "保存 / Save") { Task { await model.save() } }
                    .disabled(model.status == .saving)
            }
        }
        .task {
            model.applications = list.applications
            await model.load()
        }
    }

    private var counter: String {
        guard let limit = model.input.charLimit else { return "\(model.count)字" }
        let over = model.count - limit
        return over > 0 ? "\(model.count) / \(limit)字 — \(over)字オーバー" : "\(model.count) / \(limit)字"
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
            DisclosureGroup("書き方ガイド / How to write") {
                Text(type.purpose(lang))
                Text("構成 / Structure").font(.caption).foregroundStyle(.secondary)
                ForEach(Array(type.structure.enumerated()), id: \.offset) { i, s in Text("\(i + 1). \(s(lang))").font(.callout) }
                Text("ポイント / Tips").font(.caption).foregroundStyle(.secondary)
                ForEach(Array(type.tips.enumerated()), id: \.offset) { _, t in Text("• \(t(lang))").font(.callout) }
                DisclosureGroup("例を見る / See an example（\(charCount(type.example))字）") {
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
        Section("AI添削 / AI review") {
            Button {
                Task { await model.runReview(language: lang) }
            } label: {
                HStack {
                    Text(model.reviewing ? "添削中… / Reviewing…" : "AI添削 / AI review")
                    if model.reviewing { Spacer(); ProgressView() }
                }
            }
            .disabled(model.reviewing || model.usage?.today == 0)
            if let usage = model.usage {
                Text("残り / Left: 今日 \(usage.today) · 今月 \(usage.month)").font(.caption).foregroundStyle(.secondary)
            }
            if let refusal = model.refusal {
                Text(Self.message(refusal)).foregroundStyle(.orange)
            }
        }

        if model.history.count > 0 {
            Section("履歴 / History") {
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
            Section("指摘 / Issues") {
                ForEach(Array(review.issues.enumerated()), id: \.offset) { index, issue in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(Self.category(issue.category)).font(.caption).foregroundStyle(.secondary)
                        Text(issue.quote).strikethrough().foregroundStyle(.red)
                        Text("→ \(issue.suggestion)").foregroundStyle(.green)
                        Text(issue.problem).font(.callout).foregroundStyle(.secondary)
                        Button(model.applied.contains(index) ? "適用済み / Applied" : "適用 / Apply") { model.apply(index) }
                            .disabled(model.applied.contains(index))
                            .buttonStyle(.bordered)
                    }
                    .padding(.vertical, 4)
                }
            }
        }
    }

    static func category(_ id: String) -> String {
        ["keigo": "敬語 / Keigo", "grammar": "文法 / Grammar", "wording": "表現 / Wording",
         "structure": "構成 / Structure", "star": "STAR", "length": "文字数 / Length"][id] ?? id
    }

    static func message(_ refusal: ReviewRefusal) -> String {
        let day = { (date: Date?) in date.map { $0.formatted(date: .numeric, time: .omitted) } ?? "" }
        switch refusal {
        case .limit(let reason, let date) where reason == "budget":
            return "今月のAI添削は終了しました。\(day(date))から再開します / AI review is paused until \(day(date))"
        case .limit(_, let date):
            return "添削回数の上限です。\(day(date))から使えます / Limit reached, available again on \(day(date))"
        case .emptyBody: return "本文を入力してください / Write your answer first"
        case .notConfigured: return "AI添削は準備中です / AI review is not available yet"
        case .failed: return "AI添削に失敗しました。回数は使われていません / The review failed; it was not counted"
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
            Text("この添削のあと、本文は変わっていません / No changes since this review").font(.caption).foregroundStyle(.secondary)
        } else {
            let parts = Diff.parts(from: since, to: current)
            let stats = Diff.stats(parts)
            VStack(alignment: .leading, spacing: 4) {
                Text("この添削からの変更 / Changes · +\(stats.added) / −\(stats.removed)字").font(.caption).foregroundStyle(.secondary)
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
