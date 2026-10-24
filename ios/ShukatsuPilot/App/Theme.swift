import SwiftUI

/// Couleurs de Clean Work (les mêmes que le site) : blanc, bleus, bordeaux.
/// Le bleu structure, le bordeaux attire l'œil (marque, urgent, action principale).
extension Color {
    static let cwBlue950 = Color(red: 0.047, green: 0.122, blue: 0.227)   // #0c1f3a, texte
    static let cwBlue800 = Color(red: 0.086, green: 0.227, blue: 0.420)   // #163a6b
    static let cwBlue700 = Color(red: 0.114, green: 0.310, blue: 0.569)   // #1d4f91, principal
    static let cwBlue500 = Color(red: 0.239, green: 0.486, blue: 0.788)   // #3d7cc9
    static let cwBlue300 = Color(red: 0.616, green: 0.749, blue: 0.910)   // #9dbfe8
    static let cwBlue100 = Color(red: 0.890, green: 0.929, blue: 0.976)   // #e3edf9
    static let cwBlue50 = Color(red: 0.953, green: 0.969, blue: 0.988)    // #f3f7fc
    static let cwBordeaux = Color(red: 0.482, green: 0.118, blue: 0.180)  // #7b1e2e
    static let cwBordeaux50 = Color(red: 0.973, green: 0.925, blue: 0.933) // #f8ecee
    static let cwLine = Color(red: 0.839, green: 0.886, blue: 0.945)      // #d6e2f1
    static let cwMuted = Color(red: 0.357, green: 0.420, blue: 0.502)     // #5b6b80
}

/// Lignes de vague du fond (reprises du site KOTA) : des cercles concentriques très pâles
/// qui s'élargissent depuis le bas de l'écran.
struct WaveBackground: View {
    var body: some View {
        Canvas { context, size in
            let center = CGPoint(x: size.width / 2, y: size.height * 1.35)
            var radius: CGFloat = 54
            let maxRadius = hypot(size.width, size.height * 1.35) + 60
            while radius < maxRadius {
                let rect = CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2)
                context.stroke(Path(ellipseIn: rect), with: .color(Color.cwBlue700.opacity(0.07)), lineWidth: 3)
                radius += 57
            }
        }
        .background(LinearGradient(colors: [.white, .cwBlue50], startPoint: .top, endPoint: .bottom))
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}

/// Marque « Clean Work » : un rond bleu, un trait de vague blanc et un point bordeaux.
struct LogoMark: View {
    var size: CGFloat = 30

    var body: some View {
        Canvas { context, canvas in
            let s = canvas.width / 32
            context.fill(Path(ellipseIn: CGRect(x: s, y: s, width: 30 * s, height: 30 * s)), with: .color(.cwBlue700))
            var wave = Path()
            wave.move(to: CGPoint(x: 6 * s, y: 18 * s))
            wave.addCurve(to: CGPoint(x: 16 * s, y: 18 * s), control1: CGPoint(x: 9.3 * s, y: 14 * s), control2: CGPoint(x: 12.7 * s, y: 14 * s))
            wave.addCurve(to: CGPoint(x: 26 * s, y: 18 * s), control1: CGPoint(x: 19.3 * s, y: 22 * s), control2: CGPoint(x: 22.7 * s, y: 22 * s))
            context.stroke(wave, with: .color(.white), style: StrokeStyle(lineWidth: 2.4 * s, lineCap: .round))
            context.fill(Path(ellipseIn: CGRect(x: 20.4 * s, y: 7.4 * s, width: 5.2 * s, height: 5.2 * s)), with: .color(.cwBordeaux))
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// Carte blanche à bord fin, comme sur le site.
struct CardStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(16)
            .background(.white, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.cwLine))
            .shadow(color: Color.cwBlue950.opacity(0.06), radius: 10, y: 4)
    }
}

extension View {
    func card() -> some View { modifier(CardStyle()) }
}

/// Bouton principal (bordeaux) et secondaire (bord bleu), en pilule.
struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 18).padding(.vertical, 10)
            .background(Color.cwBordeaux.opacity(configuration.isPressed ? 0.85 : 1), in: Capsule())
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(Color.cwBlue800)
            .padding(.horizontal, 14).padding(.vertical, 8)
            .background(configuration.isPressed ? Color.cwBlue50 : .white, in: Capsule())
            .overlay(Capsule().stroke(Color.cwBlue300))
    }
}

/// Animation d'attente : arc bleu → bordeaux qui tourne (comme sur le site).
struct ArcLoader: View {
    var size: CGFloat = 40
    @State private var turning = false

    var body: some View {
        ZStack {
            Circle().stroke(Color.cwBlue100, lineWidth: size / 9.6)
            Circle()
                .trim(from: 0, to: 0.3)
                .stroke(AngularGradient(colors: [.cwBlue300, .cwBlue700, .cwBordeaux], center: .center),
                        style: StrokeStyle(lineWidth: size / 9.6, lineCap: .round))
                .rotationEffect(.degrees(turning ? 360 : 0))
                .animation(.linear(duration: 1.1).repeatForever(autoreverses: false), value: turning)
        }
        .frame(width: size, height: size)
        .onAppear { turning = true }
        .accessibilityLabel(tr("読み込み中", "Loading", "Chargement"))
    }
}

/// Listes et formulaires dans le style Clean Work : fond bleu très pâle, cellules blanches, titre compact.
struct CleanListStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .scrollContentBackground(.hidden)
            .background(Color.cwBlue50)
            .tint(Color.cwBlue700)
            .navigationBarTitleDisplayMode(.inline)
    }
}

extension View {
    func cleanList() -> some View { modifier(CleanListStyle()) }
}
