import Foundation

/// Profil de l'utilisateur (S05), au format de l'API. Les champs facultatifs vides
/// valent nil, et ne sont donc pas envoyés.
struct Profile: Codable, Equatable {
    var nameKanji = ""
    var nameKana = ""
    var nameLatin: String?
    var birthDate: String?
    var email: String?
    var phone: String?
    var address: String?
    var education: [Education] = []
    var work: [Work] = []
    var certifications: [Certification] = []
    var languages: [Language] = []

    struct Education: Codable, Equatable, Identifiable {
        var id = UUID()
        var school = ""
        var faculty: String?
        var start = ""
        var end: String?
        var status: Status = .enrolled

        enum Status: String, Codable, CaseIterable {
            case enrolled, expected, graduated, left
            var label: String {
                switch self {
                case .enrolled: "在学中 / Enrolled"
                case .expected: "卒業見込み / Expected"
                case .graduated: "卒業 / Graduated"
                case .left: "中退 / Left"
                }
            }
        }

        // `id` ne sert qu'à l'affichage : il n'est ni envoyé ni attendu.
        enum CodingKeys: String, CodingKey { case school, faculty, start, end, status }
    }

    struct Work: Codable, Equatable, Identifiable {
        var id = UUID()
        var company = ""
        var role: String?
        var start = ""
        var end: String?
        var description: String?
        enum CodingKeys: String, CodingKey { case company, role, start, end, description }
    }

    struct Certification: Codable, Equatable, Identifiable {
        var id = UUID()
        var name = ""
        var date = ""
        enum CodingKeys: String, CodingKey { case name, date }
    }

    struct Language: Codable, Equatable, Identifiable {
        var id = UUID()
        var language = ""
        var level = ""
        enum CodingKeys: String, CodingKey { case language, level }
    }

    // L'API renvoie aussi id, userId et updatedAt : on les ignore à la lecture.
    enum CodingKeys: String, CodingKey {
        case nameKanji, nameKana, nameLatin, birthDate, email, phone, address, education, work, certifications, languages
    }

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        nameKanji = try c.decode(String.self, forKey: .nameKanji)
        nameKana = try c.decode(String.self, forKey: .nameKana)
        nameLatin = try c.decodeIfPresent(String.self, forKey: .nameLatin)
        birthDate = try c.decodeIfPresent(String.self, forKey: .birthDate)
        email = try c.decodeIfPresent(String.self, forKey: .email)
        phone = try c.decodeIfPresent(String.self, forKey: .phone)
        address = try c.decodeIfPresent(String.self, forKey: .address)
        education = try c.decodeIfPresent([Education].self, forKey: .education) ?? []
        work = try c.decodeIfPresent([Work].self, forKey: .work) ?? []
        certifications = try c.decodeIfPresent([Certification].self, forKey: .certifications) ?? []
        languages = try c.decodeIfPresent([Language].self, forKey: .languages) ?? []
    }
}

/// Champ refusé par l'API (400), repéré par son chemin, par exemple « education.0.start ».
struct Issue: Decodable, Equatable {
    let path: String
    let message: String
}
