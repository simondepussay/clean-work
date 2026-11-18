import Foundation

/// Une carte de visite (名刺) : GET /api/cards. La photo se charge à part (GET /api/cards/{id}/image).
struct BusinessCard: Codable, Identifiable, Equatable, Hashable {
    let id: String
    var name: String?
    var nameKana: String?
    var company: String?
    var department: String?
    var title: String?
    var email: String?
    var phone: String?
    var mobile: String?
    var address: String?
    var website: String?
    var metAt: String?
    var metOn: String?
    var notes: String?
    var applicationId: String?
    var rawText: String?
    var hasImage: Bool
    let createdAt: String
    let updatedAt: String

    /// Ce qu'on affiche en titre : le nom, sinon l'entreprise.
    var displayName: String { [name, company].compactMap { $0?.trimmingCharacters(in: .whitespaces) }.first { !$0.isEmpty } ?? "—" }

    /// Recherche par mots-clés, comme le serveur et le site : chaque mot doit apparaître quelque part.
    func matches(_ query: String) -> Bool {
        let fold = { (s: String) in s.precomposedStringWithCompatibilityMapping.lowercased() }
        let haystack = fold([name, nameKana, company, department, title, email, phone, mobile, address, website, metAt, metOn, notes, rawText]
            .compactMap { $0 }.joined(separator: " "))
        return fold(query).split(whereSeparator: \.isWhitespace).allSatisfy { haystack.contains($0) }
    }
}

/// Les champs d'une carte, tels que l'utilisateur les modifie (formulaire de scan ou de fiche).
struct CardFields: Equatable {
    var name = "", nameKana = "", company = "", department = "", title = ""
    var email = "", phone = "", mobile = "", address = "", website = ""
    var metAt = "", metOn: Date? = nil, notes = ""

    init() {}

    init(_ card: BusinessCard) {
        name = card.name ?? ""; nameKana = card.nameKana ?? ""; company = card.company ?? ""
        department = card.department ?? ""; title = card.title ?? ""; email = card.email ?? ""
        phone = card.phone ?? ""; mobile = card.mobile ?? ""; address = card.address ?? ""
        website = card.website ?? ""; metAt = card.metAt ?? ""; notes = card.notes ?? ""
        metOn = card.metOn.flatMap { ISO8601DateFormatter.dayOnly.date(from: $0) }
    }

    init(_ reading: CardReading) {
        name = reading.name; nameKana = reading.nameKana; company = reading.company; department = reading.department
        title = reading.title; email = reading.email; phone = reading.phone; mobile = reading.mobile
        address = reading.address; website = reading.website
    }

    var isEmpty: Bool { [name, company, email, phone, notes].allSatisfy { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty } }

    /// Pour l'API : un champ vide part en null (le serveur l'efface).
    var payload: [String: String?] {
        func v(_ s: String) -> String? { let t = s.trimmingCharacters(in: .whitespacesAndNewlines); return t.isEmpty ? nil : t }
        return ["name": v(name), "nameKana": v(nameKana), "company": v(company), "department": v(department), "title": v(title),
                "email": v(email), "phone": v(phone), "mobile": v(mobile), "address": v(address), "website": v(website),
                "metAt": v(metAt), "metOn": metOn.map { ISO8601DateFormatter.dayOnly.string(from: $0) }, "notes": v(notes)]
    }
}

/// Ce que l'IA a rangé à partir du texte lu sur la carte (POST /api/cards/read).
struct CardReading: Decodable {
    var name = "", nameKana = "", company = "", department = "", title = ""
    var email = "", phone = "", mobile = "", address = "", website = ""
}

extension APIClient {
    func cards() async throws -> [BusinessCard] {
        try JSONDecoder().decode([BusinessCard].self, from: try await sendRaw("GET", "api/cards"))
    }

    /// Crée une carte, avec sa photo (JPEG en base64). nil : trop de cartes (409).
    func createCard(_ fields: CardFields, rawText: String?, jpeg: Data?) async throws -> BusinessCard? {
        var body = fields.payload.compactMapValues { $0 }
        if let rawText, !rawText.isEmpty { body["rawText"] = String(rawText.prefix(3000)) }
        if let jpeg { body["image"] = jpeg.base64EncodedString() }
        let (data, status) = try await sendUnchecked("POST", "api/cards", body: try JSONEncoder().encode(body))
        if status == 409 { return nil }
        if status == 400 {
            struct Invalid: Decodable { let issues: [Issue] }
            throw APIError.invalid((try? JSONDecoder().decode(Invalid.self, from: data))?.issues ?? [])
        }
        guard (200..<300).contains(status) else { throw APIError.server(status: status) }
        return try JSONDecoder().decode(BusinessCard.self, from: data)
    }

    func updateCard(_ id: String, _ fields: CardFields) async throws -> BusinessCard {
        try JSONDecoder().decode(BusinessCard.self, from: try await sendRaw("PUT", "api/cards/\(id)", body: try JSONEncoder().encode(fields.payload)))
    }

    func deleteCard(_ id: String) async throws {
        try await sendRaw("DELETE", "api/cards/\(id)")
    }

    func cardImage(_ id: String) async throws -> Data {
        try await sendRaw("GET", "api/cards/\(id)/image")
    }

    /// L'IA range le texte lu sur la carte. nil si l'IA n'est pas disponible (limite, panne) : on garde alors la lecture locale.
    func readCard(text: String) async -> CardReading? {
        guard let body = try? JSONEncoder().encode(["text": String(text.prefix(3000))]),
              let (data, status) = try? await sendUnchecked("POST", "api/cards/read", body: body),
              (200..<300).contains(status) else { return nil }
        return try? JSONDecoder().decode(CardReading.self, from: data)
    }
}
