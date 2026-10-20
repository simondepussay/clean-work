import SwiftUI

/// Écran « ES » : explication, liste, création à partir d'un type de question.
struct EsListView: View {
    @State var model: EsModel
    @State private var choosing = false

    var body: some View {
        List {
            Section {
                Picker("解説の言語 / Help language", selection: $model.language) {
                    ForEach(HelpLanguage.allCases) { Text($0.label).tag($0) }
                }
            }
            if let guide = model.guide {
                Section {
                    DisclosureGroup("ESとは？ / What is an ES?") {
                        Text(guide.intro(model.language))
                        ForEach(Array(guide.steps.enumerated()), id: \.offset) { i, step in
                            Text("\(i + 1). \(step(model.language))").font(.callout)
                        }
                    }
                }
            }
            Section("ES") {
                Button("＋ 新しいES / New") { choosing = true }
                switch model.drafts {
                case nil:
                    ProgressView()
                case let drafts? where drafts.isEmpty:
                    Text("まだESがありません / No entry sheets yet").foregroundStyle(.secondary)
                case let drafts?:
                    ForEach(drafts) { draft in
                        NavigationLink {
                            editor(for: draft, input: nil)
                        } label: {
                            VStack(alignment: .leading) {
                                Text(draft.company ?? "共通 / General").font(.headline)
                                Text(draft.question).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                            }
                        }
                    }
                    .onDelete { offsets in
                        let targets = offsets.map { drafts[$0] }
                        Task { for d in targets { await model.delete(d) } }
                    }
                }
            }
        }
        .navigationTitle("ES")
        .task { if model.drafts == nil { await model.load() } }
        .refreshable { await model.load() }
        .navigationDestination(isPresented: $choosing) { TypePicker(model: model, editor: { editor(for: $0, input: $1) }) }
    }

    private func editor(for draft: Draft?, input: DraftInput?) -> EsEditorView {
        EsEditorView(model: EsEditorModel(api: model.api, draft: draft, input: input, onSaved: model.saved), list: model)
    }
}

/// Choix du type de question : la question et la limite sont préremplies.
private struct TypePicker: View {
    let model: EsModel
    let editor: (Draft?, DraftInput?) -> EsEditorView

    var body: some View {
        List {
            Section("設問のタイプを選ぶ / Choose the type of question") {
                ForEach(model.guide?.types ?? []) { type in
                    NavigationLink {
                        editor(nil, DraftInput(kind: type.id, question: type.question, charLimit: type.charLimit))
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(type.label.ja).font(.headline)
                            Text("\(type.label(model.language)) · \(type.charLimit)字").font(.subheadline)
                            Text(type.purpose(model.language)).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                NavigationLink {
                    editor(nil, DraftInput())
                } label: {
                    VStack(alignment: .leading) {
                        Text("自由 / Other").font(.headline)
                        Text("設問を自分で入力 / Type the question yourself").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle("新しいES")
    }
}
