import Foundation
import Observation

/// Liste des ES, guide et langue de l'aide (écran « ES »).
@MainActor
@Observable
final class EsModel {
    private(set) var drafts: [Draft]?
    private(set) var guide: Guide?
    /// Candidatures, pour relier une ES à une entreprise.
    private(set) var applications: [JobApplication] = []
    /// Langue de l'aide : celle du globe de l'en-tête.
    var language: HelpLanguage { HelpLanguage.saved }

    let api: APIClient
    private let guideURL: URL?
    private let session: URLSession

    init(api: APIClient, guideURL: URL?, session: URLSession = .shared) {
        self.api = api
        self.guideURL = guideURL
        self.session = session
    }

    func load() async {
        async let list = try? api.drafts()
        async let guide = loadGuide()
        async let apps = try? api.applications()
        drafts = await list ?? []
        self.guide = await guide
        applications = await apps ?? []
    }

    private func loadGuide() async -> Guide? {
        guard let guideURL, let (data, _) = try? await session.data(from: guideURL) else { return nil }
        return try? JSONDecoder().decode(Guide.self, from: data)
    }

    func saved(_ draft: Draft) {
        drafts = [draft] + (drafts ?? []).filter { $0.id != draft.id }
    }

    func delete(_ draft: Draft) async {
        guard (try? await api.deleteDraft(draft.id)) != nil else { return }
        drafts?.removeAll { $0.id == draft.id }
    }
}

/// Une ES ouverte : saisie, enregistrement, relecture IA et historique.
@MainActor
@Observable
final class EsEditorModel {
    enum Status: Equatable { case idle, saving, saved, failed }

    var input: DraftInput {
        didSet { if status == .saved && input != oldValue { status = .idle } }
    }
    private(set) var draftId: String?
    /// Dernière version acceptée par le serveur (ou celle de départ) : ce qui serait perdu en quittant.
    private(set) var savedInput: DraftInput
    var hasChanges: Bool { input != savedInput }
    private(set) var status: Status = .idle
    private(set) var issues: [Issue] = []
    private(set) var history: [Review] = []
    var shown = 0
    private(set) var usage: Usage?
    private(set) var reviewing = false
    private(set) var refusal: ReviewRefusal?

    private let api: APIClient
    private let onSaved: (Draft) -> Void

    init(api: APIClient, draft: Draft?, input: DraftInput? = nil, onSaved: @escaping (Draft) -> Void = { _ in }) {
        self.api = api
        self.draftId = draft?.id
        let start = input ?? draft.map(DraftInput.init) ?? DraftInput()
        self.input = start
        // Nouvelle ES vide : rien à perdre tant qu'on n'écrit rien. Une copie (« 別パターン ») a
        // déjà un texte qui n'est enregistré nulle part : la quitter le perdrait.
        self.savedInput = draft != nil || start.body.isEmpty ? start : DraftInput()
        self.onSaved = onSaved
        if draft != nil { status = .saved }
    }

    var review: Review? { history.indices.contains(shown) ? history[shown] : nil }
    var count: Int { charCount(input.body) }
    var isOver: Bool { input.charLimit.map { count > $0 } ?? false }
    func error(_ path: String) -> String? { issues.first { $0.path == path }.map { apiMessage($0.message) } }

    func load() async {
        usage = try? await api.usage()
        if let draftId { history = (try? await api.reviews(of: draftId)) ?? [] }
    }

    /// Candidatures connues : l'ES est reliée à celle dont le nom d'entreprise correspond.
    var applications: [JobApplication] = []

    var linkedApplication: JobApplication? {
        let name = input.company?.trimmingCharacters(in: .whitespaces) ?? ""
        return name.isEmpty ? nil : applications.first { $0.company == name }
    }

    /// Enregistre ; renvoie l'id, ou nil si l'API a refusé.
    @discardableResult
    func save() async -> String? {
        status = .saving
        input.applicationId = linkedApplication?.id
        // Ce qui part au serveur : un texte modifié pendant l'envoi (collage, frappe sur un réseau
        // lent) n'est pas enregistré, et ne doit donc pas s'afficher « 保存済み ».
        let sent = input
        do {
            let draft: Draft
            if let draftId {
                draft = try await api.updateDraft(draftId, sent)
            } else {
                draft = try await api.createDraft(sent)
            }
            draftId = draft.id
            issues = []
            savedInput = sent
            status = input == sent ? .saved : .idle
            onSaved(draft)
            return draft.id
        } catch APIError.invalid(let found) {
            issues = found
            status = .idle
        } catch {
            status = .failed
        }
        return nil
    }

    func runReview(language: HelpLanguage) async {
        reviewing = true
        refusal = nil
        defer { reviewing = false }
        let id = status == .saved ? draftId : await save()
        guard let id else { return }
        do {
            switch try await api.review(id, language: language) {
            case .success(let review):
                history.insert(review, at: 0)
                shown = 0
            case .failure(let why):
                refusal = why
            }
        } catch {
            refusal = .failed
        }
        usage = try? await api.usage()
    }

    enum IssueState: Equatable {
        case applied, open, gone
        /// Conseil seul : la proposition contient un trou à remplir ou une consigne, rien à appliquer.
        case advice
        /// Une autre remarque sur la même phrase est appliquée : on peut remplacer sa correction par celle-ci.
        case alternative(current: String)
    }

    /// Où en est une remarque par rapport au texte actuel : correction déjà dans le texte,
    /// passage encore à corriger, autre proposition appliquée sur la même phrase,
    /// ou ni l'un ni l'autre (le texte a changé depuis la relecture).
    func state(of issue: Review.Issue) -> IssueState {
        // En premier : une proposition identique au passage serait sinon toujours « déjà appliquée ».
        if Self.isAdvice(issue) { return .advice }
        if Self.has(issue.suggestion, in: input.body) { return .applied }
        if Self.has(issue.quote, in: input.body) { return .open }
        if let other = review?.issues.first(where: { $0 != issue && !Self.isAdvice($0) && Self.squeezed($0.quote) == Self.squeezed(issue.quote) && Self.has($0.suggestion, in: input.body) }) {
            return .alternative(current: other.suggestion)
        }
        return .gone
    }

    /// Applique la correction : remplace le passage cité, ou la proposition déjà appliquée sur la même phrase.
    func apply(_ index: Int) {
        guard let issue = review?.issues[index] else { return }
        let from: String
        switch state(of: issue) {
        case .open: from = issue.quote
        case .alternative(let current): from = current
        default: return
        }
        guard let range = Self.locate(from, in: input.body) else { return }
        input.body.replaceSubrange(range, with: issue.suggestion)
    }

    private static func squeezed(_ s: String) -> String { s.filter { !$0.isWhitespace } }

    /// Trou (« ○○ », « （数値を記入） », « （例：…） ») ou consigne (« 〜を明記します ») : pas une phrase
    /// prête à coller. Le serveur les remplace déjà par le passage lui-même ; ce test sert aux
    /// relectures enregistrées avant ce changement.
    private static let placeholder = /[○〇◯□＿_]{2}|[ＸX]{2}|記入|[（(]例[:：）)]|書き加え|書き足し|明記し|入れてください|書いてください|加えてください|追加してください|具体的に書/

    static func isAdvice(_ issue: Review.Issue) -> Bool {
        squeezed(issue.suggestion) == squeezed(issue.quote) || issue.suggestion.contains(placeholder)
    }

    private static func has(_ passage: String, in body: String) -> Bool {
        !passage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && locate(passage, in: body) != nil
    }

    /// Le passage tel quel, sinon le même en ignorant les espaces et retours à la ligne
    /// (l'IA en recopie parfois un de plus ou de moins).
    static func locate(_ passage: String, in body: String) -> Range<String.Index>? {
        if !passage.isEmpty, let range = body.range(of: passage, options: .literal) { return range }
        let chars = passage.filter { !$0.isWhitespace }
        guard !chars.isEmpty else { return nil }
        let pattern = chars.map { NSRegularExpression.escapedPattern(for: String($0)) }.joined(separator: "\\s*")
        return body.range(of: pattern, options: .regularExpression)
    }

    func show(_ index: Int) {
        shown = index
    }
}
