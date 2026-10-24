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
            case enrolled, expected, graduated, completed, left
            var label: String {
                switch self {
                case .enrolled: tr("在学中", "Enrolled", "En cours")
                case .expected: tr("卒業見込み", "Expected", "Diplôme prévu")
                case .graduated: tr("卒業", "Graduated", "Diplômé")
                case .completed: tr("修了（日本語学校・留学）", "Completed", "Terminé")
                case .left: tr("中退", "Left", "Abandon")
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
        /// Code de ProfileChoices.certificationCategories ; vide = pas encore choisi.
        var category = ""
        var name = ""
        var date = ""
        enum CodingKeys: String, CodingKey { case category, name, date }

        init(category: String = "", name: String = "", date: String = "") {
            self.category = category; self.name = name; self.date = date
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            category = try c.decodeIfPresent(String.self, forKey: .category) ?? ""
            name = try c.decode(String.self, forKey: .name)
            date = try c.decode(String.self, forKey: .date)
        }

        /// Une catégorie non choisie n'est pas envoyée : l'API met « other ».
        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            if !category.isEmpty { try c.encode(category, forKey: .category) }
            try c.encode(name, forKey: .name)
            try c.encode(date, forKey: .date)
        }
    }

    struct Language: Codable, Equatable, Identifiable {
        var id = UUID()
        /// Codes de ProfileChoices.languages et ProfileChoices.levels.
        var language = ""
        /// Nom de la langue quand `language` vaut « other ».
        var languageOther: String?
        var level = ""
        enum CodingKeys: String, CodingKey { case language, languageOther, level }
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
