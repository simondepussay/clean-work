import Foundation
import Observation

/// Liste des ES, guide et langue de l'aide (écran « ES »).
@MainActor
@Observable
final class EsModel {
    private(set) var drafts: [Draft]?
    private(set) var guide: Guide?
    var language: HelpLanguage = HelpLanguage.saved {
        didSet { UserDefaults.standard.set(language.rawValue, forKey: HelpLanguage.storageKey) }
    }

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
        drafts = await list ?? []
        self.guide = await guide
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
    private(set) var status: Status = .idle
    private(set) var issues: [Issue] = []
    private(set) var history: [Review] = []
    var shown = 0
    private(set) var usage: Usage?
    private(set) var reviewing = false
    private(set) var refusal: ReviewRefusal?
    private(set) var applied: Set<Int> = []

    private let api: APIClient
    private let onSaved: (Draft) -> Void

    init(api: APIClient, draft: Draft?, input: DraftInput? = nil, onSaved: @escaping (Draft) -> Void = { _ in }) {
        self.api = api
        self.draftId = draft?.id
        self.input = input ?? draft.map(DraftInput.init) ?? DraftInput()
        self.onSaved = onSaved
        if draft != nil { status = .saved }
    }

    var review: Review? { history.indices.contains(shown) ? history[shown] : nil }
    var count: Int { charCount(input.body) }
    var isOver: Bool { input.charLimit.map { count > $0 } ?? false }
    func error(_ path: String) -> String? { issues.first { $0.path == path }?.message }

    func load() async {
        usage = try? await api.usage()
        if let draftId { history = (try? await api.reviews(of: draftId)) ?? [] }
    }

    /// Enregistre ; renvoie l'id, ou nil si l'API a refusé.
    @discardableResult
    func save() async -> String? {
        status = .saving
        do {
            let draft: Draft
            if let draftId {
                draft = try await api.updateDraft(draftId, input)
            } else {
                draft = try await api.createDraft(input)
            }
            draftId = draft.id
            issues = []
            status = .saved
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
                applied = []
            case .failure(let why):
                refusal = why
            }
        } catch {
            refusal = .failed
        }
        usage = try? await api.usage()
    }

    /// Remplace le passage cité par la correction proposée (première occurrence).
    func apply(_ index: Int) {
        guard let issue = review?.issues[index], let range = input.body.range(of: issue.quote) else { return }
        input.body.replaceSubrange(range, with: issue.suggestion)
        applied.insert(index)
    }

    func show(_ index: Int) {
        shown = index
        applied = []
    }
}
