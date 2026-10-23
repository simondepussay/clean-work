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
        .navigationTitle("面接練習 / Interview")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.load() }
        .toolbar {
            if model.session != nil {
                ToolbarItem(placement: .topBarLeading) {
                    Button("一覧 / List") { Task { await model.close() } }
                }
            }
        }
        .navigationBarBackButtonHidden(model.session != nil)
    }

    private var setup: some View {
        Form {
            Section {
                Picker("企業 / Company", selection: $model.applicationId) {
                    Text("一般的な面接 / General").tag(String?.none)
                    ForEach(model.applications) { app in
                        Text(app.position.map { "\(app.company)（\($0)）" } ?? app.company).tag(Optional(app.id))
                    }
                }
                Picker("選考段階 / Stage", selection: $model.stage) {
                    ForEach(InterviewStage.allCases) { Text("\($0.ja) / \($0.en)").tag($0) }
                }
                Picker("解説の言語 / Help language", selection: $model.language) {
                    ForEach(HelpLanguage.allCases) { Text($0.label).tag($0) }
                }
            } footer: {
                VStack(alignment: .leading, spacing: 6) {
                    Text("AIの面接官が、企業・選考段階・プロフィールとESに合わせて5つ質問します。声でも文字でも答えられます。\nAn AI interviewer asks 5 questions tailored to the company, the stage, your profile and entry sheets.")
                    if let app = model.selectedApplication, app.notes?.isEmpty ?? true {
                        Text("💡 応募の「企業メモ」を書くと、質問がもっと具体的になります / Add notes on the company for more specific questions")
                    }
                }
            }
            Section {
                Button {
                    Task { await model.start() }
                } label: {
                    if model.busy {
                        Label("面接官が質問を準備しています… / Preparing…", systemImage: "hourglass")
                    } else {
                        Label("面接を始める / Start", systemImage: "mic.fill")
                    }
                }
                .disabled(model.busy || model.usage?.today == 0)
                if let usage = model.usage {
                    Text("残り：今日 \(usage.today)回・今月 \(usage.month)回 / Left: \(usage.today) today, \(usage.month) this month")
                        .font(.caption).foregroundStyle(.secondary)
                }
                if let message = model.message { Text(message).font(.caption).foregroundStyle(.red) }
            }
            if !model.history.isEmpty {
                Section("これまでの練習 / Past sessions") {
                    ForEach(model.history) { item in
                        Button {
                            Task { await model.open(item.id) }
                        } label: {
                            VStack(alignment: .leading) {
                                Text("\(item.company ?? "一般 / General") · \(item.stage.ja)")
                                Text(item.score.map { "\($0)点" } ?? "途中 / unfinished").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        .swipeActions {
                            Button("削除 / Delete", role: .destructive) { Task { await model.delete(item.id) } }
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
                Text("回答済み \(session.answeredCount) / 質問 \(session.turns.count)")
                    .font(.caption).foregroundStyle(.secondary)
            }
            if let index = model.shownIndex {
                let turn = session.turns[index]
                Section {
                    if turn.isFollowUp { Text("深掘り / Follow-up").font(.caption.bold()).foregroundStyle(.orange) }
                    Text(turn.question).font(.title3)
                    Button("もう一度聞く / Listen again", systemImage: "speaker.wave.2") { reader.read(turn.question) }
                    Toggle("自動で読み上げ / Read aloud", isOn: $readAloud)
                    if !turn.intent.isEmpty {
                        DisclosureGroup("面接官が見ているポイント / What they look for") { Text(turn.intent).font(.callout) }
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
        Section("あなたの回答 / Your answer") {
            TextField("話すか、書いてください / Speak or type", text: $answer, axis: .vertical)
                .lineLimit(4...12)
            if speech.state == .listening {
                Button("話し終わった / Stop", systemImage: "stop.circle.fill", role: .destructive) { speech.stop() }
            } else {
                Button("話して答える / Answer by voice", systemImage: "mic") {
                    reader.stop()
                    spoken = true
                    Task { await speech.start() }
                }
            }
            if speech.state == .denied {
                Text("設定アプリでマイクと音声認識を許可してください / Allow the microphone and speech recognition in Settings").font(.caption).foregroundStyle(.red)
            } else if speech.state == .unavailable {
                Text("音声入力が使えません。文字で答えてください / Voice input isn't available; please type").font(.caption).foregroundStyle(.secondary)
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
                Text(model.busy ? "面接官が考えています… / Thinking…" : "回答する / Answer").bold()
            }
            .disabled(model.busy || answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            if session.answeredCount > 0 { finishButton(primary: false) }
        }
    }

    @ViewBuilder private func reviewSection(_ turn: InterviewTurn) -> some View {
        Section("あなたの回答 / Your answer") {
            Text(turn.answer ?? "")
        }
        if let feedback = turn.feedback {
            FeedbackSection(feedback: feedback, durationSec: turn.durationSec)
        }
        Section {
            if session.currentIndex != nil {
                Button("次の質問へ / Next question") { model.next() }.bold()
            }
            finishButton(primary: session.currentIndex == nil)
        }
    }

    private func finishButton(primary: Bool) -> some View {
        Button {
            speech.stop()
            Task { await model.finish() }
        } label: {
            Text(model.busy ? "振り返りを作成中… / Writing the review…" : "終了して振り返る / Finish and review")
                .fontWeight(primary ? .bold : .regular)
        }
        .disabled(model.busy)
    }
}

struct FeedbackSection: View {
    let feedback: InterviewFeedback
    let durationSec: Int?

    var body: some View {
        Section("フィードバック / Feedback") {
            HStack(alignment: .firstTextBaseline) {
                Text("\(feedback.score)").font(.largeTitle.bold())
                Text("点").foregroundStyle(.secondary)
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
            if let durationSec { Text("回答時間 / Time: \(durationSec)秒").font(.caption).foregroundStyle(.secondary) }
        }
    }
}

/// Bilan d'une séance terminée, avec toutes les questions et réponses.
struct InterviewSummaryView: View {
    let session: Interview
    let summary: InterviewSummary

    var body: some View {
        List {
            Section("振り返り / Review — \(session.company ?? "一般 / General") · \(session.stage.ja)") {
                HStack(alignment: .firstTextBaseline) {
                    Text("\(summary.score)").font(.largeTitle.bold())
                    Text("点").foregroundStyle(.secondary)
                }
                Text(summary.summary)
            }
            Section("良かった点 / Strengths") { ForEach(summary.strengths, id: \.self) { Text($0) } }
            Section("次に意識すること / Next time") { ForEach(summary.improvements, id: \.self) { Text($0) } }
            ForEach(Array(session.turns.enumerated()), id: \.offset) { i, turn in
                Section("Q\(i + 1)\(turn.isFollowUp ? " 深掘り" : "")") {
                    Text(turn.question).bold()
                    Text(turn.answer ?? "").foregroundStyle(.secondary)
                    if let f = turn.feedback { Text("\(f.score)点 · \(f.comment)").font(.callout) }
                }
            }
        }
    }
}
