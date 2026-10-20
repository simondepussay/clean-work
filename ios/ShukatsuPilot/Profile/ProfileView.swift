import SwiftUI

/// Formulaire du profil (S05) : base du 履歴書 (S11).
struct ProfileView: View {
    @State var model: ProfileModel
    var onSaved: () async -> Void = {}

    var body: some View {
        Form {
            switch model.status {
            case .loading:
                ProgressView()
            default:
                basics
                educationSection
                workSection
                certificationSection
                languageSection
                if !model.issues.isEmpty {
                    Section { Text("入力を確認してください（\(model.issues.count)件）/ Please check \(model.issues.count) field(s)").foregroundStyle(.red) }
                }
                if model.status == .failed {
                    Section { Text("保存できませんでした / Could not save").foregroundStyle(.red) }
                }
            }
        }
        .navigationTitle("プロフィール")
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(model.status == .saved ? "保存済み ✓" : "保存 / Save") {
                    Task { if await model.save() { await onSaved() } }
                }
                .disabled(model.status == .saving || model.status == .loading)
            }
        }
        .task { if model.status == .loading { await model.load() } }
    }

    // MARK: Sections

    private var basics: some View {
        Section("基本情報 / Basic information") {
            field("氏名 / Name *", text: $model.profile.nameKanji, path: "nameKanji")
            field("ふりがな / Reading *", text: $model.profile.nameKana, path: "nameKana")
            field("ローマ字 / Name (Latin)", text: optional($model.profile.nameLatin), path: "nameLatin")
            field("生年月日 / Date of birth (YYYY-MM-DD)", text: optional($model.profile.birthDate), path: "birthDate", keyboard: .numbersAndPunctuation)
            field("メール / Email", text: optional($model.profile.email), path: "email", keyboard: .emailAddress)
            field("電話 / Phone", text: optional($model.profile.phone), path: "phone", keyboard: .phonePad)
            field("住所 / Address", text: optional($model.profile.address), path: "address")
        }
    }

    private var educationSection: some View {
        Section("学歴 / Education") {
            ForEach(Array($model.profile.education.enumerated()), id: \.element.id) { index, $item in
                VStack(alignment: .leading) {
                    field("学校名 / School *", text: $item.school, path: "education.\(index).school")
                    field("学部・学科 / Faculty", text: optional($item.faculty), path: "education.\(index).faculty")
                    month("入学 / Start *", text: $item.start, path: "education.\(index).start")
                    month("卒業 / End", text: optional($item.end), path: "education.\(index).end")
                    Picker("状態 / Status", selection: $item.status) {
                        ForEach(Profile.Education.Status.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                }
            }
            .onDelete { model.profile.education.remove(atOffsets: $0) }
            Button("＋ 追加 / Add") { model.profile.education.append(.init()) }
        }
    }

    private var workSection: some View {
        Section("職歴 / Work experience") {
            ForEach(Array($model.profile.work.enumerated()), id: \.element.id) { index, $item in
                VStack(alignment: .leading) {
                    field("会社名 / Company *", text: $item.company, path: "work.\(index).company")
                    field("職種 / Role", text: optional($item.role), path: "work.\(index).role")
                    month("入社 / Start *", text: $item.start, path: "work.\(index).start")
                    month("退社 / End", text: optional($item.end), path: "work.\(index).end")
                    field("内容 / Description", text: optional($item.description), path: "work.\(index).description")
                }
            }
            .onDelete { model.profile.work.remove(atOffsets: $0) }
            Button("＋ 追加 / Add") { model.profile.work.append(.init()) }
        }
    }

    private var certificationSection: some View {
        Section("資格 / Certifications") {
            ForEach(Array($model.profile.certifications.enumerated()), id: \.element.id) { index, $item in
                VStack(alignment: .leading) {
                    field("資格名 / Name *", text: $item.name, path: "certifications.\(index).name")
                    month("取得 / Date *", text: $item.date, path: "certifications.\(index).date")
                }
            }
            .onDelete { model.profile.certifications.remove(atOffsets: $0) }
            Button("＋ 追加 / Add") { model.profile.certifications.append(.init()) }
        }
    }

    private var languageSection: some View {
        Section("語学 / Languages") {
            ForEach(Array($model.profile.languages.enumerated()), id: \.element.id) { index, $item in
                VStack(alignment: .leading) {
                    field("言語 / Language *", text: $item.language, path: "languages.\(index).language")
                    field("レベル / Level", text: $item.level, path: "languages.\(index).level")
                }
            }
            .onDelete { model.profile.languages.remove(atOffsets: $0) }
            Button("＋ 追加 / Add") { model.profile.languages.append(.init()) }
        }
    }

    // MARK: Champs

    private func field(_ label: String, text: Binding<String>, path: String, keyboard: UIKeyboardType = .default) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            TextField(label, text: text)
                .keyboardType(keyboard)
                .textInputAutocapitalization(keyboard == .emailAddress ? .never : .sentences)
            if let error = model.error(path) {
                Text(error).font(.caption).foregroundStyle(.red)
            }
        }
    }

    /// Mois au format de l'API (AAAA-MM), par exemple 2026-04.
    private func month(_ label: String, text: Binding<String>, path: String) -> some View {
        field("\(label) (YYYY-MM)", text: text, path: path, keyboard: .numbersAndPunctuation)
    }

    /// Un champ facultatif vide vaut nil, pour ne pas être envoyé (sinon « date invalide »…).
    private func optional(_ value: Binding<String?>) -> Binding<String> {
        Binding(get: { value.wrappedValue ?? "" },
                set: { value.wrappedValue = $0.trimmingCharacters(in: .whitespaces).isEmpty ? nil : $0 })
    }
}
