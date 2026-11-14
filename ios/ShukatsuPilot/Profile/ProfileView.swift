import SwiftUI

/// Formulaire du profil (S05) : base du 履歴書 (S11).
struct ProfileView: View {
    @State var model: ProfileModel
    var onSaved: () async -> Void = {}
    /// Écran de bienvenue : une phrase invite à commencer par le CV.
    var cvHint = false
    @State private var importing = false

    var body: some View {
        Form {
            switch model.status {
            case .loading:
                ProgressView()
            default:
                Section {
                    if cvHint, !model.imported {
                        Text(tr("CVがあれば、読み込むだけで入力できます。内容を確かめて、足りないところを書き足してから保存してください。",
                                "If you have a CV, importing it fills the form. Check it, add what is missing, then save.",
                                "Si vous avez un CV, l'importer remplit le formulaire. Vérifiez, complétez ce qui manque, puis enregistrez."))
                            .font(.callout)
                    }
                    Button(tr("CVから入力", "Fill in from a CV", "Remplir depuis un CV"), systemImage: "doc.text.viewfinder") { importing = true }
                    if model.imported {
                        Text(tr("CVの内容を入力しました。確認してから「保存」を押してください。",
                                "Your CV has been filled in. Check it, then press Save.",
                                "Le contenu du CV a été rempli. Vérifiez-le, puis enregistrez."))
                            .font(.callout).foregroundStyle(Color.cwBlue700)
                    }
                }
                basics
                educationSection
                workSection
                certificationSection
                languageSection
                if !model.issues.isEmpty {
                    Section { Text(tr("入力を確認してください（\(model.issues.count)件）", "Please check \(model.issues.count) field(s)", "Vérifiez \(model.issues.count) champ(s)")).foregroundStyle(.red) }
                }
                if model.status == .failed {
                    Section { Text(tr("保存できませんでした", "Could not save", "Enregistrement impossible")).foregroundStyle(.red) }
                }
            }
        }
        .navigationTitle(tr("プロフィール", "Profile", "Profil"))
        .cleanList()
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(model.status == .saved ? tr("保存済み ✓", "Saved ✓", "Enregistré ✓") : tr("保存", "Save", "Enregistrer")) {
                    Task { if await model.save() { await onSaved() } }
                }
                .disabled(model.status == .saving || model.status == .loading)
            }
        }
        .task { if model.status == .loading { await model.load() } }
        .sheet(isPresented: $importing) {
            NavigationStack { CvImportView(api: model.api) { model.apply($0) } }
        }
    }

    // MARK: Sections

    private var basics: some View {
        Section(tr("基本情報", "Basic information", "Informations de base")) {
            field(tr("氏名", "Name *", "Nom *"), text: $model.profile.nameKanji, path: "nameKanji")
            field(tr("ふりがな（ひらがな・カタカナ）", "Reading in kana *", "Lecture en kana *"), text: $model.profile.nameKana, path: "nameKana")
            field(tr("ローマ字", "Name (Latin)", "Nom (alphabet latin)"), text: optional($model.profile.nameLatin), path: "nameLatin")
            field(tr("生年月日", "Date of birth (YYYY-MM-DD)", "Date de naissance (AAAA-MM-JJ)"), text: optional($model.profile.birthDate), path: "birthDate", keyboard: .numbersAndPunctuation)
            field(tr("メール", "Email", "E-mail"), text: optional($model.profile.email), path: "email", keyboard: .emailAddress)
            field(tr("電話", "Phone", "Téléphone"), text: optional($model.profile.phone), path: "phone", keyboard: .phonePad)
            field(tr("郵便番号", "Postal code", "Code postal"), text: optional($model.profile.postalCode), path: "postalCode", keyboard: .numbersAndPunctuation)
                .onChange(of: model.profile.postalCode) { _, new in
                    if (new ?? "").filter(\.isNumber).count == 7 { Task { await model.postalChanged() } }
                }
            field(tr("住所", "Address", "Adresse"), text: optional($model.profile.address), path: "address")
            if let hint = model.postalHint {
                Button(tr("住所に入れる", "Use this address", "Utiliser cette adresse") + " : " + hint) {
                    model.profile.address = hint
                    model.postalHint = nil
                }
                .font(.footnote)
            }
        }
    }

    private var educationSection: some View {
        Section(tr("学歴", "Education", "Formation")) {
            ForEach(Array($model.profile.education.enumerated()), id: \.element.id) { index, $item in
                VStack(alignment: .leading) {
                    field(tr("学校名", "School *", "Établissement *"), text: $item.school, path: "education.\(index).school")
                    field(tr("学部・学科", "Faculty", "Faculté / filière"), text: optional($item.faculty), path: "education.\(index).faculty")
                    month(tr("入学", "Start *", "Début *"), text: $item.start, path: "education.\(index).start")
                    month(tr("卒業・卒業予定", "End (or expected)", "Fin (ou prévue)"), text: optional($item.end), path: "education.\(index).end")
                    Picker(tr("状態", "Status", "Statut"), selection: $item.status) {
                        ForEach(Profile.Education.Status.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                }
            }
            .onDelete { model.profile.education.remove(atOffsets: $0) }
            Button(tr("＋ 追加", "Add", "＋ Ajouter")) { model.profile.education.append(.init()) }
        }
    }

    private var workSection: some View {
        Section(tr("職歴", "Work experience", "Expérience professionnelle")) {
            ForEach(Array($model.profile.work.enumerated()), id: \.element.id) { index, $item in
                VStack(alignment: .leading) {
                    field(tr("会社名", "Company *", "Entreprise *"), text: $item.company, path: "work.\(index).company")
                    field(tr("職種", "Role", "Poste"), text: optional($item.role), path: "work.\(index).role")
                    month(tr("入社", "Start *", "Début *"), text: $item.start, path: "work.\(index).start")
                    month(tr("退社", "End", "Fin"), text: optional($item.end), path: "work.\(index).end")
                    field(tr("内容", "Description", "Description"), text: optional($item.description), path: "work.\(index).description")
                }
            }
            .onDelete { model.profile.work.remove(atOffsets: $0) }
            Button(tr("＋ 追加", "Add", "＋ Ajouter")) { model.profile.work.append(.init()) }
        }
    }

    private var certificationSection: some View {
        Section(tr("資格", "Certifications", "Certifications")) {
            ForEach(Array($model.profile.certifications.enumerated()), id: \.element.id) { index, $item in
                VStack(alignment: .leading) {
                    choice(tr("分類", "Category *", "Catégorie *"), selection: $item.category, options: ProfileChoices.certificationCategories,
                           path: "certifications.\(index).category")
                    HStack {
                        field(tr("資格名", "Name *", "Intitulé *"), text: $item.name, path: "certifications.\(index).name")
                        let suggestions = ProfileChoices.certificationSuggestions[item.category] ?? []
                        if !suggestions.isEmpty {
                            Menu {
                                ForEach(suggestions, id: \.self) { name in Button(name) { item.name = name } }
                            } label: { Image(systemName: "list.bullet").accessibilityLabel(tr("候補", "Suggestions", "Suggestions")) }
                        }
                    }
                    month(tr("取得", "Date *", "Date *"), text: $item.date, path: "certifications.\(index).date")
                }
            }
            .onDelete { model.profile.certifications.remove(atOffsets: $0) }
            Button(tr("＋ 追加", "Add", "＋ Ajouter")) { model.profile.certifications.append(.init()) }
        }
    }

    private var languageSection: some View {
        Section(tr("語学", "Languages", "Langues")) {
            ForEach(Array($model.profile.languages.enumerated()), id: \.element.id) { index, $item in
                VStack(alignment: .leading) {
                    choice(tr("言語", "Language *", "Langue *"), selection: $item.language, options: ProfileChoices.languages,
                           path: "languages.\(index).language")
                    if item.language == "other" {
                        field(tr("どの言語？", "Which language? *", "Quelle langue ? *"), text: optional($item.languageOther), path: "languages.\(index).languageOther")
                    }
                    choice(tr("レベル", "Level *", "Niveau *"), selection: $item.level, options: ProfileChoices.levels,
                           path: "languages.\(index).level")
                }
            }
            .onDelete { model.profile.languages.remove(atOffsets: $0) }
            Button(tr("＋ 追加", "Add", "＋ Ajouter")) { model.profile.languages.append(.init()) }
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

    /// Liste de choix ; l'option vide oblige à choisir (l'API répond « 選択してください » sinon).
    private func choice(_ label: String, selection: Binding<String>, options: [ProfileChoices.Choice], path: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Picker(label, selection: selection) {
                Text(tr("選択", "Choose", "Choisir")).tag("")
                ForEach(options, id: \.value) { Text($0.label).tag($0.value) }
            }
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
