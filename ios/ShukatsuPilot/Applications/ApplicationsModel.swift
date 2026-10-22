import Foundation
import Observation

/// Liste des candidatures, groupées par étape (S08).
@MainActor
@Observable
final class ApplicationsModel {
    private(set) var applications: [JobApplication]?
    private(set) var failed = false
    let api: APIClient

    init(api: APIClient) { self.api = api }

    func load() async {
        applications = (try? await api.applications()) ?? []
        await DeadlineReminderScheduler.shared.reschedule(applications ?? [])
    }

    /// Sections non vides, dans l'ordre du parcours ; refus et désistements à la fin.
    var sections: [(stage: SelectionStage.Stage, items: [JobApplication])] {
        SelectionStage.all.compactMap { stage in
            let items = (applications ?? []).filter { $0.status == stage.id }
            return items.isEmpty ? nil : (stage, items)
        }
    }

    func move(_ app: JobApplication, to status: String) async {
        failed = false
        do {
            replace(try await api.moveApplication(app.id, to: status))
            await DeadlineReminderScheduler.shared.reschedule(applications ?? [])
        } catch {
            failed = true
        }
    }

    func saved(_ app: JobApplication) {
        replace(app)
        Task { await DeadlineReminderScheduler.shared.reschedule(applications ?? []) }
    }

    func delete(_ app: JobApplication) async {
        guard (try? await api.deleteApplication(app.id)) != nil else { failed = true; return }
        applications?.removeAll { $0.id == app.id }
        await DeadlineReminderScheduler.shared.reschedule(applications ?? [])
    }

    private func replace(_ app: JobApplication) {
        var all = (applications ?? []).filter { $0.id != app.id }
        all.append(app)
        applications = all.sorted { ($0.nextDeadline ?? "9999", $0.company) < ($1.nextDeadline ?? "9999", $1.company) }
    }
}
