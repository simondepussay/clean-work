import SwiftUI

/// Connexion et création de compte, dans l'app (authentification native, sans navigateur).
struct AuthView: View {
    @Environment(AppModel.self) private var model

    private enum Mode: Hashable { case signIn, signUp }

    @State private var mode: Mode = .signIn
    @State private var email = ""
    @State private var password = ""
    @State private var name = ""
    @State private var code = ""
    @State private var challenge: SignUpChallenge?
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        Form {
            if let challenge {
                Section {
                    TextField(tr("確認コード", "Code", "Code"), text: $code)
                        .keyboardType(.numberPad)
                        .textContentType(.oneTimeCode)
                } header: {
                    Text(tr("確認コード", "Verification code", "Code de vérification"))
                } footer: {
                    Text(tr("\(challenge.sentTo) にコードを送りました。", "A code was sent to \(challenge.sentTo).", "Un code a été envoyé à \(challenge.sentTo)."))
                }
                Section {
                    Button(tr("確認", "Verify", "Vérifier")) { run { try await model.finishSignUp(challenge, code: code) } }
                        .disabled(busy || code.count < challenge.codeLength)
                    Button(tr("コードを再送", "Resend code", "Renvoyer le code")) { run { self.challenge = try await challenge.resend() } }
                        .disabled(busy)
                }
            } else {
                Picker("", selection: $mode) {
                    Text(tr("サインイン", "Sign in", "Se connecter")).tag(Mode.signIn)
                    Text(tr("新規登録", "Sign up", "Créer un compte")).tag(Mode.signUp)
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)

                Section {
                    if mode == .signUp {
                        TextField(tr("名前", "Name", "Nom"), text: $name)
                            .textContentType(.name)
                    }
                    TextField(tr("メール", "Email", "E-mail"), text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField(tr("パスワード", "Password", "Mot de passe"), text: $password)
                        .textContentType(mode == .signUp ? .newPassword : .password)
                }
                Section {
                    Button(mode == .signIn ? tr("サインイン", "Sign in", "Se connecter") : tr("登録", "Create account", "Créer le compte")) { submit() }
                        .disabled(busy || !canSubmit)
                } footer: {
                    VStack(alignment: .leading, spacing: 6) {
                        if mode == .signUp {
                            Text(tr("登録すると、利用規約とプライバシーポリシーに同意したことになります。", "By creating an account, you agree to the terms and the privacy policy.", "En créant un compte, vous acceptez les conditions d'utilisation et la politique de confidentialité."))
                        }
                        LegalLinks()
                    }
                }
            }
            if let error {
                Section { Text(error).foregroundStyle(.red) }
            }
        }
        .overlay { if busy { ProgressView() } }
        .navigationTitle("Clean Work")
        .cleanList()
    }

    private var canSubmit: Bool {
        email.contains("@") && password.count >= 8 && (mode == .signIn || !name.trimmingCharacters(in: .whitespaces).isEmpty)
    }

    private func submit() {
        let email = email.trimmingCharacters(in: .whitespaces)
        switch mode {
        case .signIn:
            run { try await model.signIn(email: email, password: password) }
        case .signUp:
            run { challenge = try await model.signUp(email: email, password: password, name: name) }
        }
    }

    private func run(_ action: @escaping () async throws -> Void) {
        busy = true
        error = nil
        Task {
            do { try await action() } catch { self.error = Self.message(for: error) }
            busy = false
        }
    }

    static func message(for error: Error) -> String {
        switch error as? AccountError {
        case .emailAlreadyUsed: tr("このメールはすでに登録されています。", "This email is already registered.", "Cet e-mail est déjà enregistré.")
        case .passwordTooWeak: tr("パスワードが弱すぎます。", "The password is too weak.", "Le mot de passe est trop faible.")
        case .invalidEmail: tr("メールアドレスが正しくありません。", "The email address is not valid.", "L'adresse e-mail n'est pas valide.")
        case .invalidCode: tr("コードが正しくありません。", "The code is not correct.", "Le code n'est pas correct.")
        case .wrongEmailOrPassword: tr("メールまたはパスワードが違います。", "Wrong email or password.", "E-mail ou mot de passe incorrect.")
        case .notConfigured: tr("サインインは準備中です。", "Sign-in is not available yet.", "La connexion n'est pas encore disponible.")
        case .missingAttributes: tr("名前を入力してください。", "Please enter your name.", "Veuillez saisir votre nom.")
        case .other(let detail): tr("エラー", "Error: \(detail)", "Erreur : \(detail)")
        case nil: tr("エラー", "Error: \(error.localizedDescription)", "Erreur : \(error.localizedDescription)")
        }
    }
}
