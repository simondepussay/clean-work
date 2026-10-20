import QuickLook
import SwiftUI

/// 履歴書 (S11) et 職務経歴書 (S12) en PDF : options, puis aperçu iOS (partager, enregistrer, imprimer).
struct ResumeView: View {
    let api: APIClient

    private enum Kind: Hashable { case resume, workHistory }
    @State private var kind: Kind = .resume
    @State private var options = APIClient.ResumeOptions(wishes: "貴社の規定に従います。")
    @State private var work = APIClient.WorkHistoryOptions()
    @State private var drafts: [Draft] = []
    @State private var busy = false
    @State private var message: String?
    @State private var preview: URL?

    var body: some View {
        Form {
            Section {
                Picker("書類 / Document", selection: $kind) {
                    Text("履歴書").tag(Kind.resume)
                    Text("職務経歴書").tag(Kind.workHistory)
                }
                .pickerStyle(.segmented)
                Picker("年の書き方 / Years", selection: $options.era) {
                    Text("西暦（2026年）").tag(APIClient.ResumeOptions.Era.western)
                    Text("和暦（令和8年）").tag(APIClient.ResumeOptions.Era.japanese)
                }
            } footer: {
                Text(kind == .resume
                     ? "厚生労働省の様式で作成します。/ Ministry of Health, Labour and Welfare format."
                     : "職歴（アルバイト・インターン含む）を時系列でまとめます。/ Your work experience, in chronological order.")
            }

            if kind == .resume {
                Section {
                    TextEditor(text: text($options.appeal)).frame(minHeight: 140)
                    fromEs { options.appeal = $0 }
                } header: {
                    Text("志望の動機・特技・アピールポイントなど")
                }
                Section("本人希望記入欄 / Your requests") {
                    TextEditor(text: text($options.wishes)).frame(minHeight: 60)
                }
            } else {
                Section("職務要約 / Summary") { TextEditor(text: text($work.summary)).frame(minHeight: 70) }
                Section("活かせる経験・知識・スキル / Skills") { TextEditor(text: text($work.skills)).frame(minHeight: 90) }
                Section("自己PR / Self-PR") {
                    TextEditor(text: text($work.selfPr)).frame(minHeight: 140)
                    fromEs { work.selfPr = $0 }
                }
            }

            Section {
                Button(busy ? "作成中… / Creating…" : "PDFを作成 / Create PDF") { Task { await generate() } }
                    .disabled(busy)
                if let message { Text(message).foregroundStyle(.orange) }
            }
        }
        .navigationTitle("応募書類PDF")
        .task { drafts = (try? await api.drafts()) ?? [] }
        .quickLookPreview($preview)
    }

    private func generate() async {
        busy = true
        message = nil
        defer { busy = false }
        do {
            work.era = options.era
            let result = kind == .resume ? try await api.resume(options) : try await api.workHistory(work)
            switch result {
            case .success(let pdf):
                // Fichier temporaire au nom japonais : c'est ce nom que verra le destinataire en partageant.
                let url = FileManager.default.temporaryDirectory.appending(path: pdf.filename)
                try pdf.data.write(to: url, options: .atomic)
                preview = url
            case .failure(.profileMissing):
                message = "先にプロフィールを保存してください / Save your profile first"
            case .failure(.noWork):
                message = "職歴がありません。プロフィールに職歴を追加してください / Add work experience to your profile first"
            case .failure:
                message = "作成できませんでした / Could not create the PDF"
            }
        } catch {
            message = "作成できませんでした / Could not create the PDF"
        }
    }

    @ViewBuilder private func fromEs(_ fill: @escaping (String) -> Void) -> some View {
        let filled = drafts.filter { !$0.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        if !filled.isEmpty {
            Menu("ESから入れる / Fill from an ES") {
                ForEach(filled) { d in Button("\(d.company ?? "共通")：\(d.question)") { fill(d.body) } }
            }
        }
    }

    private func text(_ value: Binding<String?>) -> Binding<String> {
        Binding(get: { value.wrappedValue ?? "" }, set: { value.wrappedValue = $0.isEmpty ? nil : $0 })
    }
}
