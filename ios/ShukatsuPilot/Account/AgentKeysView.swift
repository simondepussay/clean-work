import SwiftUI

/// Compte → AIエージェント : relier son agent IA (Claude, ChatGPT…) à Clean Work par une clé MCP.
/// La clé n'est montrée qu'une fois ; 5 clés au plus, révocables d'un geste.
struct AgentKeysView: View {
    let api: APIClient
    @State private var keys: [AgentKey]?
    @State private var name = ""
    @State private var canWrite = true
    @State private var fresh: String?
    @State private var error: String?
    @State private var busy = false
    @State private var revoking: AgentKey?
    @State private var copied: String?

    var body: some View {
        List {
            Section {
                Text(tr("Claude や ChatGPT などのAIエージェントに、応募の追加や予定の登録を任せられます。こころと日記には触れず、何も削除できません。",
                        "Let an AI agent such as Claude or ChatGPT add applications or calendar items for you. It never touches Kokoro or your journal, and can't delete anything.",
                        "Confiez à un agent IA comme Claude ou ChatGPT l'ajout de candidatures ou d'événements. Il ne touche jamais à こころ ni au journal, et ne peut rien supprimer."))
                    .font(.subheadline).foregroundStyle(.secondary)
                if let url = URL(string: tr("https://cleanwork.simondepussay.com/faq.html#agents", "https://cleanwork.simondepussay.com/faq.html?lang=en#agents-en", "https://cleanwork.simondepussay.com/faq.html?lang=en#agents-en")) {
                    Link(tr("くわしく（よくある質問）", "Learn more (FAQ)", "En savoir plus (FAQ)"), destination: url)
                }
            }
            Section(tr("MCPサーバーのURL", "MCP server URL", "Adresse du serveur MCP")) {
                copyRow(api.mcpURL, id: "url")
            }
            if let fresh {
                Section {
                    copyRow(fresh, id: "key")
                    VStack(alignment: .leading, spacing: 6) {
                        Text(tr("Claude Code なら、このコマンドをターミナルに貼りつけるだけ", "With Claude Code, just paste this command into a terminal", "Avec Claude Code, collez simplement cette commande dans un terminal"))
                            .font(.caption.weight(.semibold)).foregroundStyle(Color.cwBlue800)
                        copyRow(api.claudeCommand(key: fresh), id: "command", label: tr("コマンドをコピー", "Copy command", "Copier la commande"))
                    }
                    Button(tr("保存しました", "I've saved it", "Je l'ai notée")) { self.fresh = nil }
                } header: {
                    Text(tr("新しいキー（一度しか表示されません）", "Your new key (shown only once)", "Votre nouvelle clé (affichée une seule fois)"))
                } footer: {
                    Text(tr("エージェントの設定で「Authorization: Bearer キー」として使ってください。パスワードと同じように、人に見せないでください。",
                            "Use it in your agent's settings as “Authorization: Bearer <key>”. Keep it private, like a password.",
                            "À utiliser dans les réglages de l'agent : « Authorization: Bearer <clé> ». Gardez-la secrète, comme un mot de passe."))
                }
            }
            Section(tr("キー", "Keys", "Clés")) {
                if keys == nil { ArcLoader(size: 24) }
                if let keys, keys.isEmpty {
                    Text(tr("まだキーはありません", "No keys yet", "Aucune clé pour l'instant")).foregroundStyle(.secondary)
                }
                ForEach(keys ?? []) { key in
                    VStack(alignment: .leading, spacing: 3) {
                        HStack {
                            Text(key.name).font(.body.weight(.semibold))
                            Text(key.canWrite ? tr("読む・書く", "Read & write", "Lecture et écriture") : tr("読むだけ", "Read only", "Lecture seule"))
                                .font(.caption2.weight(.semibold))
                                .padding(.horizontal, 7).padding(.vertical, 2)
                                .foregroundStyle(key.canWrite ? Color.cwBordeaux : Color.cwBlue800)
                                .background(key.canWrite ? Color.cwBordeaux50 : Color.cwBlue100, in: Capsule())
                        }
                        Text(key.lastUsedAt.map { tr("最終使用 \(day($0))", "Last used \(day($0))", "Utilisée le \(day($0))") } ?? tr("未使用", "Never used", "Jamais utilisée"))
                            .font(.caption).foregroundStyle(Color.cwMuted)
                    }
                    .swipeActions {
                        Button(tr("削除", "Revoke", "Révoquer"), role: .destructive) { revoking = key }
                    }
                }
            }
            Section {
                TextField(tr("キーの名前（例：Claude）", "Key name (e.g. Claude)", "Nom de la clé (ex. Claude)"), text: $name)
                Toggle(tr("書くことも許可する", "Allow writing", "Autoriser l'écriture"), isOn: $canWrite)
                Button(tr("キーを作る", "Create a key", "Créer une clé")) { Task { await create() } }
                    .disabled(busy || name.trimmingCharacters(in: .whitespaces).isEmpty)
            } footer: {
                if let error { Text(error).foregroundStyle(Color.cwBordeaux) }
            }
        }
        .navigationTitle(tr("AIエージェント", "AI agents", "Agents IA"))
        .cleanList()
        .task { await load() }
        .confirmationDialog(tr("このキーを削除しますか？使っているエージェントは、すぐに使えなくなります。", "Revoke this key? Agents using it lose access immediately.", "Révoquer cette clé ? Les agents qui l'utilisent perdent l'accès tout de suite."),
                            isPresented: Binding(get: { revoking != nil }, set: { if !$0 { revoking = nil } }), titleVisibility: .visible) {
            Button(tr("削除する", "Revoke", "Révoquer"), role: .destructive) {
                if let key = revoking { Task { try? await api.revokeAgentKey(key.id); await load() } }
            }
        }
    }

    private func copyRow(_ value: String, id: String, label: String? = nil) -> some View {
        Button {
            UIPasteboard.general.string = value
            copied = id
            Task { try? await Task.sleep(for: .seconds(1.5)); if copied == id { copied = nil } }
        } label: {
            HStack {
                Text(value).font(.system(.footnote, design: .monospaced)).foregroundStyle(Color.cwBlue950).lineLimit(label == nil ? 2 : 4).truncationMode(.middle)
                Spacer()
                Image(systemName: copied == id ? "checkmark" : "doc.on.doc").foregroundStyle(Color.cwBlue700)
            }
        }
        .accessibilityLabel(label ?? tr("コピー", "Copy", "Copier"))
    }

    private func day(_ iso: String) -> String {
        guard let date = ISO8601DateFormatter.withFractions.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else { return "" }
        return date.formatted(date: .abbreviated, time: .omitted)
    }

    private func load() async {
        keys = (try? await api.agentKeys()) ?? []
    }

    private func create() async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            if let created = try await api.createAgentKey(name: name.trimmingCharacters(in: .whitespaces), scope: canWrite ? "write" : "read") {
                fresh = created.key
                name = ""
                await load()
            } else {
                error = tr("キーは5つまでです。使っていないキーを削除してください。", "You can have up to 5 keys. Revoke one you no longer use.", "5 clés au maximum. Révoquez une clé que vous n'utilisez plus.")
            }
        } catch {
            self.error = tr("キーを作れませんでした。もう一度お試しください。", "Couldn't create the key. Please try again.", "Impossible de créer la clé. Réessayez.")
        }
    }
}
