import SwiftUI

/// Bloc-notes libre, en bas de l'accueil (même texte que sur le site). Enregistré tout seul après la frappe.
/// Un agent IA relié au compte peut y ajouter des lignes, jamais en effacer.
struct NotesCard: View {
    let api: APIClient
    @State private var text = ""
    @State private var loaded = false
    @State private var status: Status = .idle
    @State private var saveTask: Task<Void, Never>?
    @FocusState private var focused: Bool

    enum Status { case idle, saving, saved, failed }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Label(tr("メモ帳", "Notepad", "Bloc-notes"), systemImage: "note.text").font(.headline).foregroundStyle(Color.cwBlue800)
                Spacer()
                Text(statusText).font(.caption).foregroundStyle(status == .failed ? Color.cwBordeaux : Color.cwMuted)
            }
            ZStack(alignment: .topLeading) {
                if text.isEmpty && !focused {
                    Text(tr("自己PRのアイデア、説明会で聞きたいこと、あとで調べること…", "Self-PR ideas, questions for the info session, things to look up…", "Idées de 自己PR, questions pour le 説明会, choses à vérifier…"))
                        .font(.subheadline).foregroundStyle(Color.cwMuted.opacity(0.8))
                        .padding(.horizontal, 5).padding(.vertical, 8)
                        .allowsHitTesting(false)
                }
                TextEditor(text: $text)
                    .font(.subheadline)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 150)
                    .focused($focused)
                    .disabled(!loaded)
                    .accessibilityLabel(tr("メモ帳", "Notepad", "Bloc-notes"))
            }
            .padding(6)
            .background(Color.white, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(focused ? Color.cwBlue500 : Color.cwLine))
            Text(tr("自動で保存されます", "Saved automatically", "Enregistré automatiquement")).font(.caption2).foregroundStyle(Color.cwMuted)
        }
        .task {
            if let notes = try? await api.notes() { text = notes.text }
            loaded = true
        }
        .onChange(of: text) { _, new in
            guard loaded else { return }
            status = .idle
            saveTask?.cancel()
            saveTask = Task {
                try? await Task.sleep(for: .milliseconds(900))
                guard !Task.isCancelled else { return }
                await save(new)
            }
        }
        .onChange(of: focused) { _, isFocused in
            // Clavier fermé : on enregistre tout de suite ce qui attendait.
            if !isFocused, let pending = saveTask { pending.cancel(); saveTask = nil; Task { await save(text) } }
        }
        .onDisappear { if saveTask != nil { saveTask?.cancel(); let t = text; Task { await save(t) } } }
    }

    private var statusText: String {
        switch status {
        case .idle: ""
        case .saving: tr("保存中…", "Saving…", "Enregistrement…")
        case .saved: tr("保存しました", "Saved", "Enregistré")
        case .failed: tr("保存できませんでした", "Couldn't save", "Échec de l'enregistrement")
        }
    }

    private func save(_ value: String) async {
        status = .saving
        do { try await api.saveNotes(value); status = .saved } catch { status = .failed }
        saveTask = nil
    }
}
