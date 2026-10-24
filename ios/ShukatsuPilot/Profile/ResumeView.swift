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
                Picker(tr("書類", "Document", "Document"), selection: $kind) {
                    Text(tr("履歴書", "Résumé (履歴書)", "CV (履歴書)")).tag(Kind.resume)
                    Text(tr("職務経歴書", "Career (職務経歴書)", "Parcours (職務経歴書)")).tag(Kind.workHistory)
                }
                .pickerStyle(.segmented)
                Picker(tr("年の書き方", "Years", "Format des années"), selection: $options.era) {
                    Text(tr("西暦（2026年）", "Western (2026)", "Occidental (2026)")).tag(APIClient.ResumeOptions.Era.western)
                    Text(tr("和暦（令和8年）", "Japanese era (Reiwa 8)", "Ère japonaise (Reiwa 8)")).tag(APIClient.ResumeOptions.Era.japanese)
                }
            } footer: {
                Text(kind == .resume
                     ? tr("厚生労働省の様式で作成します。", "Ministry of Health, Labour and Welfare format.", "Format du ministère japonais de la Santé et du Travail.")
                     : tr("職歴（アルバイト・インターン含む）を時系列でまとめます。", "Your work experience (part-time jobs and internships included), in chronological order.", "Votre expérience (petits boulots et stages compris), dans l'ordre chronologique."))
            }

            if kind == .resume {
                Section {
                    TextEditor(text: text($options.appeal)).frame(minHeight: 140)
                    fromEs { options.appeal = $0 }
                } header: {
                    Text(tr("志望の動機・特技・アピールポイントなど", "Motivation, strengths, selling points", "Motivation, points forts, atouts"))
                }
                Section(tr("本人希望記入欄", "Your requests", "Vos souhaits")) {
                    TextEditor(text: text($options.wishes)).frame(minHeight: 60)
                }
            } else {
                Section(tr("職務要約", "Summary", "Résumé")) { TextEditor(text: text($work.summary)).frame(minHeight: 70) }
                Section(tr("活かせる経験・知識・スキル", "Skills", "Compétences")) { TextEditor(text: text($work.skills)).frame(minHeight: 90) }
                Section(tr("自己PR", "Self-PR", "Auto-présentation (自己PR)")) {
                    TextEditor(text: text($work.selfPr)).frame(minHeight: 140)
                    fromEs { work.selfPr = $0 }
                }
            }

            Section {
                Button(busy ? tr("作成中…", "Creating…", "Création…") : tr("PDFを作成", "Create PDF", "Créer le PDF")) { Task { await generate() } }
                    .disabled(busy)
                if let message { Text(message).foregroundStyle(.orange) }
            }
        }
        .navigationTitle(tr("応募書類PDF", "Documents (PDF)", "Documents (PDF)"))
        .cleanList()
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
                message = tr("先にプロフィールを保存してください", "Save your profile first", "Enregistrez d'abord votre profil")
            case .failure(.noWork):
                message = tr("職歴がありません。プロフィールに職歴を追加してください", "Add work experience to your profile first", "Ajoutez d'abord une expérience professionnelle à votre profil")
            case .failure:
                message = tr("作成できませんでした", "Could not create the PDF", "Impossible de créer le PDF")
            }
        } catch {
            message = tr("作成できませんでした", "Could not create the PDF", "Impossible de créer le PDF")
        }
    }

    @ViewBuilder private func fromEs(_ fill: @escaping (String) -> Void) -> some View {
        let filled = drafts.filter { !$0.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        if !filled.isEmpty {
            Menu(tr("ESから入れる", "Fill from an ES", "Reprendre d'une ES")) {
                ForEach(filled) { d in Button("\(d.company ?? tr("共通", "General", "Général"))：\(d.question)") { fill(d.body) } }
            }
        }
    }

    private func text(_ value: Binding<String?>) -> Binding<String> {
        Binding(get: { value.wrappedValue ?? "" }, set: { value.wrappedValue = $0.isEmpty ? nil : $0 })
    }
}
