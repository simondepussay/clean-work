import PhotosUI
import SwiftUI

/// État de l'onglet 名刺 : la liste des cartes et leurs photos déjà chargées.
@MainActor
@Observable
final class CardsModel {
    let api: APIClient
    private(set) var cards: [BusinessCard]?
    private(set) var loadFailed = false
    private(set) var photos: [String: UIImage] = [:]
    @ObservationIgnored private var downloads: [String: Task<Void, Never>] = [:]

    init(api: APIClient) { self.api = api }

    func load() async {
        do {
            cards = try await api.cards()
            loadFailed = false
        } catch {
            if cards == nil { loadFailed = true }
        }
    }

    /// Charge la photo d'une carte. Le téléchargement ne dépend pas de l'écran qui le demande : quitter la liste
    /// pour ouvrir la fiche l'annulait, et la fiche attendait alors une photo qui n'arrivait jamais.
    func photo(for card: BusinessCard) async {
        guard card.hasImage, photos[card.id] == nil else { return }
        if let running = downloads[card.id] { return await running.value }
        let api = api
        let download = Task { [weak self] in
            for attempt in 0..<3 {
                if attempt > 0 { try? await Task.sleep(for: .seconds(Double(attempt) * 2)) }
                do {
                    let data = try await api.cardImage(card.id)
                    if let image = UIImage(data: data) { self?.photos[card.id] = image; break }
                    print("Photo du 名刺 illisible (\(data.count) octets)")
                } catch {
                    print("Photo du 名刺 non chargée (essai \(attempt + 1)) : \(error)")
                }
            }
            self?.downloads[card.id] = nil
        }
        downloads[card.id] = download
        await download.value
    }

    func added(_ card: BusinessCard, photo: UIImage?) {
        cards = [card] + (cards ?? [])
        if let photo { photos[card.id] = photo }
    }

    func replaced(_ card: BusinessCard) {
        cards = cards?.map { $0.id == card.id ? card : $0 }
    }

    func removed(_ id: String) {
        cards = cards?.filter { $0.id != id }
        photos[id] = nil
    }
}

/// Onglet « 名刺 » de 書類 : scanner une carte (bien visible en haut), puis retrouver ses cartes par mots-clés.
struct CardsView: View {
    @State private var model: CardsModel
    @State private var query = ""
    @State private var scanning = false
    @State private var picked: PhotosPickerItem?
    /// La photo qui vient d'être prise ou choisie : ouvre le formulaire de la nouvelle carte.
    @State private var newCard: NewCardImage?

    init(api: APIClient) { _model = State(initialValue: CardsModel(api: api)) }

    private var shown: [BusinessCard] { (model.cards ?? []).filter { query.isEmpty || $0.matches(query) } }

    var body: some View {
        List {
            Section { scanCard }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
            if let cards = model.cards {
                if cards.isEmpty {
                    Section {
                        Text(tr("説明会やOB訪問でもらった名刺を撮影すると、名前や会社名を読み取って保存します。あとからキーワードで探せます（Webでも）。",
                                "Scan the business cards you get at info sessions or OB visits: the name and company are read and saved, and you can search them later (on the web too).",
                                "Scannez les cartes reçues en 説明会 ou en OB訪問 : le nom et l'entreprise sont lus et enregistrés, et vous les retrouvez ensuite par mots-clés (sur le web aussi)."))
                            .font(.subheadline).foregroundStyle(Color.cwMuted)
                    }
                } else if shown.isEmpty {
                    Text(tr("見つかりませんでした", "No card matches", "Aucune carte ne correspond")).foregroundStyle(Color.cwMuted)
                } else {
                    Section(tr("名刺 \(cards.count)枚", "\(cards.count) cards", "\(cards.count) cartes")) {
                        ForEach(shown) { card in
                            NavigationLink(value: card) { CardRow(card: card, photo: model.photos[card.id]) }
                                .task { await model.photo(for: card) }
                        }
                    }
                }
            } else if model.loadFailed {
                Text(tr("読み込めませんでした", "Could not load", "Chargement impossible")).foregroundStyle(Color.cwMuted)
            } else {
                HStack { Spacer(); ArcLoader(size: 28); Spacer() }.listRowBackground(Color.clear)
            }
        }
        .cleanList()
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always),
                    prompt: tr("名前・会社・メモで検索", "Search name, company, notes", "Chercher : nom, entreprise, notes"))
        .navigationDestination(for: BusinessCard.self) { card in
            CardDetailView(model: model, card: card)
        }
        .task { await model.load() }
        .refreshable { await model.load() }
        .fullScreenCover(isPresented: $scanning) {
            CardScanner(onScan: { image in
                scanning = false
                newCard = NewCardImage(image: image)
            }, onCancel: { scanning = false })
            .ignoresSafeArea()
        }
        .sheet(item: $newCard) { item in
            NavigationStack { NewCardView(model: model, image: item.image) }
        }
        .onChange(of: picked) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) { newCard = NewCardImage(image: image) }
                picked = nil
            }
        }
    }

    /// Le grand bouton « 名刺をスキャン », et le choix d'une photo déjà prise.
    private var scanCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            if CardScanner.isAvailable {
                Button { scanning = true } label: {
                    Label(tr("名刺をスキャン", "Scan a business card", "Scanner une carte de visite"), systemImage: "person.crop.rectangle.badge.plus")
                        .font(.headline).frame(maxWidth: .infinity).padding(.vertical, 12)
                        .foregroundStyle(.white)
                        .background(Color.cwBordeaux, in: RoundedRectangle(cornerRadius: 14))
                }
                .buttonStyle(.plain)
            }
            PhotosPicker(selection: $picked, matching: .images) {
                Label(tr("写真から選ぶ", "Choose a photo", "Choisir une photo"), systemImage: "photo.on.rectangle")
                    .font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity).padding(.vertical, 8)
                    .foregroundStyle(Color.cwBlue800)
                    .background(Color.cwBlue50, in: RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.cwLine))
            }
            .buttonStyle(.plain)
        }
    }
}

private struct NewCardImage: Identifiable {
    let id = UUID()
    let image: UIImage
}

/// Une ligne de la liste : la photo en petit, le nom, l'entreprise et le début des notes.
private struct CardRow: View {
    let card: BusinessCard
    let photo: UIImage?

    var body: some View {
        HStack(spacing: 12) {
            CardThumbnail(photo: photo, hasImage: card.hasImage).frame(width: 74)
            VStack(alignment: .leading, spacing: 2) {
                Text(card.displayName).font(.headline).foregroundStyle(Color.cwBlue800).lineLimit(1)
                let sub = [card.company, card.title].compactMap { $0 }.filter { !$0.isEmpty && $0 != card.displayName }.joined(separator: " · ")
                if !sub.isEmpty { Text(sub).font(.caption).foregroundStyle(Color.cwMuted).lineLimit(1) }
                if let notes = card.notes, !notes.isEmpty { Text(notes).font(.caption2).foregroundStyle(Color.cwMuted).lineLimit(1) }
            }
        }
        .padding(.vertical, 2)
    }
}

/// La carte en miniature (format japonais 91 × 55 mm), ou une carte vide si pas de photo.
struct CardThumbnail: View {
    let photo: UIImage?
    let hasImage: Bool

    var body: some View {
        RoundedRectangle(cornerRadius: 6).fill(Color.cwBlue50)
            .overlay {
                if let photo {
                    Image(uiImage: photo).resizable().scaledToFill()
                } else {
                    Text("名刺").font(.caption2.weight(.bold)).tracking(2).foregroundStyle(Color.cwBlue300)
                        .opacity(hasImage ? 0.4 : 1)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.cwLine))
            .aspectRatio(91 / 55, contentMode: .fit)
            .accessibilityHidden(true)
    }
}

// MARK: Nouvelle carte

/// Après le scan : lecture du texte (iPhone), rangement par l'IA, puis vérification par l'étudiant avant d'enregistrer.
struct NewCardView: View {
    let model: CardsModel
    let image: UIImage
    @Environment(\.dismiss) private var dismiss
    @State private var fields = CardFields()
    @State private var rawText = ""
    @State private var reading = true
    @State private var readByAI = false
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        Form {
            Section {
                Image(uiImage: image).resizable().scaledToFit().clipShape(RoundedRectangle(cornerRadius: 8))
                    .frame(maxWidth: .infinity).accessibilityLabel(tr("名刺の写真", "Photo of the card", "Photo de la carte"))
                if reading {
                    HStack(spacing: 10) {
                        ProgressView()
                        Text(tr("名刺を読み取っています…", "Reading the card…", "Lecture de la carte…")).foregroundStyle(Color.cwMuted)
                    }
                } else {
                    Text(readByAI
                         ? tr("読み取った内容を確認して、必要なら直してください。", "Check what was read and fix it if needed.", "Vérifiez ce qui a été lu, et corrigez si besoin.")
                         : tr("自動の整理ができなかったので、読み取れた部分だけ入れました。確認してください。", "Automatic sorting wasn't available, so only part of the card was filled in. Please check.", "Le rangement automatique n'était pas disponible : seule une partie est remplie. Vérifiez."))
                        .font(.footnote).foregroundStyle(Color.cwMuted)
                }
            }
            CardFormSections(fields: $fields)
            if let error { Section { Text(error).foregroundStyle(.red) } }
        }
        .disabled(reading)
        .navigationTitle(tr("新しい名刺", "New card", "Nouvelle carte"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button(tr("キャンセル", "Cancel", "Annuler")) { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button(tr("保存", "Save", "Enregistrer")) { Task { await save() } }
                    .disabled(reading || saving || fields.isEmpty)
            }
        }
        .task { await read() }
        .interactiveDismissDisabled(saving)
    }

    private func read() async {
        rawText = await CardTextReader.text(in: image)
        if !rawText.isEmpty, let ai = await model.api.readCard(text: rawText) {
            fields = CardFields(ai)
            readByAI = true
        } else {
            fields = LocalCardParser.fields(from: rawText)
        }
        if fields.metOn == nil { fields.metOn = .now }
        reading = false
    }

    private func save() async {
        saving = true
        defer { saving = false }
        do {
            if let card = try await model.api.createCard(fields, rawText: rawText, jpeg: CardPhoto.jpeg(image)) {
                model.added(card, photo: image)
                dismiss()
            } else {
                error = tr("名刺の数が上限（500枚）です。古い名刺を削除してください。", "You have reached 500 cards. Delete old ones first.", "Vous avez atteint 500 cartes. Supprimez-en d'abord.")
            }
        } catch APIError.invalid(let issues) {
            error = issues.map(\.message).joined(separator: "\n")
        } catch {
            self.error = tr("保存できませんでした", "Could not save", "Impossible d'enregistrer")
        }
    }
}

/// Les champs d'une carte, communs au scan et à la fiche.
struct CardFormSections: View {
    @Binding var fields: CardFields

    var body: some View {
        Section(tr("名刺", "Card", "Carte")) {
            field(tr("氏名", "Name", "Nom"), $fields.name)
            field(tr("ふりがな", "Reading (kana)", "Lecture (kana)"), $fields.nameKana)
            field(tr("会社名", "Company", "Entreprise"), $fields.company)
            field(tr("部署", "Department", "Service"), $fields.department)
            field(tr("役職", "Title", "Poste"), $fields.title)
        }
        Section(tr("連絡先", "Contact", "Contact")) {
            field(tr("メール", "Email", "E-mail"), $fields.email, keyboard: .emailAddress)
            field(tr("電話", "Phone", "Téléphone"), $fields.phone, keyboard: .phonePad)
            field(tr("携帯", "Mobile", "Portable"), $fields.mobile, keyboard: .phonePad)
            field(tr("住所", "Address", "Adresse"), $fields.address)
            field(tr("Webサイト", "Website", "Site web"), $fields.website, keyboard: .URL)
        }
        Section(tr("メモ", "Notes", "Notes")) {
            field(tr("会った場所", "Where we met", "Rencontré à"), $fields.metAt)
            DatePicker(tr("会った日", "Date met", "Date"), selection: Binding(get: { fields.metOn ?? .now }, set: { fields.metOn = $0 }), displayedComponents: .date)
            TextField(tr("話した内容、お礼メール、次にすること…", "What you talked about, thank-you email, next step…", "Sujets abordés, mail de remerciement, prochaine étape…"),
                      text: $fields.notes, axis: .vertical)
                .lineLimit(3...10)
        }
    }

    private func field(_ label: String, _ text: Binding<String>, keyboard: UIKeyboardType = .default) -> some View {
        LabeledContent(label) {
            TextField(label, text: text)
                .multilineTextAlignment(.trailing)
                .keyboardType(keyboard)
                .textInputAutocapitalization(keyboard == .default ? .sentences : .never)
                .autocorrectionDisabled(keyboard != .default)
        }
    }
}

// MARK: Fiche d'une carte

/// La fiche : la photo, appeler ou écrire en un geste, les infos et les notes (enregistrées en partant).
struct CardDetailView: View {
    let model: CardsModel
    let card: BusinessCard
    @Environment(\.dismiss) private var dismiss
    @State private var fields: CardFields
    @State private var saved: CardFields
    @State private var confirmingDeletion = false
    @State private var error: String?
    @State private var showingPhoto = false

    init(model: CardsModel, card: BusinessCard) {
        self.model = model
        self.card = card
        _fields = State(initialValue: CardFields(card))
        _saved = State(initialValue: CardFields(card))
    }

    var body: some View {
        Form {
            if card.hasImage || model.photos[card.id] != nil {
                Section {
                    Button { showingPhoto = true } label: {
                        CardThumbnail(photo: model.photos[card.id], hasImage: true).frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(tr("名刺の写真を大きく見る", "View the card photo", "Voir la photo de la carte"))
                }
            }
            quickActions
            CardFormSections(fields: $fields)
            if let error { Section { Text(error).foregroundStyle(.red) } }
            Section {
                Button(tr("この名刺を削除", "Delete this card", "Supprimer cette carte"), role: .destructive) { confirmingDeletion = true }
            }
        }
        .navigationTitle(card.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if fields != saved {
                ToolbarItem(placement: .confirmationAction) { Button(tr("保存", "Save", "Enregistrer")) { Task { await save() } } }
            }
        }
        .task { await model.photo(for: card) }
        .onDisappear { if fields != saved { Task { await save() } } }
        .confirmationDialog(tr("この名刺を削除しますか？", "Delete this business card?", "Supprimer cette carte de visite ?"), isPresented: $confirmingDeletion, titleVisibility: .visible) {
            Button(tr("削除する", "Delete", "Supprimer"), role: .destructive) { Task { await remove() } }
        }
        .sheet(isPresented: $showingPhoto) {
            if let photo = model.photos[card.id] {
                Image(uiImage: photo).resizable().scaledToFit().padding().presentationDragIndicator(.visible)
            }
        }
    }

    @ViewBuilder private var quickActions: some View {
        let mail = fields.email.trimmingCharacters(in: .whitespaces)
        let number = (fields.mobile.isEmpty ? fields.phone : fields.mobile).filter { $0.isNumber || $0 == "+" }
        if !mail.isEmpty || !number.isEmpty {
            Section {
                HStack(spacing: 10) {
                    if !mail.isEmpty, let url = URL(string: "mailto:\(mail)") {
                        Link(destination: url) { Label(tr("メール", "Email", "E-mail"), systemImage: "envelope").frame(maxWidth: .infinity) }
                            .buttonStyle(.bordered).tint(Color.cwBlue700)
                    }
                    if !number.isEmpty, let url = URL(string: "tel:\(number)") {
                        Link(destination: url) { Label(tr("電話", "Call", "Appeler"), systemImage: "phone").frame(maxWidth: .infinity) }
                            .buttonStyle(.bordered).tint(Color.cwBlue700)
                    }
                }
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())
        }
    }

    private func save() async {
        guard !fields.isEmpty else {
            error = tr("名前・会社・メール・電話・メモのどれかを入れてください。", "Fill in at least a name, company, email, phone or note.", "Remplissez au moins un nom, une entreprise, un e-mail, un téléphone ou une note.")
            return
        }
        do {
            let updated = try await model.api.updateCard(card.id, fields)
            model.replaced(updated)
            saved = fields
            error = nil
        } catch APIError.invalid(let issues) {
            error = issues.map(\.message).joined(separator: "\n")
        } catch {
            self.error = tr("保存できませんでした", "Could not save", "Impossible d'enregistrer")
        }
    }

    private func remove() async {
        do {
            try await model.api.deleteCard(card.id)
            model.removed(card.id)
            saved = fields
            dismiss()
        } catch {
            self.error = tr("削除できませんでした", "Could not delete", "Impossible de supprimer")
        }
    }
}
