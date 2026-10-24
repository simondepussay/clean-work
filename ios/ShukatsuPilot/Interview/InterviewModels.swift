import Foundation

/// Étapes d'entretien proposées pour l'entraînement (S17–S19), mêmes codes que l'API.
enum InterviewStage: String, Codable, CaseIterable, Identifiable {
    case interview1, interview2, final
    var id: String { rawValue }
    var ja: String {
        switch self { case .interview1: "一次面接"; case .interview2: "二次面接"; case .final: "最終面接" }
    }
    var en: String {
        switch self { case .interview1: "1st interview"; case .interview2: "2nd interview"; case .final: "Final interview" }
    }
    /// Dans la langue choisie.
    var name: String {
        switch self {
        case .interview1: tr("一次面接", "1st interview", "1er entretien")
        case .interview2: tr("二次面接", "2nd interview", "2e entretien")
        case .final: tr("最終面接", "Final interview", "Entretien final")
        }
    }

    /// L'étape qui suit le statut actuel de la candidature (même règle que le web).
    static func suggested(for app: JobApplication?) -> InterviewStage {
        switch app?.status {
        case "interview2": .interview2
        case "final", "offer": .final
        default: .interview1
        }
    }
}

struct InterviewFeedback: Codable, Equatable {
    struct Expression: Codable, Equatable { let quote: String; let suggestion: String }
    let score: Int
    let comment: String
    let improvements: [String]
    let expressions: [Expression]
}

struct InterviewTurn: Codable, Equatable {
    let question: String
    let intent: String
    let kind: String
    var answer: String?
    var durationSec: Int?
    var spoken: Bool?
    var feedback: InterviewFeedback?

    var isFollowUp: Bool { kind == "followUp" }
}

struct InterviewSummary: Codable, Equatable {
    let score: Int
    let summary: String
    let strengths: [String]
    let improvements: [String]
}

struct Interview: Codable, Equatable, Identifiable {
    let id: String
    let applicationId: String?
    let company: String?
    let stage: InterviewStage
    let language: String
    let status: String
    let turns: [InterviewTurn]
    let summary: InterviewSummary?
    let createdAt: String

    var isFinished: Bool { status == "finished" }
    /// Prochaine question sans réponse, nil quand tout est répondu.
    var currentIndex: Int? { turns.firstIndex { $0.answer == nil } }
    var answeredCount: Int { turns.filter { $0.answer != nil }.count }
}

struct InterviewListItem: Codable, Equatable, Identifiable {
    let id: String
    let company: String?
    let stage: InterviewStage
    let status: String
    let score: Int?
    let createdAt: String
}

/// Un refus de l'API qui n'est pas une panne réseau : on l'explique à l'utilisateur.
enum InterviewRefusal: Error, Equatable {
    case limit(reason: String, retryAfter: Date?)
    case invalid
    case finished
    case notFound
    case notConfigured
    case failed

    var message: String {
        switch self {
        case .limit(let reason, let date):
            let day = date.map { $0.formatted(date: .abbreviated, time: .omitted) } ?? ""
            return reason == "budget"
                ? "今月のAI機能は終了しました（\(day)から再開）/ AI features are paused until \(day)"
                : "面接練習の回数の上限です（\(day)から）/ Practice limit reached, available again on \(day)"
        case .invalid: return "回答を入力してください / Write or say your answer"
        case .finished: return "この面接は終了しています / This interview is over"
        case .notFound: return "見つかりません / Not found"
        case .notConfigured: return "面接練習は準備中です / Interview practice is not available yet"
        case .failed: return "AIが応答しませんでした。もう一度試してください（回数は使われていません）/ The AI did not respond; try again (not counted)"
        }
    }
}
