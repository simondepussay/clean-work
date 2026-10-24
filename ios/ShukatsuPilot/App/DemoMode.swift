#if DEBUG
import Foundation

/// Mode démo (builds de développement seulement, jamais dans l'app publiée) : lancé avec
/// l'argument « -demo », l'app montre un faux compte et des données d'exemple, sans réseau.
/// Sert à vérifier le design dans le simulateur et à faire des captures pour le portfolio.
@MainActor
enum DemoMode {
    nonisolated static var isOn: Bool { ProcessInfo.processInfo.arguments.contains("-demo") }

    static func model() -> AppModel {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [DemoURLProtocol.self]
        let api = APIClient(baseURL: URL(string: "https://demo.invalid")!, session: URLSession(configuration: config), token: { "demo" })
        return AppModel(account: DemoAccount(), api: api)
    }
}

@MainActor
private final class DemoAccount: AccountService {
    var isSignedIn = true
    var email: String? { "simon@example.com" }
    var displayName: String? { "Simon" }
    func signIn(email: String, password: String) async throws {}
    func signUp(email: String, password: String, name: String) async throws -> SignUpChallenge { throw AccountError.notConfigured }
    func signOut() { isSignedIn = false }
    func accessToken() async throws -> String { "demo" }
}

/// Répond aux appels de l'API avec des données d'exemple (dates autour d'aujourd'hui).
private final class DemoURLProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
        let path = request.url?.path ?? ""
        let method = request.httpMethod ?? "GET"
        let body: Any
        switch (method, path) {
        case ("GET", "/api/me"): body = ["userId": "demo", "email": "simon@example.com", "name": "Simon", "hasProfile": true]
        case ("GET", "/api/applications"): body = Self.applications
        case ("GET", "/api/plans"): body = Self.plans
        case ("GET", "/api/drafts"): body = [] as [Any]
        case ("GET", "/api/interviews"): body = [] as [Any]
        case ("GET", "/api/interview-usage"), ("GET", "/api/usage"): body = ["today": 3, "month": 19]
        case ("GET", "/api/info"): body = Self.info
        case ("POST", "/api/plans"):
            let sent = (try? JSONSerialization.jsonObject(with: Self.bodyData(of: request) ?? Data())) as? [String: Any] ?? [:]
            body = sent.merging(["id": UUID().uuidString, "done": false]) { a, _ in a }
        default: body = [:] as [String: Any]
        }
        let data = (try? JSONSerialization.data(withJSONObject: body)) ?? Data()
        let response = HTTPURLResponse(url: request.url!, statusCode: method == "POST" ? 201 : 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }

    private static func bodyData(of request: URLRequest) -> Data? {
        if let data = request.httpBody { return data }
        guard let stream = request.httpBodyStream else { return nil }
        stream.open(); defer { stream.close() }
        var data = Data(); var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable { let n = stream.read(&buffer, maxLength: buffer.count); if n <= 0 { break }; data.append(buffer, count: n) }
        return data
    }

    private static func day(_ offset: Int) -> String {
        ISO8601DateFormatter.dayOnly.string(from: Calendar.current.date(byAdding: .day, value: offset, to: .now) ?? .now)
    }

    static var applications: [[String: Any]] {[
        ["id": "a1", "company": "株式会社サイバーエージェント", "position": "ゲームプランナー", "status": "es",
         "steps": [["id": "s1", "type": "es", "dueDate": day(2), "done": false]], "nextDeadline": day(2)],
        ["id": "a2", "company": "ソニーグループ", "position": "エンジニア", "status": "interview1",
         "steps": [["id": "s2", "type": "interview1", "dueDate": day(6), "done": false]], "nextDeadline": day(6)],
        ["id": "a3", "company": "楽天グループ", "status": "interested", "steps": [] as [Any]],
        ["id": "a4", "company": "LINEヤフー", "status": "test",
         "steps": [["id": "s4", "type": "test", "dueDate": day(12), "done": false]], "nextDeadline": day(12)],
    ]}

    static var plans: [[String: Any]] {[
        ["id": "p1", "kind": "event", "title": "合同企業説明会", "date": day(1), "time": "13:00", "done": false],
        ["id": "p2", "kind": "goal", "title": "ES 3本提出", "date": day(5), "done": false],
        ["id": "p3", "kind": "note", "title": "履歴書の写真を撮る", "date": day(3), "done": false],
    ]}

    static var info: [String: Any] {
        let t = { (ja: String, en: String, fr: String) in ["ja": ja, "en": en, "fr": fr] }
        return ["page": 1, "pages": 2, "total": 9,
                "sources": [["id": "mhlw", "name": "厚生労働省"], ["id": "japantimes", "name": "The Japan Times"]],
                "items": [
                    ["id": "n1", "kind": "news", "date": day(0), "source": "mhlw", "link": "https://www.mhlw.go.jp/",
                     "title": t("新規学卒者の離職状況を公表", "Turnover of new graduates published", "Publication du taux de départ des jeunes diplômés"),
                     "summary": t("入社3年以内の離職率は企業選びの参考になります。", "Early turnover helps when choosing a company.", "Le taux de départ précoce aide à choisir une entreprise.")],
                    ["id": "n2", "kind": "news", "date": day(0), "source": "japantimes", "link": "https://www.japantimes.co.jp/",
                     "title": t("日本のインフレ率が今年初めて2％超に", "Japanese inflation tops 2%", "L'inflation japonaise dépasse 2 %"),
                     "summary": t("賃金や採用に影響します。", "It affects wages and hiring.", "Elle influence salaires et recrutements.")],
                ],
                "articles": [["id": "bienvenue", "kind": "article", "date": day(0), "body": "Clean Work へようこそ。",
                              "title": t("Clean Work へようこそ", "Welcome to Clean Work", "Bienvenue sur Clean Work"),
                              "summary": t("就活に必要なものを、ひとつの場所に。", "Everything for your job hunt, in one place.", "Tout pour votre recherche d'emploi, au même endroit.")]]]
    }
}
#endif
