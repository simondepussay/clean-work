import SwiftUI

/// Entraînement aux entretiens (S17–S19) : préparation, puis séance, puis bilan.
struct InterviewView: View {
    @State var model: InterviewModel

    var body: some View {
        Group {
            if let session = model.session {
                if session.isFinished, let summary = session.summary {
                    InterviewSummaryView(session: session, summary: summary)
                } else {
                    InterviewSessionView(model: model, session: session)
                }
            } else {
                setup
            }
        }
        .navigationTitle(tr("面接練習", "Interview", "Entretien"))
        .cleanList()
        .task { await model.load() }
        .toolbar {
            if model.session != nil {
                ToolbarItem(placement: .topBarLeading) {
                    Button(tr("一覧", "List", "Liste")) { Task { await model.close() } }
                }
            }
        }
        .navigationBarBackButtonHidden(model.session != nil)
    }

    private var setup: some View {
        Form {
            Section {
                Picker(tr("どの面接の練習？", "Which interview?", "Pour quel entretien ?"), selection: $model.stepId) {
                    ForEach(model.scheduled, id: \.step.id) { item in
                        Text("\((item.step.dueDate ?? "").suffix(5).replacingOccurrences(of: "-", with: "/")) · \(item.app.company) · \(InterviewStage(rawValue: item.step.type)?.name ?? item.step.type)")
                            .tag(Optional(item.step.id))
                    }
                    Text(tr("企業と選考段階を選ぶ", "Choose a company and stage", "Choisir une entreprise et une étape")).tag(String?.none)
                }
                .labelsHidden()
                if model.stepId == nil {
                    Picker(tr("企業", "Company", "Entreprise"), selection: $model.applicationId) {
                        Text(tr("一般的な面接", "General interview", "Entretien général")).tag(String?.none)
                        ForEach(model.applications) { app in
                            Text(app.position.map { "\(app.company)（\($0)）" } ?? app.company).tag(Optional(app.id))
                        }
                    }
                    Picker(tr("選考段階", "Stage", "Étape"), selection: $model.stage) {
                        ForEach(InterviewStage.allCases) { Text($0.name).tag($0) }
                    }
                }
            } header: {
                Text(tr("どの面接の練習？", "Which interview?", "Pour quel entretien ?"))
            } footer: {
                VStack(alignment: .leading, spacing: 6) {
                    Text(tr("AIの面接官が、企業・選考段階・プロフィールとESに合わせて5つ質問します。声でも文字でも答えられます。", "An AI interviewer asks 5 questions tailored to the company, the stage, your profile and entry sheets. Answer by voice or in writing.", "Un recruteur IA pose 5 questions adaptées à l'entreprise, à l'étape, à votre profil et à vos ES. Répondez à voix haute ou par écrit."))
                    if let app = model.selectedApplication, app.notes?.isEmpty ?? true {
                        Text(tr("💡 応募の「企業メモ」を書くと、質問がもっと具体的になります", "Add notes on the company for more specific questions", "Ajoutez des notes sur l'entreprise pour des questions plus précises"))
                    }
                }
            }
            Section {
                Button {
                    Task { await model.start() }
                } label: {
                    if model.busy {
                        Label(tr("面接官が質問を準備しています…", "Preparing…", "Préparation…"), systemImage: "hourglass")
                    } else {
                        Label(tr("面接を始める", "Start", "Commencer"), systemImage: "mic.fill")
                    }
                }
                .disabled(model.busy || model.usage?.today == 0)
                if let usage = model.usage {
                    Text(tr("残り：今日 \(usage.today)回・今月 \(usage.month)回", "Left: \(usage.today) today, \(usage.month) this month", "Restant : \(usage.today) aujourd'hui, \(usage.month) ce mois-ci"))
                        .font(.caption).foregroundStyle(.secondary)
                }
                if let message = model.message { Text(message).font(.caption).foregroundStyle(.red) }
            }
            if !model.history.isEmpty {
                Section(tr("これまでの練習", "Past sessions", "Séances précédentes")) {
                    ForEach(model.history) { item in
                        Button {
                            Task { await model.open(item.id) }
                        } label: {
                            VStack(alignment: .leading) {
                                Text("\(item.company ?? tr("一般", "General", "Général")) · \(item.stage.name)")
                                Text(item.score.map { "\($0)" + tr("点", " pts", " pts") } ?? tr("途中", "unfinished", "inachevée")).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        .swipeActions {
                            Button(tr("削除", "Delete", "Supprimer"), role: .destructive) { Task { await model.delete(item.id) } }
                        }
                    }
                }
            }
        }
    }
}

/// Une séance en cours : la question, la réponse (voix ou clavier), puis l'avis.
struct InterviewSessionView: View {
    let model: InterviewModel
    let session: Interview
    @State private var answer = ""
    @State private var spoken = false
    @State private var speech = SpeechRecognizer()
    @State private var reader = QuestionReader()
    @AppStorage("interview-read-aloud") private var readAloud = true

    var body: some View {
        Form {
            Section {
                Text(tr("回答済み \(session.answeredCount) / 質問 \(session.turns.count)", "Answered \(session.answeredCount) / \(session.turns.count) questions", "Réponses \(session.answeredCount) / \(session.turns.count) questions"))
                    .font(.caption).foregroundStyle(.secondary)
            }
            if let index = model.shownIndex {
                let turn = session.turns[index]
                Section {
                    if turn.isFollowUp { Text(tr("深掘り", "Follow-up", "Question de relance")).font(.caption.bold()).foregroundStyle(.orange) }
                    Text(turn.question).font(.title3)
                    Button(tr("もう一度聞く", "Listen again", "Réécouter"), systemImage: "speaker.wave.2") { reader.read(turn.question) }
                    Toggle(tr("自動で読み上げ", "Read aloud", "Lecture à voix haute"), isOn: $readAloud)
                    if !turn.intent.isEmpty {
                        DisclosureGroup(tr("面接官が見ているポイント", "What they look for", "Ce que le recruteur observe")) { Text(turn.intent).font(.callout) }
                    }
                }
                if model.reviewing != nil {
                    reviewSection(turn)
                } else {
                    answerSection
                }
            } else {
                Section {
                    finishButton(primary: true)
                }
            }
            if let message = model.message {
                Section { Text(message).foregroundStyle(.red) }
            }
        }
        .onChange(of: model.shownIndex, initial: true) { _, _ in
            if model.reviewing == nil, let index = model.shownIndex, readAloud { reader.read(session.turns[index].question) }
        }
        .onChange(of: speech.transcript) { _, text in if speech.state == .listening { answer = text } }
        .onDisappear { speech.stop(); reader.stop() }
    }

    private var answerSection: some View {
        Section(tr("あなたの回答", "Your answer", "Votre réponse")) {
            TextField(tr("話すか、書いてください", "Speak or type", "Parlez ou écrivez"), text: $answer, axis: .vertical)
                .lineLimit(4...12)
            if speech.state == .listening {
                Button(tr("話し終わった", "Stop", "Terminé"), systemImage: "stop.circle.fill", role: .destructive) { speech.stop() }
            } else {
                Button(tr("話して答える", "Answer by voice", "Répondre à voix haute"), systemImage: "mic") {
                    reader.stop()
                    spoken = true
                    Task { await speech.start() }
                }
            }
            if speech.state == .denied {
                Text(tr("設定アプリでマイクと音声認識を許可してください", "Allow the microphone and speech recognition in Settings", "Autorisez le micro et la reconnaissance vocale dans Réglages")).font(.caption).foregroundStyle(.red)
            } else if speech.state == .unavailable {
                Text(tr("音声入力が使えません。文字で答えてください", "Voice input isn't available; please type", "La saisie vocale est indisponible ; écrivez votre réponse")).font(.caption).foregroundStyle(.secondary)
            }
            Button {
                speech.stop()
                Task {
                    if await model.answer(answer, durationSec: speech.duration, spoken: spoken) {
                        answer = ""
                        spoken = false
                    }
                }
            } label: {
                Text(model.busy ? tr("面接官が考えています…", "Thinking…", "Réflexion…") : tr("回答する", "Answer", "Répondre")).bold()
            }
            .disabled(model.busy || answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            if session.answeredCount > 0 { finishButton(primary: false) }
        }
    }

    @ViewBuilder private func reviewSection(_ turn: InterviewTurn) -> some View {
        Section(tr("あなたの回答", "Your answer", "Votre réponse")) {
            Text(turn.answer ?? "")
        }
        if let feedback = turn.feedback {
            FeedbackSection(feedback: feedback, durationSec: turn.durationSec)
        }
        Section {
            if session.currentIndex != nil {
                Button(tr("次の質問へ", "Next question", "Question suivante")) { model.next() }.bold()
            }
            finishButton(primary: session.currentIndex == nil)
        }
    }

    private func finishButton(primary: Bool) -> some View {
        Button {
            speech.stop()
            Task { await model.finish() }
        } label: {
            Text(model.busy ? tr("振り返りを作成中…", "Writing the review…", "Rédaction du bilan…") : tr("終了して振り返る", "Finish and review", "Terminer et voir le bilan"))
                .fontWeight(primary ? .bold : .regular)
        }
        .disabled(model.busy)
    }
}

struct FeedbackSection: View {
    let feedback: InterviewFeedback
    let durationSec: Int?

    var body: some View {
        Section(tr("フィードバック", "Feedback", "Retour")) {
            HStack(alignment: .firstTextBaseline) {
                Text("\(feedback.score)").font(.largeTitle.bold())
                Text(tr("点", "pts", "pts")).foregroundStyle(.secondary)
            }
            Text(feedback.comment)
            ForEach(feedback.improvements, id: \.self) { Label($0, systemImage: "arrow.up.right.circle") }
            ForEach(feedback.expressions, id: \.quote) { e in
                HStack {
                    Text(e.quote).strikethrough().foregroundStyle(.red)
                    Image(systemName: "arrow.right")
                    Text(e.suggestion).foregroundStyle(.green)
                }
            }
            if let durationSec { Text(tr("回答時間：\(durationSec)秒", "Time: \(durationSec) s", "Durée : \(durationSec) s")).font(.caption).foregroundStyle(.secondary) }
        }
    }
}

/// Bilan d'une séance terminée, avec toutes les questions et réponses.
struct InterviewSummaryView: View {
    let session: Interview
    let summary: InterviewSummary

    var body: some View {
        List {
            Section(tr("振り返り", "Review", "Bilan") + " — \(session.company ?? tr("一般", "General", "Général")) · \(session.stage.name)") {
                HStack(alignment: .firstTextBaseline) {
                    Text("\(summary.score)").font(.largeTitle.bold())
                    Text(tr("点", "pts", "pts")).foregroundStyle(.secondary)
                }
                Text(summary.summary)
            }
            Section(tr("良かった点", "Strengths", "Points forts")) { ForEach(summary.strengths, id: \.self) { Text($0) } }
            Section(tr("次に意識すること", "Next time", "La prochaine fois")) { ForEach(summary.improvements, id: \.self) { Text($0) } }
            ForEach(Array(session.turns.enumerated()), id: \.offset) { i, turn in
                Section("Q\(i + 1)\(turn.isFollowUp ? " · " + tr("深掘り", "Follow-up", "Relance") : "")") {
                    Text(turn.question).bold()
                    Text(turn.answer ?? "").foregroundStyle(.secondary)
                    if let f = turn.feedback { Text("\(f.score)" + tr("点", " pts", " pts") + " · \(f.comment)").font(.callout) }
                }
            }
        }
    }
}
