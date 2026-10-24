import Foundation
import PDFKit

/// Ce que l'IA a trouvé dans un CV (POST /api/profile/import) : rien n'est enregistré,
/// le formulaire est seulement rempli, puis l'utilisateur vérifie et enregistre.
struct CvImport: Decodable, Equatable {
    var nameKanji: String?
    var nameKana: String?
    var nameLatin: String?
    var birthDate: String?
    var email: String?
    var phone: String?
    var address: String?
    var education: [Profile.Education] = []
    var work: [Profile.Work] = []
    var certifications: [Profile.Certification] = []
    var languages: [Profile.Language] = []
    /// Champs à compléter : mois absent du CV (« month »), ou date d'une certification absente (« date »).
    var check: [Check] = []

    struct Check: Decodable, Equatable {
        let path: String
        let reason: String
    }

    enum CodingKeys: String, CodingKey {
        case nameKanji, nameKana, nameLatin, birthDate, email, phone, address, education, work, certifications, languages, check
    }

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        nameKanji = try c.decodeIfPresent(String.self, forKey: .nameKanji)
        nameKana = try c.decodeIfPresent(String.self, forKey: .nameKana)
        nameLatin = try c.decodeIfPresent(String.self, forKey: .nameLatin)
        birthDate = try c.decodeIfPresent(String.self, forKey: .birthDate)
        email = try c.decodeIfPresent(String.self, forKey: .email)
        phone = try c.decodeIfPresent(String.self, forKey: .phone)
        address = try c.decodeIfPresent(String.self, forKey: .address)
        education = try c.decodeIfPresent([Profile.Education].self, forKey: .education) ?? []
        work = try c.decodeIfPresent([Profile.Work].self, forKey: .work) ?? []
        certifications = try c.decodeIfPresent([Profile.Certification].self, forKey: .certifications) ?? []
        languages = try c.decodeIfPresent([Profile.Language].self, forKey: .languages) ?? []
        check = try c.decodeIfPresent([Check].self, forKey: .check) ?? []
    }
}

enum CvImportError: Error, Equatable { case tooShort, limit, failed }

extension APIClient {
    /// Le texte du CV rangé dans les champs du profil (compte comme une relecture par IA).
    func importCv(_ text: String) async throws -> CvImport {
        struct Body: Encodable { let text: String }
        do {
            let data = try await sendRaw("POST", "api/profile/import", body: try JSONEncoder().encode(Body(text: text)))
            return try JSONDecoder().decode(CvImport.self, from: data)
        } catch APIError.invalid {
            throw CvImportError.tooShort
        } catch APIError.server(status: 429) {
            throw CvImportError.limit
        } catch {
            throw CvImportError.failed
        }
    }
}

enum CvText {
    /// Le texte d'un PDF (vide si c'est une image scannée).
    static func fromPDF(_ url: URL) -> String {
        guard let document = PDFDocument(url: url) else { return "" }
        return (0..<document.pageCount).compactMap { document.page(at: $0)?.string }.joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
