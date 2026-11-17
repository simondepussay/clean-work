import Foundation

/// Bloc-notes de l'accueil (GET / PUT /api/notes).
struct Notes: Codable, Equatable {
    var text: String
    var updatedAt: String?
}

/// Une clé pour agent IA (serveur MCP). Le secret n'est renvoyé qu'à la création.
struct AgentKey: Decodable, Identifiable, Equatable {
    let id: String
    let name: String
    let scope: String
    let createdAt: String
    let lastUsedAt: String?
    var canWrite: Bool { scope == "write" }
}

struct CreatedAgentKey: Decodable {
    let key: String
    let info: AgentKey
}

extension APIClient {
    func notes() async throws -> Notes {
        try JSONDecoder().decode(Notes.self, from: try await sendRaw("GET", "api/notes"))
    }

    @discardableResult
    func saveNotes(_ text: String) async throws -> Notes {
        try JSONDecoder().decode(Notes.self, from: try await sendRaw("PUT", "api/notes", body: try JSONEncoder().encode(["text": text])))
    }

    func agentKeys() async throws -> [AgentKey] {
        try JSONDecoder().decode([AgentKey].self, from: try await sendRaw("GET", "api/agent-keys"))
    }

    /// nil : 5 clés déjà (409).
    func createAgentKey(name: String, scope: String) async throws -> CreatedAgentKey? {
        let (data, status) = try await sendUnchecked("POST", "api/agent-keys", body: try JSONEncoder().encode(["name": name, "scope": scope]))
        if status == 409 { return nil }
        guard (200..<300).contains(status) else { throw APIError.server(status: status) }
        return try JSONDecoder().decode(CreatedAgentKey.self, from: data)
    }

    func revokeAgentKey(_ id: String) async throws {
        try await sendRaw("DELETE", "api/agent-keys/\(id)")
    }

    /// Adresse du serveur MCP, à donner à l'agent IA.
    var mcpURL: String { baseURL.appending(path: "api/mcp").absoluteString }

    /// La commande à coller dans un terminal pour relier Claude Code.
    func claudeCommand(key: String) -> String {
        "claude mcp add --transport http clean-work \(mcpURL) --header \"Authorization: Bearer \(key)\""
    }
}
