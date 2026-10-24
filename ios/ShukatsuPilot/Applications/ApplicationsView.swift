import SwiftUI

/// Candidatures (S07, S08) : liste groupée par étape ; glisser pour avancer ou reculer.
struct ApplicationsView: View {
    @State var model: ApplicationsModel
    @State private var editing: EditorTarget?
    @State private var showingWaiting = false

    struct EditorTarget: Identifiable {
        let id = UUID()
        let app: JobApplication?
    }

    var body: some View {
        List {
            if model.failed {
                Text(tr("保存できませんでした", "Could not save", "Enregistrement impossible")).foregroundStyle(.red)
            }
            switch model.applications {
            case nil:
                ProgressView()
            case let apps? where apps.isEmpty:
                ContentUnavailableView(tr("まだ応募がありません", "No applications yet", "Pas encore de candidature"), systemImage: "tray", description: Text(tr("＋ で追加できます", "Tap + to add one", "Touchez + pour en ajouter une")))
            default:
                Button { showingWaiting = true } label: {
                    HStack {
                        Label(tr("応募済み・返事待ち", "Applied, awaiting a reply", "Postulées, en attente de réponse"), systemImage: "paperplane")
                        Spacer()
                        Text("\(model.waiting.count)").foregroundStyle(.secondary)
                    }
                }
                ForEach(model.sections, id: \.stage.id) { section in
                    Section("\(section.stage.name) · \(section.items.count)") {
                        ForEach(section.items) { app in row(app) }
                    }
                }
            }
        }
        .navigationTitle(tr("応募", "Applications", "Candidatures"))
        .cleanList()
        .searchable(text: $model.query, prompt: tr("企業名・職種・メモで検索", "Search company, position, notes", "Chercher entreprise, poste, notes"))
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { editing = EditorTarget(app: nil) } label: { Label(tr("追加", "Add", "Ajouter"), systemImage: "plus") }
            }
        }
        .task { if model.applications == nil { await model.load() } }
        .refreshable { await model.load() }
        .sheet(isPresented: $showingWaiting) {
            NavigationStack { WaitingList(apps: model.waiting) { app in showingWaiting = false; editing = EditorTarget(app: app) } }
        }
        .sheet(item: $editing) { target in
            NavigationStack { ApplicationEditor(api: model.api, app: target.app, onSaved: model.saved, onDelete: { await model.delete($0) }) }
        }
    }

    private func row(_ app: JobApplication) -> some View {
        Button { editing = EditorTarget(app: app) } label: {
            VStack(alignment: .leading, spacing: 3) {
                Text(app.company).font(.headline).foregroundStyle(.primary)
                if let position = app.position { Text(position).font(.subheadline).foregroundStyle(.secondary) }
                if let due = app.nextDeadline, let days = SelectionStage.daysUntil(due) {
                    Label(SelectionStage.deadlineLabel(days), systemImage: "alarm")
                        .font(.caption.weight(days <= 3 ? .bold : .regular))
                        .foregroundStyle(days <= 3 ? .red : .secondary)
                }
            }
        }
        .swipeActions(edge: .trailing) {
            if let next = SelectionStage.neighbour(of: app.status, 1) {
                Button { Task { await model.move(app, to: next) } } label: { Label(SelectionStage.label(next), systemImage: "arrow.right") }
                    .tint(.blue)
            }
        }
        .swipeActions(edge: .leading) {
            if let previous = SelectionStage.neighbour(of: app.status, -1) {
                Button { Task { await model.move(app, to: previous) } } label: { Label(SelectionStage.label(previous), systemImage: "arrow.left") }
            }
        }
        .contextMenu {
            ForEach(SelectionStage.all) { stage in
                Button(stage.name) { Task { await model.move(app, to: stage.id) } }
                    .disabled(stage.id == app.status)
            }
        }
    }
}

/// Fiche d'une candidature : entreprise, statut, étapes datées.
struct ApplicationEditor: View {
    let api: APIClient
    let app: JobApplication?
    let onSaved: (JobApplication) -> Void
    let onDelete: (JobApplication) async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var input = JobApplicationInput()
    @State private var issues: [Issue] = []
    @State private var failed = false

    var body: some View {
        Form {
            Section {
                TextField(tr("企業名", "Company *", "Entreprise *"), text: $input.company)
                if let e = error("company") { Text(e).font(.caption).foregroundStyle(.red) }
                TextField(tr("職種", "Position", "Poste"), text: optional($input.position))
                TextField(tr("採用ページ", "Careers page URL", "Page recrutement (URL)"), text: optional($input.url))
                    .keyboardType(.URL).textInputAutocapitalization(.never)
                if let e = error("url") { Text(e).font(.caption).foregroundStyle(.red) }
                Picker(tr("状況", "Status", "Statut"), selection: $input.status) {
                    ForEach(SelectionStage.all) { Text($0.name).tag($0.id) }
                }
            }
            Section {
                Picker(tr("業界", "Industry", "Secteur"), selection: $input.industry) {
                    Text("—").tag(String?.none)
                    ForEach(CompanyProfile.industries) { Text($0.name).tag(Optional($0.id)) }
                }
                Picker(tr("企業の種類", "Company type", "Type d'entreprise"), selection: $input.companyType) {
                    Text("—").tag(String?.none)
                    ForEach(CompanyProfile.types) { Text($0.name).tag(Optional($0.id)) }
                }
                TextField(tr("企業メモ", "Notes on the company", "Notes sur l'entreprise"), text: optional($input.notes), axis: .vertical)
                    .lineLimit(3...8)
                if let e = error("notes") { Text(e).font(.caption).foregroundStyle(.red) }
            } header: {
                Text(tr("企業について", "About the company", "À propos de l'entreprise"))
            } footer: {
                Text(tr("面接練習の質問に使います", "Used to tailor interview practice", "Sert à adapter l'entraînement aux entretiens"))
            }
            Section(tr("選考ステップ・締切", "Steps and deadlines", "Étapes et échéances")) {
                ForEach($input.steps) { $step in
                    VStack(alignment: .leading) {
                        Picker(tr("選考", "Step", "Étape"), selection: $step.type) {
                            ForEach(SelectionStage.stepTypes) { Text($0.name).tag($0.id) }
                        }
                        DatePicker(tr("締切・日程", "Date", "Date"), selection: date($step.dueDate), displayedComponents: .date)
                        Toggle(tr("完了", "Done", "Fait"), isOn: $step.done)
                        TextField(tr("メモ", "Note", "Note"), text: optional($step.note))
                    }
                }
                .onDelete { input.steps.remove(atOffsets: $0) }
                Button(tr("＋ 追加", "Add", "＋ Ajouter")) { input.steps.append(.init()) }
            }
            if failed { Section { Text(tr("保存できませんでした", "Could not save", "Enregistrement impossible")).foregroundStyle(.red) } }
            if let app {
                Section {
                    NavigationLink {
                        InterviewView(model: InterviewModel(api: api, applicationId: app.id))
                    } label: {
                        Label(tr("面接を練習する", "Practise the interview", "S'entraîner pour l'entretien"), systemImage: "mic")
                    }
                }
                Section {
                    Button(tr("削除", "Delete", "Supprimer"), role: .destructive) { Task { await onDelete(app); dismiss() } }
                }
            }
        }
        .navigationTitle(app?.company ?? tr("新しい応募", "New application", "Nouvelle candidature"))
        .cleanList()
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button(tr("閉じる", "Close", "Fermer")) { dismiss() } }
            ToolbarItem(placement: .confirmationAction) { Button(tr("保存", "Save", "Enregistrer")) { Task { await save() } } }
        }
        .onAppear { if let app { input = JobApplicationInput(app) } }
    }

    private func save() async {
        failed = false
        do {
            let saved: JobApplication
            if let app {
                saved = try await api.updateApplication(app.id, input)
            } else {
                saved = try await api.createApplication(input)
            }
            onSaved(saved)
            dismiss()
        } catch APIError.invalid(let found) {
            issues = found
        } catch {
            failed = true
        }
    }

    private func error(_ path: String) -> String? { issues.first { $0.path == path }.map { apiMessage($0.message) } }

    private func optional(_ value: Binding<String?>) -> Binding<String> {
        Binding(get: { value.wrappedValue ?? "" },
                set: { value.wrappedValue = $0.trimmingCharacters(in: .whitespaces).isEmpty ? nil : $0 })
    }

    /// Date de l'étape au format de l'API (AAAA-MM-JJ) ; aujourd'hui tant qu'elle n'est pas choisie.
    private func date(_ value: Binding<String?>) -> Binding<Date> {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return Binding(get: { value.wrappedValue.flatMap(f.date(from:)) ?? .now },
                       set: { value.wrappedValue = f.string(from: $0) })
    }
}

/// Fenêtre « 応募済み » : toutes les candidatures envoyées sans réponse, avec sa propre recherche.
private struct WaitingList: View {
    let apps: [JobApplication]
    let onOpen: (JobApplication) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    var body: some View {
        let shown = apps.filter { SelectionStage.matches($0, query) }
        List {
            if shown.isEmpty {
                Text(tr("該当する応募はありません", "No matching applications", "Aucune candidature correspondante")).foregroundStyle(.secondary)
            }
            ForEach(shown) { app in
                Button { onOpen(app) } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(app.company).font(.headline).foregroundStyle(Color.cwBlue800)
                        if let position = app.position { Text(position).font(.subheadline).foregroundStyle(.secondary) }
                    }
                }
            }
        }
        .navigationTitle(tr("応募済み・返事待ち", "Awaiting a reply", "En attente de réponse") + " · \(apps.count)")
        .cleanList()
        .searchable(text: $query, prompt: tr("企業名・職種・メモで検索", "Search company, position, notes", "Chercher entreprise, poste, notes"))
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button(tr("閉じる", "Close", "Fermer")) { dismiss() } }
        }
    }
}
