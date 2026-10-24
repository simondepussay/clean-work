import SwiftUI

/// Écran d'ouverture : prend le relais de l'écran de lancement d'iOS (même logo, même place),
/// puis montre le nom, le slogan, les vagues et l'arc de chargement, le temps que l'app se prépare.
struct SplashView: View {
    /// Temps d'affichage, en secondes (RootView le retire ensuite en fondu).
    static let duration = 2.0
    @State private var shown = false

    var body: some View {
        ZStack {
            WaveBackground()
            // Exactement au centre de l'écran, comme LaunchLogo : pas de saut au passage.
            LogoMark(size: 96)
            VStack(spacing: 10) {
                Text("Clean Work")
                    .font(.system(size: 30, weight: .bold))
                    .foregroundStyle(Color.cwBlue800)
                Text(tr("迷わない毎日へ。", "Toward days without feeling lost.", "Vers des journées où l'on ne se perd plus."))
                    .font(.callout)
                    .foregroundStyle(Color.cwMuted)
                ArcLoader(size: 28)
                    .padding(.top, 28)
            }
            .multilineTextAlignment(.center)
            .padding(.horizontal, 32)
            .offset(y: 140)
            .opacity(shown ? 1 : 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .ignoresSafeArea()
        .onAppear { withAnimation(.easeOut(duration: 0.5)) { shown = true } }
    }
}

#Preview { SplashView() }
