import XCTest
@testable import ShukatsuPilot

final class OpenDataTests: XCTestCase {
    override func tearDown() { UserDefaults.standard.removeObject(forKey: HelpLanguage.storageKey) }

    private func weather(_ kind: String, rain: Int? = nil, tMax: Int? = 20) -> DayWeather {
        DayWeather(date: "2026-10-30", prefecture: "東京都", kind: kind, rainChance: rain, tMax: tMax, tMin: 12)
    }

    func testAdviceFollowsTheForecast() {
        UserDefaults.standard.set("ja", forKey: HelpLanguage.storageKey)
        XCTAssertEqual(weather("rain").advice, "雨の予報です。傘を忘れずに。")
        XCTAssertEqual(weather("cloud", rain: 60).advice, "雨の予報です。傘を忘れずに。", "50 % ou plus : parapluie")
        XCTAssertEqual(weather("snow").advice, "雪の予報です。早めに出発しましょう。")
        XCTAssertEqual(weather("sun", tMax: 32).advice, "暑い日です。水分補給を忘れずに。")
        XCTAssertNil(weather("sun").advice)
        XCTAssertEqual(weather("rain", rain: 80).summary, "雨 · 20° / 12° · 80%")
    }

    func testInterviewReminderAddsWeatherAdvice() {
        UserDefaults.standard.set("ja", forKey: HelpLanguage.storageKey)
        var tokyo = Calendar(identifier: .gregorian)
        tokyo.timeZone = TimeZone(identifier: "Asia/Tokyo")!
        let now = tokyo.date(from: DateComponents(year: 2026, month: 10, day: 22, hour: 12))!
        let app = JobApplication(id: "a", company: "ソニー", status: "interview1",
                                 steps: [.init(id: "i1", type: "interview1", dueDate: "2026-10-30", time: "14:00")], nextDeadline: nil)
        let r = InterviewReminders.reminders(for: [app], weather: ["i1": weather("rain")], now: now, calendar: tokyo)
        XCTAssertTrue(r[0].body.hasSuffix("\n雨の予報です。傘を忘れずに。"))
        XCTAssertFalse(InterviewReminders.reminders(for: [app], now: now, calendar: tokyo)[0].body.contains("傘"))
    }

    func testCompanyFactsDecodeWithMissingNumbers() throws {
        let json = #"{"corporateNumber":"5010401067252","name":"ソニーグループ株式会社","location":null,"url":null,"employees":1800,"capital":null,"founded":1946,"summary":null,"labels":[{"id":"kurumin","title":"プラチナくるみん認定","date":"2022-06-01"},{"id":null,"title":"ISO 14001","date":null}],"workplace":{"averageAge":43.1,"averageYears":null,"overtimeHours":17.5,"femaleWorkersPct":null,"femaleManagersPct":13,"paternityLeavePct":82}}"#
        let facts = try JSONDecoder().decode(CompanyFacts.self, from: Data(json.utf8))
        XCTAssertEqual(facts.labels.filter { $0.meaning != nil }.map(\.title), ["プラチナくるみん認定"])
        XCTAssertEqual(facts.workplace?.overtimeHours, 17.5)
        XCTAssertNil(facts.workplace?.averageYears)
    }

    func testUnlinkingSendsNull() throws {
        var input = JobApplicationInput()
        input.company = "ソニー"
        let sent = try JSONSerialization.jsonObject(with: JSONEncoder().encode(input)) as? [String: Any]
        XCTAssertTrue(sent?["corporateNumber"] is NSNull, "null défait le lien côté API")
        XCTAssertTrue(sent?["location"] is NSNull)
    }

    func testReminderNamesTheVenueOrSaysOnline() {
        UserDefaults.standard.set("ja", forKey: HelpLanguage.storageKey)
        var tokyo = Calendar(identifier: .gregorian)
        tokyo.timeZone = TimeZone(identifier: "Asia/Tokyo")!
        let now = tokyo.date(from: DateComponents(year: 2026, month: 10, day: 22, hour: 12))!
        func app(_ place: String) -> JobApplication {
            JobApplication(id: "a", company: "ソニー", status: "interview1",
                           steps: [.init(id: "i1", type: "interview1", dueDate: "2026-10-30", time: "14:00", place: place)], nextDeadline: nil)
        }
        XCTAssertTrue(InterviewReminders.reminders(for: [app("東京都港区港南1-7-1")], now: now, calendar: tokyo)[0].body.contains("\n会場：東京都港区港南1-7-1"))
        let online = InterviewReminders.reminders(for: [app("https://zoom.us/j/123")], now: now, calendar: tokyo)[0].body
        XCTAssertTrue(online.contains("オンライン面接です"))
        XCTAssertFalse(online.contains("zoom.us"), "le lien s'ouvre depuis l'app, pas dans la notification")
    }

    func testWeatherFromOlderAPIWithoutPlaceStillDecodes() throws {
        let w = try JSONDecoder().decode(DayWeather.self, from: Data(#"{"date":"2026-10-30","prefecture":"東京都","kind":"rain","rainChance":80,"tMax":19,"tMin":12}"#.utf8))
        XCTAssertNil(w.place)
        XCTAssertTrue(w.wet)
    }
}
