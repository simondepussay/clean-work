import SwiftUI
import UserNotifications

@main
struct ShukatsuPilotApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @State private var model = AppModel.live()

    var body: some Scene {
        WindowGroup {
            RootView().environment(model)
        }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model
    /// L'écran d'ouverture reste un court instant, le temps que l'accueil charge ses données dessous.
    @State private var splash = true

    var body: some View {
        ZStack {
            content
            if splash {
                SplashView().transition(.opacity).zIndex(1)
            }
        }
        .task {
            try? await Task.sleep(for: .seconds(SplashView.duration))
            withAnimation(.easeInOut(duration: 0.4)) { splash = false }
        }
    }

    @ViewBuilder private var content: some View {
        switch model.phase {
        case .disabled:
            ContentUnavailableView(tr("サインインは準備中です", "Sign-in coming soon", "Connexion bientôt disponible"), systemImage: "clock")
        case .signedOut:
            NavigationStack { AuthView() }
        case .signedIn:
            MainView()
        }
    }
}

/// Reçoit d'iOS le jeton APNs (S26) et affiche les notifications même quand l'app est ouverte.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Task { @MainActor in await PushRegistration.shared.didReceive(deviceToken: deviceToken) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // Pas de jeton (réseau, simulateur ancien…) : les rappels locaux restent en place.
        print("APNs : enregistrement impossible — \(error.localizedDescription)")
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }
}
