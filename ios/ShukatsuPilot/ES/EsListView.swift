import SwiftUI

/// Écran « ES » : explication, liste, création à partir d'un type de question.
struct EsListView: View {
    @State var model: EsModel
    @State private var choosing = false
    /// Recherche dans la liste, et dossiers d'entreprise dépliés.
    @State private var query = ""
    @State private var open: Set<String> = []
    /// Nombre d'ES à partir duquel la liste se range en dossiers par entreprise (comme sur le site).
    private static let groupFrom = 8

    var body: some View {
        List {
            if let guide = model.guide {
                Section {
                    DisclosureGroup(tr("ESとは？", "What is an ES?", "Qu'est-ce qu'une ES ?")) {
                        Text(guide.intro(model.language))
                        ForEach(Array(guide.steps.enumerated()), id: \.offset) { i, step in
                            Text("\(i + 1). \(step(model.language))").font(.callout)
                        }
                        if let differences = guide.differences {
                            Text(tr("設問の違い", "Similar questions, different answers", "Questions proches, réponses différentes")).font(.caption).foregroundStyle(.secondary)
                            ForEach(Array(differences.enumerated()), id: \.offset) { _, d in
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(d.question(model.language)).font(.callout.bold())
                                    Text(d.answer(model.language)).font(.callout)
                                }
                            }
                        }
                    }
                }
            }
            Section(tr("あなたのES", "Your entry sheets", "Vos ES")) {
                Button(tr("＋ 新しいES", "＋ New ES", "＋ Nouvelle ES")) { choosing = true }
                switch model.drafts {
                case nil:
                    ProgressView()
                case let drafts? where drafts.isEmpty:
                    Text(tr("まだESがありません", "No entry sheets yet", "Pas encore d'ES")).foregroundStyle(.secondary)
                case let drafts?:
                    // Peu d'ES : une liste simple, la plus récente d'abord.
                    if drafts.count <= Self.groupFrom {
                        rows(shown(drafts), withOwner: true)
                        if shown(drafts).isEmpty { noMatch }
                    }
                }
            }
            // Beaucoup d'ES : un dossier par entreprise (les ES communes en tête), replié.
            if let drafts = model.drafts, drafts.count > Self.groupFrom {
                let groups = grouped(shown(drafts))
                Section {
                    if groups.isEmpty { noMatch }
                    ForEach(groups, id: \.key) { group in
                        DisclosureGroup(isExpanded: expanded(group.key)) {
                            rows(group.items, withOwner: false)
                        } label: {
                            HStack {
                                Text(group.name).font(.headline).foregroundStyle(Color.cwBlue800)
                                Spacer()
                                Text("\(group.items.count)").font(.footnote).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("ES")
        .cleanList()
        .searchable(text: $query, prompt: tr("企業名・設問・本文で検索", "Search company, question, text", "Chercher entreprise, question, texte"))
        .task { if model.drafts == nil { await model.load() } }
        .refreshable { await model.load() }
        .navigationDestination(isPresented: $choosing) { TypePicker(model: model, editor: { editor(for: $0, input: $1) }) }
    }

    private var searching: Bool { !query.trimmingCharacters(in: .whitespaces).isEmpty }
    private var noMatch: some View {
        Text(tr("該当するESはありません", "No matching entry sheets", "Aucune ES correspondante")).foregroundStyle(.secondary)
    }

    private func owner(_ draft: Draft) -> String {
        draft.company ?? ([tr("共通", "General", "Général")] + CompanyProfile.industries.filter { $0.id == draft.industry }.map(\.name)).joined(separator: " · ")
    }

    /// La plus récemment modifiée d'abord, filtrée par la recherche.
    private func shown(_ drafts: [Draft]) -> [Draft] {
        let needle = query.trimmingCharacters(in: .whitespaces).lowercased()
        return drafts.sorted { $0.updatedAt > $1.updatedAt }
            .filter { d in needle.isEmpty || [owner(d), d.question, d.body].contains { $0.lowercased().contains(needle) } }
    }

    /// Les ES communes en tête, puis les entreprises par ordre alphabétique : un dossier se retrouve toujours au même endroit.
    private func grouped(_ drafts: [Draft]) -> [(key: String, name: String, items: [Draft])] {
        Dictionary(grouping: drafts) { $0.company ?? "" }
            .map { (key: $0.key, name: $0.key.isEmpty ? tr("共通", "General", "Général") : $0.key, items: $0.value) }
            .sorted { a, b in a.key.isEmpty != b.key.isEmpty ? a.key.isEmpty : a.name.localizedStandardCompare(b.name) == .orderedAscending }
    }

    /// Pendant une recherche, tous les dossiers trouvés sont dépliés.
    private func expanded(_ key: String) -> Binding<Bool> {
        Binding(get: { searching || open.contains(key) }, set: { if $0 { open.insert(key) } else { open.remove(key) } })
    }

    private func rows(_ drafts: [Draft], withOwner: Bool) -> some View {
        ForEach(drafts) { draft in
            NavigationLink {
                editor(for: draft, input: nil)
            } label: {
                VStack(alignment: .leading, spacing: 2) {
                    if withOwner { Text(owner(draft)).font(.headline) }
                    Text(draft.question).font(withOwner ? .subheadline : .subheadline.weight(.semibold)).foregroundStyle(withOwner ? Color.secondary : Color.cwBlue800).lineLimit(1)
                    let excerpt = draft.body.split(whereSeparator: \.isWhitespace).joined(separator: " ")
                    if !excerpt.isEmpty { Text(excerpt).font(.caption).foregroundStyle(.secondary).lineLimit(1) }
                    Text("\(charCount(draft.body))" + (draft.charLimit.map { " / \($0)" } ?? "") + tr("字", " chars", " car.")).font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
        .onDelete { offsets in
            let targets = offsets.map { drafts[$0] }
            Task { for d in targets { await model.delete(d) } }
        }
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
            Section(tr("設問のタイプを選ぶ", "Choose the type of question", "Choisir le type de question")) {
                ForEach(model.guide?.types ?? []) { type in
                    NavigationLink {
                        editor(nil, DraftInput(kind: type.id, question: type.question, charLimit: type.charLimit))
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(type.label.ja).font(.headline)
                            Text("\(type.label(model.language)) · \(type.charLimit)" + tr("字", " chars", " car.")).font(.subheadline)
                            Text(type.purpose(model.language)).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                NavigationLink {
                    editor(nil, DraftInput())
                } label: {
                    VStack(alignment: .leading) {
                        Text(tr("自由", "Other", "Libre")).font(.headline)
                        Text(tr("設問を自分で入力", "Type the question yourself", "Saisir la question soi-même")).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle(tr("新しいES", "New ES", "Nouvelle ES"))
        .cleanList()
    }
}
