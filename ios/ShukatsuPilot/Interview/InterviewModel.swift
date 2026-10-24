import Foundation
import Observation

/// État de l'écran d'entraînement aux entretiens (S17–S19) : préparation, séance, bilan.
@MainActor
@Observable
final class InterviewModel {
    private(set) var applications: [JobApplication] = []
    private(set) var history: [InterviewListItem] = []
    private(set) var usage: Usage?
    private(set) var session: Interview?
    private(set) var busy = false
    private(set) var message: String?
    /// Index de la réponse dont on regarde l'avis, avant de passer à la question suivante.
    private(set) var reviewing: Int?

    var applicationId: String? {
        didSet { stage = .suggested(for: applications.first { $0.id == applicationId }) }
    }
    var stage: InterviewStage = .interview1
    /// Langue des explications : celle du globe de l'en-tête.
    var language: HelpLanguage { HelpLanguage.saved }

    let api: APIClient

    /// Entretien prévu de la candidature (« 一次面接 du 29/10 ») : la séance y est rattachée.
    var stepId: String?

    init(api: APIClient, applicationId: String? = nil, stepId: String? = nil) {
        self.api = api
        self.applicationId = applicationId
        self.stepId = stepId
    }

    /// Les entretiens prévus dans les candidatures, le plus proche d'abord (pour « どの面接？ »).
    var scheduled: [(app: JobApplication, step: JobApplication.Step)] {
        let today = ISO8601DateFormatter.dayOnly.string(from: .now)
        return applications
            .filter { !["rejected", "withdrawn"].contains($0.status) }
            .flatMap { app in app.steps.filter { ["interview1", "interview2", "final"].contains($0.type) && !$0.done && ($0.dueDate ?? "") >= today }.map { (app, $0) } }
            .sorted { ($0.step.dueDate ?? "") < ($1.step.dueDate ?? "") }
    }

    var selectedApplication: JobApplication? { applications.first { $0.id == applicationId } }

    /// La question affichée : celle dont on lit l'avis, sinon la prochaine sans réponse.
    var shownIndex: Int? { reviewing ?? session?.currentIndex }

    func load() async {
        async let apps = try? api.applications()
        async let list = try? api.interviews()
        async let left = try? api.interviewUsage()
        applications = await apps ?? []
        history = await list ?? []
        usage = await left
        // Présélection venue d'une candidature : l'étape suit son statut, une fois la liste chargée.
        if applicationId != nil { stage = .suggested(for: selectedApplication) }
        // Par défaut (une seule fois) : l'entretien prévu le plus proche.
        if !defaulted {
            defaulted = true
            if stepId == nil, applicationId == nil { stepId = scheduled.first?.step.id }
        }
    }

    private var defaulted = false

    private func run(_ call: () async throws -> Result<Interview, InterviewRefusal>) async -> Bool {
        busy = true
        message = nil
        defer { busy = false }
        do {
            switch try await call() {
            case .success(let interview):
                session = interview
                return true
            case .failure(let refusal):
                message = refusal.message
            }
        } catch {
            message = InterviewRefusal.failed.message
        }
        return false
    }

    func start() async {
        reviewing = nil
        // Un entretien prévu fixe l'étape ; sinon, l'entreprise et l'étape choisies à la main.
        let step = scheduled.first { $0.step.id == stepId }
        let stage = step.flatMap { InterviewStage(rawValue: $0.step.type) } ?? self.stage
        await run { try await api.startInterview(applicationId: step?.app.id ?? applicationId, stepId: step?.step.id, stage: stage, language: language) }
    }

    @discardableResult
    func answer(_ text: String, durationSec: Int?, spoken: Bool) async -> Bool {
        guard let session, let index = session.currentIndex else { return false }
        let ok = await run { try await api.answerInterview(session.id, answer: text, durationSec: spoken ? durationSec : nil, spoken: spoken) }
        if ok { reviewing = index }
        return ok
    }

    func next() { reviewing = nil }

    func finish() async {
        guard let session else { return }
        if await run({ try await api.finishInterview(session.id) }) { reviewing = nil }
    }

    func open(_ id: String) async {
        reviewing = nil
        session = try? await api.interview(id)
    }

    func close() async {
        session = nil
        reviewing = nil
        message = nil
        await load()
    }

    func delete(_ id: String) async {
        try? await api.deleteInterview(id)
        history.removeAll { $0.id == id }
    }
}
