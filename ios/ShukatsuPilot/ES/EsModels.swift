import Foundation

/// Une ES (S13), au format de l'API.
struct Draft: Codable, Equatable, Identifiable {
    var id: String
    var kind: String
    var applicationId: String?
    var company: String?
    var industry: String?
    var question: String
    var charLimit: Int?
    var body: String
    var updatedAt: String
}

/// Ce qu'on envoie pour créer ou modifier une ES (champs vides = absents).
struct DraftInput: Encodable, Equatable {
    var kind = "free"
    /// Candidature reliée ; nil = ES commune (envoyé comme null pour délier).
    var applicationId: String?
    var company: String?
    /// Secteur visé par une ES commune (un 自己PR resservi dans tout un secteur) ; nil = aucun.
    var industry: String?
    var question = ""
    var charLimit: Int?
    var body = ""

    init(kind: String = "free", company: String? = nil, question: String = "", charLimit: Int? = nil, body: String = "") {
        self.kind = kind; self.company = company; self.question = question; self.charLimit = charLimit; self.body = body
    }

    init(_ draft: Draft) {
        self.init(kind: draft.kind, company: draft.company, question: draft.question, charLimit: draft.charLimit, body: draft.body)
        applicationId = draft.applicationId
        industry = draft.industry
    }

    private enum CodingKeys: String, CodingKey { case kind, applicationId, company, industry, question, charLimit, body }

    /// Comme l'encodage automatique, sauf applicationId et industry : toujours écrits, null quand
    /// ils sont vides (l'encodage automatique les omettrait, et l'ancienne valeur resterait sur le serveur).
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(kind, forKey: .kind)
        try c.encode(applicationId, forKey: .applicationId)
        try c.encodeIfPresent(company, forKey: .company)
        try c.encode(industry, forKey: .industry)
        try c.encode(question, forKey: .question)
        try c.encodeIfPresent(charLimit, forKey: .charLimit)
        try c.encode(body, forKey: .body)
    }
}

/// Une relecture par IA (S14), avec le texte relu (S15).
struct Review: Codable, Equatable, Identifiable {
    struct Issue: Codable, Equatable {
        let category: String
        let quote: String
        let problem: String
        let suggestion: String
    }
    let id: String
    let createdAt: String
    let bodySnapshot: String
    let score: Int
    let summary: String
    let strengths: [String]
    let issues: [Issue]
}

/// Relectures restantes (S16).
struct Usage: Codable, Equatable {
    let today: Int
    let month: Int
}

/// Pourquoi une relecture n'a pas eu lieu.
enum ReviewRefusal: Error, Equatable {
    case limit(reason: String, retryAfter: Date?)
    case emptyBody
    case notConfigured
    case failed
}

/// Nombre de caractères d'une ES, comme le comptent les entreprises : tous les caractères
/// visibles, sans les retours à la ligne. `String.count` compte déjà les graphèmes :
/// un emoji composé ou une lettre accentuée combinée compte pour un.
func charCount(_ text: String) -> Int {
    text.filter { !$0.isNewline }.count
}
