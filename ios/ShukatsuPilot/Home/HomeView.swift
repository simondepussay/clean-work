import SwiftUI

/// Accueil une fois connecté (S02). Le contenu (profil, candidatures) arrive avec S05 et S07.
struct HomeView: View {
    @Environment(AppModel.self) private var model
    @State private var confirmingDeletion = false
    @State private var upcoming: [Deadline] = []
    @State private var deleting = false
    @State private var deletionFailed = false

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 4) {
                    Text("ようこそ、\(model.displayName ?? model.email ?? "")")
                        .font(.title2.bold())
                    if let email = model.email { Text(email).foregroundStyle(.secondary) }
                }
                profileStatus
            }
            if !upcoming.isEmpty {
                Section("近い締切 / Upcoming deadlines") {
                    ForEach(upcoming.prefix(5), id: \.stepId) { d in
                        HStack {
                            Text(SelectionStage.deadlineLabel(d.days))
                                .font(.caption.weight(d.days <= 3 ? .bold : .regular))
                                .foregroundStyle(d.days <= 3 ? .red : .secondary)
                                .frame(width: 120, alignment: .leading)
                            Text("\(d.company)　\(Deadlines.stepName(d.step))")
                        }
                    }
                }
            }
            if let api = model.apiClient {
                Section {
                    NavigationLink {
                        ProfileView(model: ProfileModel(api: api), onSaved: { await model.refreshMe() })
                    } label: {
                        Label("プロフィール / Profile", systemImage: "person.text.rectangle")
                    }
                    NavigationLink {
                        ApplicationsView(model: ApplicationsModel(api: api))
                    } label: {
                        Label("応募 / Applications", systemImage: "rectangle.split.3x1")
                    }
                    NavigationLink {
                        ResumeView(api: api)
                    } label: {
                        Label("応募書類PDF / Application documents", systemImage: "doc.richtext")
                    }
                    NavigationLink {
                        EsListView(model: EsModel(api: api, guideURL: AppConfig.apiBaseURL?.appending(path: "es-guide.json")))
                    } label: {
                        Label("ES・AI添削 / Entry sheets", systemImage: "doc.text.magnifyingglass")
                    }
                    NavigationLink {
                        InterviewView(model: InterviewModel(api: api))
                    } label: {
                        Label("面接練習 / Interview practice", systemImage: "mic.badge.plus")
                    }
                }
            }
            Section {
                Button("サインアウト / Sign out") { Task { await model.signOut() } }
            } footer: {
                LegalLinks()
            }
            Section {
                Button("アカウント削除 / Delete account", role: .destructive) { confirmingDeletion = true }
                    .disabled(deleting)
            } footer: {
                if deletionFailed { Text("削除できませんでした / Could not delete the account").foregroundStyle(.red) }
            }
        }
        .confirmationDialog(Self.deletionWarning, isPresented: $confirmingDeletion, titleVisibility: .visible) {
            Button("削除する / Delete", role: .destructive) {
                deleting = true
                Task {
                    do { try await model.deleteAccount() } catch { deletionFailed = true }
                    deleting = false
                }
            }
        }
        .navigationTitle("就活パイロット")
        .refreshable { await model.refreshMe() }
        .task {
            await model.refreshMe()
            await loadDeadlines()
        }
    }

    /// Échéances des 14 prochains jours, et rappels reprogrammés à chaque ouverture de l'accueil.
    private func loadDeadlines() async {
        guard let api = model.apiClient, let apps = try? await api.applications() else { return }
        upcoming = Deadlines.upcoming(apps, within: 14)
        await DeadlineReminderScheduler.shared.reschedule(apps)
    }

    static var deletionWarning: String {
        let days = AppConfig.retentionDays, email = AppConfig.supportEmail
        return "データはすぐに見えなくなり、\(days)日後に完全に削除されます。\(days)日以内なら \(email) に連絡すると復元できます。\n\n"
            + "Your data disappears immediately and is permanently deleted after \(days) days. "
            + "Within \(days) days, you can ask \(email) to restore it."
    }

    @ViewBuilder private var profileStatus: some View {
        switch model.me {
        case .idle, .loading:
            ProgressView()
        case .loaded(let me):
            Label(me.hasProfile ? "プロフィール登録済み / Profile saved" : "プロフィール未登録 / No profile yet",
                  systemImage: me.hasProfile ? "checkmark.circle" : "person.crop.circle.badge.plus")
        case .failed:
            Label("API エラー / API error", systemImage: "exclamationmark.triangle")
                .foregroundStyle(.orange)
        }
    }
}
