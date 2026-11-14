import SwiftUI

/// Les onglets de Clean Work (mêmes que le site).
enum MainTab: String, CaseIterable, Identifiable {
    case home, kokoro, apps, interview, documents, info
    var id: String { rawValue }

    /// Les intercalaires restent en japonais + anglais, comme sur le site.
    var ja: String {
        switch self { case .home: "ホーム"; case .kokoro: "こころ"; case .apps: "応募"; case .interview: "面接"; case .documents: "書類"; case .info: "情報" }
    }
    var en: String {
        switch self { case .home: "Home"; case .kokoro: "Mind"; case .apps: "Applications"; case .interview: "Interview"; case .documents: "Documents"; case .info: "Info" }
    }
}

/// Onglet demandé de l'extérieur : une notification touchée (voir AppDelegate). Gardé ici jusqu'à ce que
/// l'écran principal existe, car au lancement à froid la notification arrive avant lui.
@MainActor @Observable final class TabRouter {
    static let shared = TabRouter()
    var requested: MainTab?
}

/// Écran principal une fois connecté : en-tête, intercalaires de classeur, puis la « feuille » de l'onglet choisi.
struct MainView: View {
    @Environment(AppModel.self) private var model
    @AppStorage(HelpLanguage.storageKey) private var language = HelpLanguage.deviceDefault.rawValue
    @State private var tab: MainTab = .home
    @State private var showingAccount = false
    /// Entretien prévu à préparer (bouton « 練習する » d'un entretien du calendrier).
    @State private var practice: InterviewTarget?
    /// Nouveau compte sans profil : l'écran de bienvenue passe devant, jusqu'au profil ou à « あとで ».
    @State private var welcome: Me?

    var body: some View {
        VStack(spacing: 0) {
            CleanHeader(showingAccount: $showingAccount)
            BinderTabBar(selection: $tab)
                .padding(.top, 10)
            sheetContent
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(.white)
                .clipShape(UnevenRoundedRectangle(bottomLeadingRadius: 0, bottomTrailingRadius: 0, topTrailingRadius: 14))
                .overlay(UnevenRoundedRectangle(topTrailingRadius: 14).stroke(Color.cwLine))
                .padding(.horizontal, 8)
        }
        .background(WaveBackground())
        // Changer de langue redessine tout l'écran dans la nouvelle langue.
        .id(language)
        .sheet(isPresented: $showingAccount) {
            NavigationStack { AccountView() }
        }
        .task { await checkWelcome() }
        .fullScreenCover(item: $welcome) { me in
            if let api = model.apiClient {
                WelcomeSetupView(api: api, me: me, onProfileSaved: { await model.refreshMe() }) { go in
                    welcome = nil
                    if let go { tab = go }
                }
            }
        }
        // Léger retour haptique au changement d'onglet.
        .sensoryFeedback(.selection, trigger: tab)
        // Une notification touchée ouvre son onglet (initial : aussi quand l'app vient d'être lancée par elle).
        .onChange(of: TabRouter.shared.requested, initial: true) { _, requested in
            guard let requested else { return }
            tab = requested
            TabRouter.shared.requested = nil
        }
    }

    /// Le compte est lu une fois à l'arrivée ; sans profil (et sans « あとで » déjà choisi), on accueille.
    private func checkWelcome() async {
        if case .loaded = model.me {} else { await model.refreshMe() }
        guard case .loaded(let me) = model.me, !me.hasProfile, !WelcomeSetupView.postponed(me) else { return }
        welcome = me
    }

    @ViewBuilder private var sheetContent: some View {
        if let api = model.apiClient {
            switch tab {
            case .home:
                NavigationStack {
                    HomeView(onPractice: { target in
                        practice = target
                        tab = .interview
                    })
                }
            case .kokoro:
                KokoroView(model: KokoroModel(api: api))
            case .apps:
                NavigationStack { ApplicationsView(model: ApplicationsModel(api: api)) }
            case .interview:
                NavigationStack {
                    InterviewView(model: InterviewModel(api: api, applicationId: practice?.applicationId, stepId: practice?.stepId))
                }
                .id(practice?.stepId ?? "interview")
            case .documents:
                DocumentsView(api: api)
            case .info:
                NavigationStack { InfoView(api: api) }
            }
        }
    }
}

/// Un entretien prévu dans une candidature.
struct InterviewTarget: Equatable {
    let applicationId: String
    let stepId: String
}

/// En-tête : la marque à gauche (comme sur le site), le globe et le compte à droite.
struct CleanHeader: View {
    @Binding var showingAccount: Bool
    @AppStorage(HelpLanguage.storageKey) private var language = HelpLanguage.deviceDefault.rawValue

    var body: some View {
        HStack(spacing: 10) {
            LogoMark(size: 30)
            Text("Clean Work").font(.title3.bold()).foregroundStyle(Color.cwBlue800)
            Spacer()
            Menu {
                Picker(tr("表示言語", "Language", "Langue"), selection: $language) {
                    ForEach(HelpLanguage.allCases) { Text($0.label).tag($0.rawValue) }
                }
            } label: {
                CircleIcon(systemName: "globe", badge: HelpLanguage(rawValue: language)?.code)
            }
            .accessibilityLabel(tr("表示言語", "Language", "Langue"))
            Button { showingAccount = true } label: { CircleIcon(systemName: "person") }
                .accessibilityLabel(tr("アカウント", "Account", "Compte"))
        }
        .padding(.horizontal, 16)
        .padding(.top, 6)
    }
}

/// Bouton rond à bord bleu (globe, compte), avec éventuellement un petit badge (« JA »).
struct CircleIcon: View {
    let systemName: String
    var badge: String?

    var body: some View {
        Image(systemName: systemName)
            .font(.system(size: 17))
            .foregroundStyle(Color.cwBlue700)
            .frame(width: 40, height: 40)
            .background(.white, in: Circle())
            .overlay(Circle().stroke(Color.cwBlue300, lineWidth: 1.5))
            .overlay(alignment: .bottomTrailing) {
                if let badge {
                    Text(badge).font(.system(size: 9, weight: .bold)).foregroundStyle(.white)
                        .padding(.horizontal, 4).padding(.vertical, 1)
                        .background(Color.cwBlue700, in: RoundedRectangle(cornerRadius: 5))
                        .offset(x: 4, y: 3)
                }
            }
    }
}

/// Sommet d'intercalaire : une demi-ellipse posée sur deux côtés droits.
struct BinderTabShape: Shape {
    var topHeight: CGFloat = 20

    func path(in rect: CGRect) -> Path {
        let k: CGFloat = 0.5523 // approximation d'un quart d'ellipse par une courbe de Bézier
        let rx = rect.width / 2, ry = min(topHeight, rect.height)
        var p = Path()
        p.move(to: CGPoint(x: rect.minX, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.minX, y: rect.minY + ry))
        p.addCurve(to: CGPoint(x: rect.midX, y: rect.minY),
                   control1: CGPoint(x: rect.minX, y: rect.minY + ry - k * ry), control2: CGPoint(x: rect.midX - k * rx, y: rect.minY))
        p.addCurve(to: CGPoint(x: rect.maxX, y: rect.minY + ry),
                   control1: CGPoint(x: rect.midX + k * rx, y: rect.minY), control2: CGPoint(x: rect.maxX, y: rect.minY + ry - k * ry))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        return p
    }
}

/// Intercalaires de classeur : chaque onglet d'un bleu un peu différent, qui chevauche le précédent ;
/// l'onglet actif est blanc et se fond dans la feuille, avec un trait bordeaux en haut.
struct BinderTabBar: View {
    @Binding var selection: MainTab
    private let tints: [Color] = [
        Color(red: 0.875, green: 0.914, blue: 0.969), Color(red: 0.827, green: 0.882, blue: 0.957),
        Color(red: 0.780, green: 0.851, blue: 0.945), Color(red: 0.729, green: 0.816, blue: 0.933),
        Color(red: 0.678, green: 0.780, blue: 0.918), Color(red: 0.627, green: 0.745, blue: 0.902),
    ]

    var body: some View {
        HStack(spacing: -10) {
            ForEach(Array(MainTab.allCases.enumerated()), id: \.element) { index, tab in
                let active = tab == selection
                Button {
                    withAnimation(.easeOut(duration: 0.15)) { selection = tab }
                } label: {
                    VStack(spacing: 1) {
                        Capsule().fill(Color.cwBordeaux).frame(width: 20, height: 3).opacity(active ? 1 : 0)
                        Text(tab.ja).font(.system(size: 15, weight: .bold))
                        Text(tab.en).font(.system(size: 9)).foregroundStyle(Color.cwMuted).lineLimit(1).minimumScaleFactor(0.7)
                    }
                    .foregroundStyle(active ? Color.cwBlue700 : Color.cwBlue800)
                    .frame(maxWidth: .infinity)
                    .padding(.top, active ? 12 : 10).padding(.bottom, 8)
                    .background(BinderTabShape().fill(active ? Color.white : tints[index % tints.count]))
                    .overlay(BinderTabShape().stroke(Color.cwLine))
                    .offset(y: active ? 1 : 0)
                }
                .buttonStyle(.plain)
                .zIndex(active ? 10 : Double(MainTab.allCases.count - index))
                .accessibilityAddTraits(active ? [.isSelected] : [])
            }
        }
        .padding(.horizontal, 10)
    }
}

extension Me: Identifiable {
    var id: String { userId }
}

/// Écran de bienvenue d'un nouveau compte : la langue, puis le profil complet (en commençant par l'import
/// d'un CV), puis une première action. Le profil est la base du 履歴書, de la relecture des ES et de
/// l'entretien simulé. « あとで » laisse passer : le profil reste accessible depuis l'icône du compte.
struct WelcomeSetupView: View {
    let api: APIClient
    let me: Me
    let onProfileSaved: () async -> Void
    /// Onglet à ouvrir en sortant (nil : rester sur l'accueil).
    let onDone: (MainTab?) -> Void
    @AppStorage(HelpLanguage.storageKey) private var language = HelpLanguage.deviceDefault.rawValue
    @State private var path: [Step] = []

    enum Step: Hashable { case profile, done }

    private static func key(_ me: Me) -> String { "welcome-later:\(me.userId)" }
    /// « あとで » déjà choisi sur cet iPhone : l'écran ne revient pas à chaque ouverture.
    static func postponed(_ me: Me) -> Bool { UserDefaults.standard.bool(forKey: key(me)) }

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    HStack(spacing: 10) {
                        LogoMark(size: 30)
                        Text("Clean Work").font(.title3.bold()).foregroundStyle(Color.cwBlue800)
                    }
                    Text(me.name.map { tr("\($0)さん、ようこそ", "Welcome, \($0)", "Bienvenue, \($0)") } ?? tr("ようこそ", "Welcome", "Bienvenue"))
                        .font(.largeTitle.bold()).foregroundStyle(Color.cwBlue700)
                    Text(tr("最初にプロフィールを登録しましょう。履歴書の作成、ESの添削、面接の練習は、すべてこのプロフィールをもとにします。",
                            "Let's set up your profile first. Your résumé, entry-sheet reviews and interview practice are all built on it.",
                            "Commençons par votre profil. Le CV japonais, la relecture des ES et l'entraînement aux entretiens s'appuient tous dessus."))
                    VStack(alignment: .leading, spacing: 8) {
                        Text(tr("説明のことば", "Language for explanations", "Langue des explications")).font(.subheadline.weight(.semibold)).foregroundStyle(Color.cwBlue800)
                        Picker(tr("表示言語", "Language", "Langue"), selection: $language) {
                            ForEach(HelpLanguage.allCases) { Text($0.label).tag($0.rawValue) }
                        }
                        .pickerStyle(.segmented)
                    }
                    Button { path = [.profile] } label: {
                        Text(tr("プロフィールを登録する", "Set up my profile", "Remplir mon profil")).font(.headline).frame(maxWidth: .infinity).padding(.vertical, 6)
                    }
                    .buttonStyle(.borderedProminent).tint(Color.cwBordeaux)
                    Button(tr("あとで登録する", "Do it later", "Plus tard")) { later() }
                        .frame(maxWidth: .infinity)
                }
                .padding(24)
            }
            .background(WaveBackground())
            .navigationDestination(for: Step.self) { step in
                switch step {
                case .profile:
                    ProfileView(model: ProfileModel(api: api), onSaved: {
                        await onProfileSaved()
                        path = [.done]
                    }, cvHint: true)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button(tr("あとで", "Later", "Plus tard")) { later() } }
                    }
                case .done:
                    done
                }
            }
        }
        // Changer de langue redessine l'écran dans la nouvelle langue.
        .id(language)
        .interactiveDismissDisabled()
    }

    private var done: some View {
        List {
            Section {
                Text(tr("準備ができました", "You are all set", "Tout est prêt")).font(.title.bold()).foregroundStyle(Color.cwBlue700)
                Text(tr("まず何から始めますか？", "Where would you like to start?", "Par quoi voulez-vous commencer ?"))
            }
            Section {
                next(tr("応募を追加する", "Add an application", "Ajouter une candidature"), tr("選考の進み具合と締切をまとめます", "Track progress and deadlines", "Suivre l'avancement et les échéances"), "briefcase", .apps)
                next(tr("履歴書を作る", "Make my résumé", "Créer mon CV japonais"), tr("登録したプロフィールからPDFを作ります", "A PDF built from your profile", "Un PDF tiré de votre profil"), "doc.text", .documents)
                next(tr("ホームを見る", "Go to the home page", "Voir l'accueil"), tr("カレンダーと今日の予定", "Calendar and today's plans", "Calendrier et programme du jour"), "house", nil)
            }
        }
        .cleanList()
        .navigationBarBackButtonHidden()
    }

    private func next(_ title: String, _ detail: String, _ icon: String, _ tab: MainTab?) -> some View {
        Button { onDone(tab) } label: {
            Label {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.headline).foregroundStyle(Color.cwBlue800)
                    Text(detail).font(.footnote).foregroundStyle(.secondary)
                }
            } icon: { Image(systemName: icon) }
        }
    }

    private func later() {
        UserDefaults.standard.set(true, forKey: Self.key(me))
        onDone(nil)
    }
}
