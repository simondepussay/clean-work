import SwiftUI

/// Page « compte » (icône en haut à droite) : le compte, le profil du 履歴書, sortie et suppression.
struct AccountView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var confirmingDeletion = false
    @State private var deleting = false
    @State private var deletionFailed = false

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 4) {
                    Text(model.displayName ?? model.email ?? "").font(.title3.bold()).foregroundStyle(Color.cwBlue800)
                    if let email = model.email { Text(email).foregroundStyle(.secondary) }
                }
                profileStatus
            }
            if let api = model.apiClient {
                Section {
                    NavigationLink {
                        ProfileView(model: ProfileModel(api: api), onSaved: { await model.refreshMe() })
                    } label: {
                        Label(tr("プロフィール", "Profile", "Profil"), systemImage: "person.text.rectangle")
                    }
                }
            }
            Section {
                Button(tr("サインアウト", "Sign out", "Se déconnecter")) {
                    dismiss()
                    Task { await model.signOut() }
                }
            } footer: {
                LegalLinks()
            }
            Section {
                Button(tr("アカウント削除", "Delete account", "Supprimer le compte"), role: .destructive) { confirmingDeletion = true }
                    .disabled(deleting)
            } footer: {
                if deletionFailed {
                    Text(tr("削除できませんでした", "Could not delete the account", "Impossible de supprimer le compte")).foregroundStyle(.red)
                }
            }
        }
        .navigationTitle(tr("アカウント", "Account", "Compte"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { Button(tr("閉じる", "Close", "Fermer")) { dismiss() } }
        }
        .task { await model.refreshMe() }
        .confirmationDialog(Self.deletionWarning, isPresented: $confirmingDeletion, titleVisibility: .visible) {
            Button(tr("削除する", "Delete", "Supprimer"), role: .destructive) {
                deleting = true
                Task {
                    do { try await model.deleteAccount() } catch { deletionFailed = true }
                    deleting = false
                }
            }
        }
    }

    static var deletionWarning: String {
        let days = AppConfig.retentionDays, email = AppConfig.supportEmail
        return tr(
            "データはすぐに見えなくなり、\(days)日後に完全に削除されます。\(days)日以内なら \(email) に連絡すると復元できます。",
            "Your data disappears immediately and is permanently deleted after \(days) days. Within \(days) days, you can ask \(email) to restore it.",
            "Vos données disparaissent tout de suite et sont effacées définitivement après \(days) jours. Pendant \(days) jours, vous pouvez demander leur restauration à \(email)."
        )
    }

    @ViewBuilder private var profileStatus: some View {
        switch model.me {
        case .idle, .loading:
            ArcLoader(size: 24)
        case .loaded(let me):
            Label(me.hasProfile ? tr("プロフィール登録済み", "Profile saved", "Profil enregistré") : tr("プロフィール未登録", "No profile yet", "Pas encore de profil"),
                  systemImage: me.hasProfile ? "checkmark.circle" : "person.crop.circle.badge.plus")
        case .failed:
            Label(tr("API エラー", "API error", "Erreur de l'API"), systemImage: "exclamationmark.triangle").foregroundStyle(.orange)
        }
    }
}
