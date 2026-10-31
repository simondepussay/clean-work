import Foundation
import Observation

/// Onglet « こころ » : mêmes données et même règle de soutien que le site (calculée par l'API).
/// Ces données restent privées et ne sont jamais envoyées à l'IA.
struct Kokoro: Codable, Equatable {
    struct Mood: Codable, Equatable { let date: String; let weather: String; var word: String? }
    /// calm / rain (dernier jour de pluie) / often (3 jours sur 7) / long (10 sur 14, repère des 2 semaines).
    struct Support: Codable, Equatable { let level: String; let rainy7: Int; let rainy14: Int }
    struct Week: Codable, Equatable { let applications: Int; let drafts: Int; let interviews: Int; let rejections: Int }

    var moods: [Mood]
    let support: Support
    let week: Week
    let prefecture: String?
    let international: Bool
    /// お守りの言葉 (écrites sur le web pour l'instant) : programmées en notifications locales.
    var charms: [Charm]?
    /// はげましの通知 : daily (par défaut) / every2 / weekly / off.
    var cheerFrequency: String?
}

/// Une page du journal intime (日記) : une par jour, jamais envoyée à l'IA.
struct JournalEntry: Codable, Equatable, Identifiable {
    let date: String
    let text: String
    var id: String { date }
}

extension APIClient {
    func journal() async throws -> [JournalEntry] {
        struct Page: Decodable { let entries: [JournalEntry] }
        return try JSONDecoder().decode(Page.self, from: try await sendRaw("GET", "api/kokoro/journal")).entries
    }

    /// Texte vide : la page du jour est effacée.
    func writeJournal(date: String, text: String) async throws {
        try await sendRaw("PUT", "api/kokoro/journal", body: try JSONEncoder().encode(["date": date, "text": text]))
    }

    func kokoro(today: String) async throws -> Kokoro {
        try JSONDecoder().decode(Kokoro.self, from: try await sendRaw("GET", "api/kokoro?today=\(today)"))
    }

    /// weather nil : efface la note du jour.
    func setMood(date: String, weather: String?, word: String?) async throws {
        struct Body: Encodable {
            let date: String; let weather: String?; let word: String?
            // weather est envoyé même vide (null efface) ; word seulement s'il existe.
            func encode(to encoder: Encoder) throws {
                var c = encoder.container(keyedBy: CodingKeys.self)
                try c.encode(date, forKey: .date)
                try c.encode(weather, forKey: .weather)
                try c.encodeIfPresent(word, forKey: .word)
            }
            enum CodingKeys: String, CodingKey { case date, weather, word }
        }
        let clean = word?.trimmingCharacters(in: .whitespaces)
        try await sendRaw("PUT", "api/kokoro/mood", body: try JSONEncoder().encode(Body(date: date, weather: weather, word: weather == nil || clean?.isEmpty != false ? nil : clean)))
    }

    func setCheerFrequency(_ frequency: String) async throws {
        try await sendRaw("PUT", "api/kokoro/settings", body: try JSONEncoder().encode(["cheerFrequency": frequency]))
    }

    func eraseKokoro() async throws {
        try await sendRaw("DELETE", "api/kokoro")
    }
}

@MainActor
@Observable
final class KokoroModel {
    private(set) var data: Kokoro?
    private(set) var failed = false
    /// Le journal, du plus récent au plus ancien (lu à part : il ne voyage pas avec le reste).
    private(set) var journal: [JournalEntry] = []
    /// Le prochain entretien dans les 7 jours : la pause « ひと休みしましょう » lui est dédiée.
    private(set) var nextInterview: (company: String, date: String)?
    let api: APIClient
    private let now: () -> Date

    init(api: APIClient, now: @escaping () -> Date = { .now }) {
        self.api = api
        self.now = now
    }

    var today: String { ISO8601DateFormatter.dayOnly.string(from: now()) }
    var todayMood: Kokoro.Mood? { data?.moods.first { $0.date == today } }

    func load() async {
        do {
            data = try await api.kokoro(today: today)
            failed = false
            if let charms = data?.charms { CharmStore.charms = charms }
        } catch {
            failed = data == nil
        }
        if let pages = try? await api.journal() { journal = pages }
        if let apps = try? await api.applications() { nextInterview = Self.nextInterview(in: apps, today: today) }
    }

    func choose(_ weather: String?) async {
        try? await api.setMood(date: today, weather: weather, word: nil)
        await load()
    }

    /// Change tout de suite à l'écran, puis enregistre ; en cas d'échec, relit l'état du serveur.
    func setCheerFrequency(_ frequency: String) async {
        data?.cheerFrequency = frequency
        do { try await api.setCheerFrequency(frequency) } catch { await load() }
    }

    /// Enregistre la page du jour ; renvoie false si l'envoi a échoué (le texte reste à l'écran).
    func saveJournal(_ text: String) async -> Bool {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        do { try await api.writeJournal(date: today, text: clean) } catch { return false }
        journal.removeAll { $0.date == today }
        if !clean.isEmpty { journal.insert(JournalEntry(date: today, text: clean), at: 0) }
        return true
    }

    func erase() async {
        try? await api.eraseKokoro()
        await load()
    }

    /// Entretiens non terminés des candidatures encore ouvertes, d'aujourd'hui à J+7.
    static func nextInterview(in apps: [JobApplication], today: String) -> (company: String, date: String)? {
        let interviews: Set = ["interview1", "interview2", "final"]
        let limit = ISO8601DateFormatter.dayOnly.date(from: today).flatMap { Calendar.current.date(byAdding: .day, value: 7, to: $0) }
            .map { ISO8601DateFormatter.dayOnly.string(from: $0) } ?? today
        return apps
            .filter { !["rejected", "withdrawn"].contains($0.status) }
            .flatMap { app in app.steps.compactMap { step -> (company: String, date: String)? in
                guard interviews.contains(step.type), !step.done, let d = step.dueDate, d >= today, d <= limit else { return nil }
                return (app.company, d)
            } }
            .min { $0.date < $1.date }
    }
}
