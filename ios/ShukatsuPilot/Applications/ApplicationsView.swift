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
    /// 面接の振り返り : enregistrés à part de la fiche, gardés ici pour les retrouver en rouvrant l'écran.
    @State private var debriefs: [Debrief] = []
    /// 内定後の手続き : étapes cochées, enregistrées à part elles aussi.
    @State private var offerDone: [String] = []

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
            CompanyFactsSection(api: api, company: input.company, corporateNumber: $input.corporateNumber, location: $input.location)
            Section(tr("選考ステップ・締切", "Steps and deadlines", "Étapes et échéances")) {
                ForEach($input.steps) { $step in
                    VStack(alignment: .leading) {
                        Picker(tr("選考", "Step", "Étape"), selection: $step.type) {
                            ForEach(SelectionStage.stepTypes) { Text($0.name).tag($0.id) }
                        }
                        DatePicker(tr("締切・日程", "Date", "Date"), selection: date($step.dueDate), displayedComponents: .date)
                        if step.time == nil {
                            Button(tr("＋ 時間", "＋ Time", "＋ Heure")) { step.time = "10:00" }
                        } else {
                            HStack {
                                DatePicker(tr("時間", "Time", "Heure"), selection: time($step.time), displayedComponents: .hourAndMinute)
                                Button { step.time = nil } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel(tr("時間を消す", "Remove the time", "Retirer l'heure"))
                            }
                        }
                        Toggle(tr("完了", "Done", "Fait"), isOn: $step.done)
                        TextField(tr("場所・オンラインのURL", "Place or online link", "Lieu ou lien en ligne"), text: optional($step.place))
                            .textInputAutocapitalization(.never)
                        TextField(tr("メモ", "Note", "Note"), text: optional($step.note))
                    }
                }
                .onDelete { input.steps.remove(atOffsets: $0) }
                Button(tr("＋ 追加", "Add", "＋ Ajouter")) { input.steps.append(.init()) }
            }
            Section {
                ForEach(Binding(get: { input.followUps ?? [] }, set: { input.followUps = $0 })) { $f in
                    VStack(alignment: .leading) {
                        DatePicker(tr("日付", "Date", "Date"), selection: day($f.date), displayedComponents: .date)
                        TextField(tr("やること（例：人事にお礼メール）", "To do (e.g. thank-you email to HR)", "À faire (ex. : mail de remerciement)"), text: $f.note)
                        Toggle(tr("完了", "Done", "Fait"), isOn: $f.done)
                    }
                }
                .onDelete { input.followUps?.remove(atOffsets: $0) }
                Button(tr("＋ 追加", "Add", "＋ Ajouter")) { input.followUps = (input.followUps ?? []) + [FollowUp(date: today)] }
            } header: {
                Text(tr("フォローアップ", "Follow-ups", "Relances"))
            } footer: {
                Text(tr("締切と同じように通知とカレンダーに出ます", "Reminded like deadlines, and shown in the calendar", "Rappelées comme les échéances, et visibles dans le calendrier"))
            }
            Section(tr("やりとりの記録", "Contact history", "Historique des échanges")) {
                ForEach(Binding(get: { input.events ?? [] }, set: { input.events = $0 })) { $e in
                    VStack(alignment: .leading) {
                        HStack {
                            Picker(tr("種類", "Type", "Type"), selection: $e.kind) {
                                ForEach(AppEvent.kinds, id: \.id) { Text(tr($0.ja, $0.en, $0.fr)).tag($0.id) }
                            }
                            DatePicker("", selection: day($e.date), displayedComponents: .date).labelsHidden()
                        }
                        TextField(tr("内容", "What happened", "Ce qui s'est passé"), text: optional($e.note), axis: .vertical)
                    }
                }
                .onDelete { input.events?.remove(atOffsets: $0) }
                Button(tr("＋ 追加", "Add", "＋ Ajouter")) { input.events = (input.events ?? []) + [AppEvent(date: today)] }
            }
            if failed { Section { Text(tr("保存できませんでした", "Could not save", "Enregistrement impossible")).foregroundStyle(.red) } }
            if let app {
                Section {
                    NavigationLink {
                        InterviewView(model: InterviewModel(api: api, applicationId: app.id))
                    } label: {
                        Label(tr("面接を練習する", "Practise the interview", "S'entraîner pour l'entretien"), systemImage: "mic")
                    }
                    if app.status == "offer" {
                        NavigationLink {
                            OfferGuideView(api: api, application: app, done: $offerDone, onSaved: onSaved)
                        } label: {
                            Label(tr("内定後の手続き", "After the offer", "Après l'offre"), systemImage: "checklist")
                        }
                    }
                    NavigationLink {
                        DebriefsView(api: api, application: app, debriefs: $debriefs, onSaved: onSaved)
                    } label: {
                        HStack {
                            Label(tr("面接の振り返り", "Interview debrief", "Bilan d'entretien"), systemImage: "text.bubble")
                            Spacer()
                            if !debriefs.isEmpty { Text("\(debriefs.count)").foregroundStyle(.secondary) }
                        }
                    }
                    NavigationLink {
                        EmailWriterView(api: api, application: app)
                    } label: {
                        Label(tr("メールを書く", "Write an email", "Écrire un mail"), systemImage: "envelope")
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
        .onAppear { if let app, input == JobApplicationInput() { input = JobApplicationInput(app); debriefs = app.debriefs ?? []; offerDone = app.offerChecklist ?? [] } }
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

    /// Heure de l'étape au format de l'API (HH:MM, heure du Japon).
    private func time(_ value: Binding<String?>) -> Binding<Date> {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "Asia/Tokyo")
        f.dateFormat = "HH:mm"
        return Binding(get: { value.wrappedValue.flatMap(f.date(from:)) ?? .now },
                       set: { value.wrappedValue = f.string(from: $0) })
    }

    /// Date de l'étape au format de l'API (AAAA-MM-JJ) ; aujourd'hui tant qu'elle n'est pas choisie.
    private var today: String { ISO8601DateFormatter.dayOnly.string(from: .now) }

    /// Une date obligatoire (relance, échange) au format AAAA-MM-JJ.
    private func day(_ value: Binding<String>) -> Binding<Date> {
        Binding(get: { ISO8601DateFormatter.dayOnly.date(from: value.wrappedValue) ?? .now },
                set: { value.wrappedValue = ISO8601DateFormatter.dayOnly.string(from: $0) })
    }

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

/// Mail de 就活 rédigé par l'IA pour une candidature : type de mail, étape concernée, quelques précisions.
/// Le texte reste modifiable, puis se copie ou se partage vers l'app Mail.
private struct EmailWriterView: View {
    let api: APIClient
    let application: JobApplication
    @State private var kind = EmailKind.thanks
    @State private var stepId: String?
    @State private var details = ""
    @State private var usage: Usage?
    @State private var draft: EmailDraft?
    @State private var busy = false
    @State private var message: String?
    @State private var copied = 0

    var body: some View {
        Form {
            Section {
                Picker(tr("メールの種類", "Type of email", "Type de mail"), selection: $kind) {
                    ForEach(EmailKind.allCases) { Text($0.name).tag($0) }
                }
                if kind.needsStep, !application.steps.isEmpty {
                    Picker(tr("対象の選考", "Which step", "Étape concernée"), selection: $stepId) {
                        Text("—").tag(String?.none)
                        ForEach(application.steps) { step in
                            Text([SelectionStage.name(step.type), step.dueDate.map { String($0.dropFirst(5)).replacingOccurrences(of: "-", with: "/") }, step.time].compactMap { $0 }.joined(separator: " "))
                                .tag(Optional(step.id))
                        }
                    }
                }
                TextField(kind.hint, text: $details, axis: .vertical).lineLimit(2...5)
            }
            Section {
                Button {
                    Task { await write() }
                } label: {
                    Label(busy ? tr("作成中…", "Writing…", "Rédaction…") : draft == nil ? tr("AIで作成", "Write with AI", "Rédiger avec l'IA") : tr("もう一度作成", "Write again", "Réécrire"), systemImage: "sparkles")
                }
                .disabled(busy || usage?.today == 0)
                if let message { Text(message).font(.footnote).foregroundStyle(.red) }
            } footer: {
                if let usage { Text(tr("残り：今日 \(usage.today) · 今月 \(usage.month)", "Left: \(usage.today) today · \(usage.month) this month", "Reste : \(usage.today) aujourd'hui · \(usage.month) ce mois-ci")) }
            }
            if let draft {
                Section(tr("件名", "Subject", "Objet")) {
                    TextField("", text: binding(\.subject), axis: .vertical)
                }
                Section {
                    TextEditor(text: binding(\.body)).frame(minHeight: 320)
                } header: {
                    Text(tr("本文", "Message", "Message"))
                } footer: {
                    if draft.body.contains("〇〇") {
                        Text(tr("「〇〇」は送る前に書きかえてください（担当者名・日時など）。", "Replace every 「〇〇」 before sending (recruiter's name, dates…).", "Remplacez chaque « 〇〇 » avant l'envoi (nom du recruteur, dates…)."))
                    }
                }
                Section {
                    Button {
                        UIPasteboard.general.string = draft.body
                        copied += 1
                    } label: { Label(tr("本文をコピー", "Copy the message", "Copier le message"), systemImage: "doc.on.doc") }
                    Button {
                        UIPasteboard.general.string = draft.subject
                        copied += 1
                    } label: { Label(tr("件名をコピー", "Copy the subject", "Copier l'objet"), systemImage: "doc.on.doc") }
                    ShareLink(item: draft.body, subject: Text(draft.subject)) {
                        Label(tr("メールアプリで開く・共有", "Open in Mail or share", "Ouvrir dans Mail ou partager"), systemImage: "square.and.arrow.up")
                    }
                }
                if !draft.points.isEmpty {
                    Section(tr("覚えておきたい表現", "Expressions worth remembering", "Expressions à retenir")) {
                        ForEach(draft.points) { point in
                            VStack(alignment: .leading, spacing: 3) {
                                Text(point.expression).font(.subheadline.weight(.semibold)).foregroundStyle(Color.cwBlue800)
                                Text(point.meaning).font(.footnote).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle(tr("メールを書く", "Write an email", "Écrire un mail"))
        .navigationBarTitleDisplayMode(.inline)
        .cleanList()
        .sensoryFeedback(.success, trigger: copied)
        .task { usage = try? await api.emailUsage() }
    }

    private func binding(_ path: WritableKeyPath<EmailDraft, String>) -> Binding<String> {
        Binding(get: { draft?[keyPath: path] ?? "" }, set: { draft?[keyPath: path] = $0 })
    }

    private func write() async {
        busy = true
        message = nil
        defer { busy = false }
        let text = details.trimmingCharacters(in: .whitespacesAndNewlines)
        switch await api.writeEmail(applicationId: application.id, kind: kind, stepId: kind.needsStep ? stepId : nil, details: text.isEmpty ? nil : text, language: HelpLanguage.saved) {
        case .success(let written):
            draft = written
            if let remaining = written.remaining { usage = remaining }
        case .failure(let refusal):
            message = refusal.message
        }
    }
}

/// 面接の振り返り : après un vrai entretien, noter les questions posées, ce qui a marché et ce qui a coincé.
/// L'IA en tire des conseils et les questions à préparer pour le tour suivant ; l'entretien simulé s'en sert aussi.
private struct DebriefsView: View {
    let api: APIClient
    let application: JobApplication
    @Binding var debriefs: [Debrief]
    let onSaved: (JobApplication) -> Void
    @State private var usage: Usage?
    @State private var busy: String?
    @State private var message: String?
    /// Ce qui est enregistré sur le serveur : sert à savoir s'il reste des notes à enregistrer.
    @State private var savedCopy: [Debrief] = []
    @State private var done = 0

    private var interviews: [JobApplication.Step] { application.steps.filter { ["interview1", "interview2", "final"].contains($0.type) } }
    private var today: String { ISO8601DateFormatter.dayOnly.string(from: .now) }

    var body: some View {
        Form {
            Section {
                Button { add() } label: { Label(tr("振り返りを書く", "Write a debrief", "Écrire un bilan"), systemImage: "plus") }
            } footer: {
                VStack(alignment: .leading, spacing: 4) {
                    if debriefs.isEmpty {
                        Text(tr("面接が終わったら、聞かれた質問をすぐメモしましょう。次の選考の準備に使えます。", "Right after an interview, note the questions you were asked. They prepare you for the next round.", "Juste après un entretien, notez les questions posées : elles préparent le tour suivant."))
                    }
                    if let usage { Text(tr("AIアドバイス 残り：今日 \(usage.today) · 今月 \(usage.month)", "AI advice left: \(usage.today) today · \(usage.month) this month", "Conseils IA restants : \(usage.today) aujourd'hui · \(usage.month) ce mois-ci")) }
                    if let message { Text(message).foregroundStyle(.red) }
                }
            }
            ForEach($debriefs) { $d in
                Section {
                    DatePicker(tr("日付", "Date", "Date"), selection: day($d.date), displayedComponents: .date)
                    if !interviews.isEmpty {
                        Picker(tr("どの面接", "Which interview", "Quel entretien"), selection: $d.stepId) {
                            Text("—").tag(String?.none)
                            ForEach(interviews) { step in
                                Text([SelectionStage.name(step.type), step.dueDate.map { String($0.dropFirst(5)).replacingOccurrences(of: "-", with: "/") }].compactMap { $0 }.joined(separator: " ")).tag(Optional(step.id))
                            }
                        }
                    }
                    TextField(tr("聞かれた質問（1行に1つ）", "Questions you were asked (one per line)", "Questions posées (une par ligne)"), text: $d.questions, axis: .vertical).lineLimit(3...8)
                    TextField(tr("うまくいったこと", "What went well", "Ce qui a bien marché"), text: optional($d.good), axis: .vertical).lineLimit(1...4)
                    TextField(tr("うまく答えられなかったこと", "What was hard to answer", "Ce qui a été difficile"), text: optional($d.improve), axis: .vertical).lineLimit(1...4)
                    Button {
                        Task { await advise(d.id) }
                    } label: {
                        Label(busy == d.id ? tr("作成中…", "Working…", "En cours…") : d.advice == nil ? tr("AIのアドバイス", "AI advice", "Conseils de l'IA") : tr("アドバイスを更新", "Refresh the advice", "Actualiser les conseils"), systemImage: "lightbulb")
                    }
                    .disabled(busy != nil || d.isEmpty || usage?.today == 0)
                    if let advice = d.advice {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(advice.summary)
                            if !advice.tips.isEmpty {
                                Text(tr("次に向けて", "For next time", "Pour la prochaine fois")).font(.subheadline.weight(.semibold)).foregroundStyle(Color.cwBlue800)
                                ForEach(advice.tips, id: \.self) { Text("・" + $0) }
                            }
                            if !advice.practice.isEmpty {
                                Text(tr("準備しておきたい質問", "Questions to prepare", "Questions à préparer")).font(.subheadline.weight(.semibold)).foregroundStyle(Color.cwBlue800)
                                ForEach(Array(advice.practice.enumerated()), id: \.offset) { i, q in Text("\(i + 1). \(q)") }
                            }
                        }
                        .font(.footnote)
                        .textSelection(.enabled)
                        NavigationLink {
                            InterviewView(model: InterviewModel(api: api, applicationId: application.id))
                        } label: {
                            Label(tr("この内容で面接を練習する", "Practise with this", "S'entraîner avec ce bilan"), systemImage: "mic")
                        }
                    }
                    Button(tr("削除", "Delete", "Supprimer"), role: .destructive) { Task { await remove(d.id) } }
                        .disabled(busy != nil)
                }
            }
        }
        .navigationTitle(tr("面接の振り返り", "Interview debrief", "Bilan d'entretien"))
        .navigationBarTitleDisplayMode(.inline)
        .cleanList()
        .sensoryFeedback(.success, trigger: done)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(tr("保存", "Save", "Enregistrer")) { Task { await save() } }.disabled(busy != nil || debriefs == savedCopy)
            }
        }
        .task {
            savedCopy = debriefs
            usage = try? await api.debriefUsage()
        }
    }

    private func add() {
        // Par défaut : le dernier entretien déjà passé.
        let last = interviews.filter { ($0.dueDate ?? "9999") <= today }.max { ($0.dueDate ?? "") < ($1.dueDate ?? "") }
        debriefs.insert(Debrief(stepId: last?.id, date: last?.dueDate ?? today), at: 0)
    }

    /// Enregistre les notes ; false si le serveur n'a pas répondu.
    @discardableResult
    private func save() async -> Bool {
        message = nil
        guard let saved = try? await api.saveDebriefs(applicationId: application.id, debriefs) else {
            message = tr("保存できませんでした", "Could not save", "Enregistrement impossible")
            return false
        }
        debriefs = saved.debriefs ?? debriefs
        savedCopy = debriefs
        onSaved(saved)
        done += 1
        return true
    }

    private func remove(_ id: String) async {
        debriefs.removeAll { $0.id == id }
        await save()
    }

    private func advise(_ id: String) async {
        busy = id
        defer { busy = nil }
        // Les notes sont enregistrées d'abord : l'IA lit ce qui est sur le serveur.
        if debriefs != savedCopy, await !save() { return }
        message = nil
        switch await api.adviseDebrief(applicationId: application.id, debriefId: id, language: HelpLanguage.saved) {
        case .success(let reply):
            debriefs = reply.application.debriefs ?? debriefs
            savedCopy = debriefs
            onSaved(reply.application)
            if let remaining = reply.remaining { usage = remaining }
            done += 1
        case .failure(let refusal):
            message = refusal.message
        }
    }

    private func optional(_ value: Binding<String?>) -> Binding<String> {
        Binding(get: { value.wrappedValue ?? "" }, set: { value.wrappedValue = $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : $0 })
    }

    private func day(_ value: Binding<String>) -> Binding<Date> {
        Binding(get: { ISO8601DateFormatter.dayOnly.date(from: value.wrappedValue) ?? .now },
                set: { value.wrappedValue = ISO8601DateFormatter.dayOnly.string(from: $0) })
    }
}

/// 内定後の手続き : le parcours entre l'offre et le premier jour, surtout le changement de statut de résidence.
/// Contenu relu à la main (pas d'IA), avec les liens officiels ; les étapes cochées sont gardées dans la candidature.
private struct OfferGuideView: View {
    let api: APIClient
    let application: JobApplication
    @Binding var done: [String]
    let onSaved: (JobApplication) -> Void
    @State private var guide: OfferGuide?
    @State private var loadFailed = false
    @State private var saveFailed = false

    var body: some View {
        Form {
            if let guide {
                Section {
                    Text(guide.intro.current)
                } footer: {
                    VStack(alignment: .leading, spacing: 4) {
                        let count = guide.steps.filter { done.contains($0.id) }.count
                        Text(tr("\(guide.steps.count)つのうち \(count)つ完了", "\(count) of \(guide.steps.count) done", "\(count) sur \(guide.steps.count) faites"))
                        if saveFailed { Text(tr("保存できませんでした", "Could not save", "Enregistrement impossible")).foregroundStyle(.red) }
                    }
                }
                ForEach(guide.steps) { step in
                    Section {
                        Toggle(isOn: Binding(get: { done.contains(step.id) }, set: { _ in Task { await toggle(step.id) } })) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(step.title.current).font(.headline).foregroundStyle(Color.cwBlue800)
                                Text(step.when.current).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        Text(step.detail.current).font(.subheadline)
                        if let items = step.items {
                            VStack(alignment: .leading, spacing: 4) {
                                ForEach(items, id: \.ja) { Text("・" + $0.current) }
                            }
                            .font(.footnote)
                        }
                        ForEach(step.links ?? [], id: \.url) { link in
                            Link(destination: link.url) { Label(link.label.current, systemImage: "link").font(.footnote) }
                        }
                    }
                }
                Section {
                    ForEach(guide.notes, id: \.title.ja) { note in
                        DisclosureGroup(note.title.current) { Text(note.detail.current).font(.subheadline) }
                    }
                } footer: {
                    Text("\(guide.disclaimer.current) (\(guide.updated))")
                }
            } else if loadFailed {
                Text(tr("読み込めませんでした", "Could not load", "Chargement impossible")).foregroundStyle(.secondary)
            } else {
                ProgressView()
            }
        }
        .navigationTitle(tr("内定後の手続き", "After the offer", "Après l'offre"))
        .navigationBarTitleDisplayMode(.inline)
        .cleanList()
        .sensoryFeedback(.selection, trigger: done)
        .task {
            guard guide == nil else { return }
            let url = AppConfig.siteURL.appending(path: "naitei-guide.json")
            if let (data, _) = try? await URLSession.shared.data(from: url), let decoded = try? JSONDecoder().decode(OfferGuide.self, from: data) {
                guide = decoded
            } else {
                loadFailed = true
            }
        }
    }

    private func toggle(_ id: String) async {
        let before = done
        done = done.contains(id) ? done.filter { $0 != id } : done + [id]
        saveFailed = false
        if let saved = try? await api.saveOfferChecklist(applicationId: application.id, done) {
            onSaved(saved)
        } else {
            // La case revient à son état : ce qui est affiché est ce qui est enregistré.
            done = before
            saveFailed = true
        }
    }
}
