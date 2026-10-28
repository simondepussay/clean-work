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

/// Écran principal une fois connecté : en-tête, intercalaires de classeur, puis la « feuille » de l'onglet choisi.
struct MainView: View {
    @Environment(AppModel.self) private var model
    @AppStorage(HelpLanguage.storageKey) private var language = HelpLanguage.deviceDefault.rawValue
    @State private var tab: MainTab = .home
    @State private var showingAccount = false
    /// Entretien prévu à préparer (bouton « 練習する » d'un entretien du calendrier).
    @State private var practice: InterviewTarget?

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
