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
                if kind == .resume {
                    Picker(tr("様式", "Template", "Modèle"), selection: $options.template) {
                        Text(tr("新卒用（就活）", "New graduates (job hunting)", "Jeunes diplômés (就活)")).tag(APIClient.ResumeOptions.Template.student)
                        Text(tr("一般用（厚生労働省様式）", "General (ministry format)", "Général (modèle du ministère)")).tag(APIClient.ResumeOptions.Template.standard)
                        Text(tr("アルバイト・パート用", "Part-time job (baito)", "Petit boulot (baito)")).tag(APIClient.ResumeOptions.Template.baito)
                    }
                }
                Picker(tr("年の書き方", "Years", "Format des années"), selection: $options.era) {
                    Text(tr("西暦（2026年）", "Western (2026)", "Occidental (2026)")).tag(APIClient.ResumeOptions.Era.western)
                    Text(tr("和暦（令和8年）", "Japanese era (Reiwa 8)", "Ère japonaise (Reiwa 8)")).tag(APIClient.ResumeOptions.Era.japanese)
                }
            } footer: {
                Text(kind == .resume
                     ? Self.templateHelp(options.template)
                     : tr("職歴（アルバイト・インターン含む）を時系列でまとめます。", "Your work experience (part-time jobs and internships included), in chronological order.", "Votre expérience (petits boulots et stages compris), dans l'ordre chronologique."))
            }

            if kind == .resume {
                switch options.template {
                case .student:
                    Section(tr("志望動機", "Motivation", "Motivation")) {
                        TextEditor(text: text($options.appeal)).frame(minHeight: 110)
                        fromEs { options.appeal = $0 }
                    }
                    Section(tr("学生時代に力を入れたこと", "What you focused on as a student", "Ce que vous avez fait pendant vos études (gakuchika)")) {
                        TextEditor(text: text($options.gakuchika)).frame(minHeight: 110)
                        fromEs { options.gakuchika = $0 }
                    }
                    Section {
                        TextEditor(text: text($options.selfPr)).frame(minHeight: 110)
                        fromEs { options.selfPr = $0 }
                    } header: {
                        Text(tr("自己PR", "Self-PR", "Auto-présentation (自己PR)"))
                    } footer: {
                        Text(tr("新卒の履歴書では、アルバイトは職歴に書かないのが一般的です（自己PRや学生時代に力を入れたことで触れましょう）。", "On a graduate résumé, part-time jobs usually don't go under work history: mention them in your self-PR or gakuchika instead.", "Sur un 履歴書 de jeune diplômé, on n'écrit en général pas les petits boulots dans 職歴 : parlez-en plutôt dans l'auto-présentation ou le gakuchika."))
                    }
                case .baito:
                    Section(tr("勤務できる曜日", "Days you can work", "Jours possibles")) {
                        HStack(spacing: 6) {
                            ForEach(Self.weekdays, id: \.id) { day in
                                let on = options.days?.contains(day.id) == true
                                Button { toggle(day.id) } label: {
                                    Text(day.name).font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity, minHeight: 36)
                                        .foregroundStyle(on ? .white : Color.cwBlue800)
                                        .background(on ? Color.cwBlue700 : Color.cwBlue50, in: RoundedRectangle(cornerRadius: 8))
                                }
                                .buttonStyle(.plain)
                                .accessibilityAddTraits(on ? .isSelected : [])
                            }
                        }
                        TextField(tr("時間帯（例：平日17時以降、土日は終日）", "Hours (e.g. weekdays after 5 pm, all day on weekends)", "Horaires (ex. : en semaine après 17 h)"), text: text($options.hours))
                        TextField(tr("最寄り駅", "Nearest station", "Gare la plus proche"), text: text($options.station))
                        TextField(tr("通勤時間（分）", "Commute (minutes)", "Trajet (minutes)"), value: $options.commute, format: .number)
                            .keyboardType(.numberPad)
                    }
                    Section(tr("志望動機・自己PR・特技など", "Motivation, strengths, skills", "Motivation, points forts, compétences")) {
                        TextEditor(text: text($options.appeal)).frame(minHeight: 120)
                    }
                case .standard:
                    Section {
                        TextEditor(text: text($options.appeal)).frame(minHeight: 140)
                        fromEs { options.appeal = $0 }
                    } header: {
                        Text(tr("志望の動機・特技・アピールポイントなど", "Motivation, strengths, selling points", "Motivation, points forts, atouts"))
                    }
                }
                Section {
                    TextEditor(text: text($options.wishes)).frame(minHeight: 60)
                } header: {
                    Text(tr("本人希望記入欄", "Your requests", "Vos souhaits"))
                } footer: {
                    Text(tr("氏名・学歴・職歴・資格はプロフィールから入ります。写真の枠は空けてあるので、印刷して貼ってください。", "Name, education, work and certifications come from your profile. The photo box is left empty: print and paste your photo.", "Nom, études, expériences et certifications viennent de votre profil. Le cadre photo reste vide : imprimez et collez votre photo."))
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

    private static let weekdays: [(id: String, name: String)] = [
        ("mon", tr("月", "M", "L")), ("tue", tr("火", "T", "M")), ("wed", tr("水", "W", "M")), ("thu", tr("木", "T", "J")),
        ("fri", tr("金", "F", "V")), ("sat", tr("土", "S", "S")), ("sun", tr("日", "S", "D")),
    ]

    /// Coche ou décoche un jour, en gardant l'ordre de la semaine.
    private func toggle(_ day: String) {
        var days = Set(options.days ?? [])
        if days.contains(day) { days.remove(day) } else { days.insert(day) }
        options.days = Self.weekdays.map(\.id).filter(days.contains)
    }

    static func templateHelp(_ template: APIClient.ResumeOptions.Template) -> String {
        switch template {
        case .student: tr("新卒の就活向け。志望動機・学生時代に力を入れたこと・自己PRの欄が大きい様式です。", "For graduate job hunting: large boxes for motivation, what you focused on as a student, and self-PR.", "Pour le 就活 des jeunes diplômés : grandes cases pour la motivation, le gakuchika et l'auto-présentation.")
        case .standard: tr("厚生労働省の様式。どの応募にも使えます。", "The Ministry of Health, Labour and Welfare format, accepted everywhere.", "Le modèle du ministère japonais de la Santé et du Travail, accepté partout.")
        case .baito: tr("アルバイト・パート向け。勤務できる曜日・時間帯と通勤時間の欄があります。", "For part-time jobs: boxes for the days and hours you can work, and your commute.", "Pour un petit boulot : cases pour les jours et horaires possibles, et le temps de trajet.")
        }
    }

    private func text(_ value: Binding<String?>) -> Binding<String> {
        Binding(get: { value.wrappedValue ?? "" }, set: { value.wrappedValue = $0.isEmpty ? nil : $0 })
    }
}
