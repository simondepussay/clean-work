import QuickLook
import SwiftUI

/// 履歴書 en PDF (S11) : options, puis aperçu iOS (partager, enregistrer, imprimer).
struct ResumeView: View {
    let api: APIClient

    @State private var options = APIClient.ResumeOptions(wishes: "貴社の規定に従います。")
    @State private var drafts: [Draft] = []
    @State private var busy = false
    @State private var message: String?
    @State private var preview: URL?

    var body: some View {
        Form {
            Section {
                Picker("年の書き方 / Years", selection: $options.era) {
                    Text("西暦（2026年）").tag(APIClient.ResumeOptions.Era.western)
                    Text("和暦（令和8年）").tag(APIClient.ResumeOptions.Era.japanese)
                }
            } footer: {
                Text("保存したプロフィールから、厚生労働省の様式で作成します。/ Created from your saved profile.")
            }

            Section {
                TextEditor(text: text($options.appeal)).frame(minHeight: 140)
                let filled = drafts.filter { !$0.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
                if !filled.isEmpty {
                    Menu("ESから入れる / Fill from an ES") {
                        ForEach(filled) { d in Button("\(d.company ?? "共通")：\(d.question)") { options.appeal = d.body } }
                    }
                }
            } header: {
                Text("志望の動機・特技・アピールポイントなど")
            }

            Section("本人希望記入欄 / Your requests") {
                TextEditor(text: text($options.wishes)).frame(minHeight: 60)
            }

            Section {
                Button(busy ? "作成中… / Creating…" : "PDFを作成 / Create PDF") { Task { await generate() } }
                    .disabled(busy)
                if let message { Text(message).foregroundStyle(.orange) }
            }
        }
        .navigationTitle("履歴書PDF")
        .task { drafts = (try? await api.drafts()) ?? [] }
        .quickLookPreview($preview)
    }

    private func generate() async {
        busy = true
        message = nil
        defer { busy = false }
        do {
            switch try await api.resume(options) {
            case .success(let pdf):
                // Fichier temporaire au nom japonais : c'est ce nom que verra le destinataire en partageant.
                let url = FileManager.default.temporaryDirectory.appending(path: pdf.filename)
                try pdf.data.write(to: url, options: .atomic)
                preview = url
            case .failure(.profileMissing):
                message = "先にプロフィールを保存してください / Save your profile first"
            case .failure:
                message = "作成できませんでした / Could not create the PDF"
            }
        } catch {
            message = "作成できませんでした / Could not create the PDF"
        }
    }

    private func text(_ value: Binding<String?>) -> Binding<String> {
        Binding(get: { value.wrappedValue ?? "" }, set: { value.wrappedValue = $0.isEmpty ? nil : $0 })
    }
}
