import Foundation
import SwiftUI

/// Données ouvertes (même API que le site) : jours fériés, météo du jour de l'entretien,
/// adresse d'un code postal, fiche officielle d'une entreprise (gBizINFO).
/// Tout est facultatif : si un service ne répond pas, l'app fait simplement sans.

struct DayWeather: Codable, Equatable {
    let date: String
    let prefecture: String
    /// Lieu court (« 東京都渋谷区 ») ; absent dans les réponses des premières versions.
    var place: String?
    let kind: String
    let rainChance: Int?
    let tMax: Int?
    let tMin: Int?

    var symbol: String {
        switch kind {
        case "sun": "sun.max"
        case "rain": "cloud.rain"
        case "snow": "cloud.snow"
        case "storm": "cloud.bolt.rain"
        case "fog": "cloud.fog"
        default: "cloud"
        }
    }

    var name: String {
        switch kind {
        case "sun": tr("晴れ", "Sunny", "Soleil")
        case "rain": tr("雨", "Rain", "Pluie")
        case "snow": tr("雪", "Snow", "Neige")
        case "storm": tr("雷雨", "Thunderstorm", "Orage")
        case "fog": tr("霧", "Fog", "Brouillard")
        default: tr("くもり", "Cloudy", "Nuageux")
        }
    }

    var wet: Bool { kind == "rain" || kind == "storm" || (rainChance ?? 0) >= 50 }

    /// « 雨 · 19° / 12° · 80% »
    var summary: String {
        var parts = [name]
        if let tMax, let tMin { parts.append("\(tMax)° / \(tMin)°") }
        if let rainChance, rainChance >= 30 { parts.append("\(rainChance)%") }
        return parts.joined(separator: " · ")
    }

    /// Conseil ajouté à l'encouragement 1 h avant l'entretien.
    var advice: String? {
        if kind == "snow" { return tr("雪の予報です。早めに出発しましょう。", "Snow is forecast: leave a little early.", "Neige prévue : partez un peu plus tôt.") }
        if wet { return tr("雨の予報です。傘を忘れずに。", "Rain is forecast: take an umbrella.", "Pluie prévue : pensez au parapluie.") }
        if let tMax, tMax >= 30 { return tr("暑い日です。水分補給を忘れずに。", "A hot day: stay hydrated.", "Il fera chaud : pensez à boire.") }
        return nil
    }
}

struct PostalAddress: Codable, Equatable {
    let postalCode: String
    let address: String
    let prefecture: String
}

struct CompanyMatch: Codable, Equatable, Identifiable {
    let corporateNumber: String
    let name: String
    let location: String?
    var id: String { corporateNumber }
}

struct CompanyFacts: Codable, Equatable {
    struct Label: Codable, Equatable {
        let id: String?
        let title: String
        let date: String?
        /// Ce que le label veut dire pour un étudiant.
        var meaning: String? {
            switch id {
            case "kurumin": tr("子育てサポート企業", "Supports working parents", "Soutient les parents")
            case "eruboshi": tr("女性の活躍推進", "Promotes women's careers", "Égalité femmes-hommes")
            case "youthyell": tr("若者の採用・育成に積極的", "Good employer for young people", "Bon employeur pour les jeunes")
            case "kenkou": tr("社員の健康に配慮", "Cares about employee health", "Santé au travail")
            case "monisu": tr("障害者雇用に積極的", "Disability-inclusive employer", "Inclusion du handicap")
            case "anzen": tr("安全衛生の優良企業", "Safe workplace", "Sécurité au travail")
            default: nil
            }
        }
    }
    struct Workplace: Codable, Equatable {
        let averageAge: Double?
        let averageYears: Double?
        let overtimeHours: Double?
        let femaleWorkersPct: Double?
        let femaleManagersPct: Double?
        let paternityLeavePct: Double?
    }
    let corporateNumber: String
    let name: String
    let location: String?
    let url: String?
    let employees: Int?
    let founded: Int?
    let labels: [Label]
    let workplace: Workplace?
}

extension APIClient {
    private func optional<T: Decodable>(_ type: T.Type, _ path: String) async -> T? {
        guard let data = try? await sendRaw("GET", path) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    func holidays() async -> [String: String] {
        await optional([String: String].self, "api/holidays") ?? [:]
    }

    func weather(date: String, location: String?) async -> DayWeather? {
        let loc = location.flatMap { $0.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) }.map { "&location=\($0)" } ?? ""
        return await optional(DayWeather.self, "api/weather?date=\(date)\(loc)")
    }

    func postal(_ code: String) async -> PostalAddress? {
        let digits = code.filter(\.isNumber)
        guard digits.count == 7 else { return nil }
        return await optional(PostalAddress.self, "api/postal/\(digits)")
    }

    /// nil : service non configuré ou en panne (le bloc est alors masqué) ; [] : rien trouvé.
    func searchCompanies(_ name: String) async -> [CompanyMatch]? {
        guard let q = name.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) else { return nil }
        return await optional([CompanyMatch].self, "api/company/search?name=\(q)")
    }

    func companyFacts(_ corporateNumber: String) async -> CompanyFacts? {
        await optional(CompanyFacts.self, "api/company/\(corporateNumber)")
    }
}

/// Le temps du jour de l'entretien, en pastille blanche (accueil).
struct WeatherBadge: View {
    let weather: DayWeather
    var label: String?

    var body: some View {
        HStack(spacing: 6) {
            if let label { Text(label).font(.caption2.weight(.semibold)).foregroundStyle(Color.cwMuted) }
            Image(systemName: weather.symbol)
                .foregroundStyle(weather.kind == "sun" ? Color(red: 0.79, green: 0.54, blue: 0.11) : Color.cwBlue500)
            Text(weather.summary).foregroundStyle(Color.cwBlue800)
            if weather.wet {
                Text("· " + tr("傘を忘れずに", "Take an umbrella", "Pensez au parapluie")).fontWeight(.semibold).foregroundStyle(Color.cwBordeaux)
            }
        }
        .font(.caption)
        .padding(.horizontal, 10).padding(.vertical, 4)
        .background(.white, in: Capsule())
        .accessibilityElement(children: .combine)
    }
}
