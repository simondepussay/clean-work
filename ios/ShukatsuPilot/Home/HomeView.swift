import SwiftUI

/// Accueil une fois connecté (S02). Le contenu (profil, candidatures) arrive avec S05 et S07.
struct HomeView: View {
    @Environment(AppModel.self) private var model
    @State private var confirmingDeletion = false
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
            if let api = model.apiClient {
                Section {
                    NavigationLink {
                        ProfileView(model: ProfileModel(api: api), onSaved: { await model.refreshMe() })
                    } label: {
                        Label("プロフィール / Profile", systemImage: "person.text.rectangle")
                    }
                }
            }
            Section {
                Button("サインアウト / Sign out") { model.signOut() }
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
        .task { await model.refreshMe() }
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
