import SwiftUI

/// Candidatures (S07, S08) : liste groupée par étape ; glisser pour avancer ou reculer.
struct ApplicationsView: View {
    @State var model: ApplicationsModel
    @State private var editing: EditorTarget?

    struct EditorTarget: Identifiable {
        let id = UUID()
        let app: JobApplication?
    }

    var body: some View {
        List {
            if model.failed {
                Text("保存できませんでした / Could not save").foregroundStyle(.red)
            }
            switch model.applications {
            case nil:
                ProgressView()
            case let apps? where apps.isEmpty:
                ContentUnavailableView("まだ応募がありません", systemImage: "tray", description: Text("No applications yet — tap + to add one."))
            default:
                ForEach(model.sections, id: \.stage.id) { section in
                    Section("\(section.stage.ja) / \(section.stage.en) · \(section.items.count)") {
                        ForEach(section.items) { app in row(app) }
                    }
                }
            }
        }
        .navigationTitle("応募")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { editing = EditorTarget(app: nil) } label: { Label("追加 / Add", systemImage: "plus") }
            }
        }
        .task { if model.applications == nil { await model.load() } }
        .refreshable { await model.load() }
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
                Button("\(stage.ja) / \(stage.en)") { Task { await model.move(app, to: stage.id) } }
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
                TextField("企業名 / Company *", text: $input.company)
                if let e = error("company") { Text(e).font(.caption).foregroundStyle(.red) }
                TextField("職種 / Position", text: optional($input.position))
                TextField("採用ページ / Careers page URL", text: optional($input.url))
                    .keyboardType(.URL).textInputAutocapitalization(.never)
                if let e = error("url") { Text(e).font(.caption).foregroundStyle(.red) }
                Picker("状況 / Status", selection: $input.status) {
                    ForEach(SelectionStage.all) { Text("\($0.ja) / \($0.en)").tag($0.id) }
                }
            }
            Section {
                Picker("業界 / Industry", selection: $input.industry) {
                    Text("—").tag(String?.none)
                    ForEach(CompanyProfile.industries) { Text("\($0.ja) / \($0.en)").tag(Optional($0.id)) }
                }
                Picker("企業の種類 / Company type", selection: $input.companyType) {
                    Text("—").tag(String?.none)
                    ForEach(CompanyProfile.types) { Text("\($0.ja) / \($0.en)").tag(Optional($0.id)) }
                }
                TextField("企業メモ / Notes on the company", text: optional($input.notes), axis: .vertical)
                    .lineLimit(3...8)
                if let e = error("notes") { Text(e).font(.caption).foregroundStyle(.red) }
            } header: {
                Text("企業について / About the company")
            } footer: {
                Text("面接練習の質問に使います / Used to tailor interview practice")
            }
            Section("選考ステップ・締切 / Steps and deadlines") {
                ForEach($input.steps) { $step in
                    VStack(alignment: .leading) {
                        Picker("選考 / Step", selection: $step.type) {
                            ForEach(SelectionStage.stepTypes) { Text("\($0.ja) / \($0.en)").tag($0.id) }
                        }
                        DatePicker("締切・日程 / Date", selection: date($step.dueDate), displayedComponents: .date)
                        Toggle("完了 / Done", isOn: $step.done)
                        TextField("メモ / Note", text: optional($step.note))
                    }
                }
                .onDelete { input.steps.remove(atOffsets: $0) }
                Button("＋ 追加 / Add") { input.steps.append(.init()) }
            }
            if failed { Section { Text("保存できませんでした / Could not save").foregroundStyle(.red) } }
            if let app {
                Section {
                    Button("削除 / Delete", role: .destructive) { Task { await onDelete(app); dismiss() } }
                }
            }
        }
        .navigationTitle(app?.company ?? "新しい応募")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("閉じる / Close") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) { Button("保存 / Save") { Task { await save() } } }
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

    private func error(_ path: String) -> String? { issues.first { $0.path == path }?.message }

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
