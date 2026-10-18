import SwiftUI

@main
struct ShukatsuPilotApp: App {
    @State private var model = AppModel.live()

    var body: some Scene {
        WindowGroup {
            RootView().environment(model)
        }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        NavigationStack {
            switch model.phase {
            case .disabled:
                ContentUnavailableView("サインインは準備中です", systemImage: "clock",
                                       description: Text("Sign-in coming soon"))
            case .signedOut:
                AuthView()
            case .signedIn:
                HomeView()
            }
        }
    }
}
