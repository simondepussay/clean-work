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
                    TextField("確認コード / Code", text: $code)
                        .keyboardType(.numberPad)
                        .textContentType(.oneTimeCode)
                } header: {
                    Text("確認コード / Verification code")
                } footer: {
                    Text("\(challenge.sentTo) にコードを送りました。/ A code was sent to \(challenge.sentTo).")
                }
                Section {
                    Button("確認 / Verify") { run { try await model.finishSignUp(challenge, code: code) } }
                        .disabled(busy || code.count < challenge.codeLength)
                    Button("コードを再送 / Resend code") { run { self.challenge = try await challenge.resend() } }
                        .disabled(busy)
                }
            } else {
                Picker("", selection: $mode) {
                    Text("サインイン / Sign in").tag(Mode.signIn)
                    Text("新規登録 / Sign up").tag(Mode.signUp)
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)

                Section {
                    if mode == .signUp {
                        TextField("名前 / Name", text: $name)
                            .textContentType(.name)
                    }
                    TextField("メール / Email", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField("パスワード / Password", text: $password)
                        .textContentType(mode == .signUp ? .newPassword : .password)
                }
                Section {
                    Button(mode == .signIn ? "サインイン / Sign in" : "登録 / Create account") { submit() }
                        .disabled(busy || !canSubmit)
                } footer: {
                    VStack(alignment: .leading, spacing: 6) {
                        if mode == .signUp {
                            Text("登録すると、利用規約とプライバシーポリシーに同意したことになります。/ By creating an account, you agree to the terms and the privacy policy.")
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
        .navigationTitle("就活パイロット")
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
        case .emailAlreadyUsed: "このメールはすでに登録されています。/ This email is already registered."
        case .passwordTooWeak: "パスワードが弱すぎます。/ The password is too weak."
        case .invalidEmail: "メールアドレスが正しくありません。/ The email address is not valid."
        case .invalidCode: "コードが正しくありません。/ The code is not correct."
        case .wrongEmailOrPassword: "メールまたはパスワードが違います。/ Wrong email or password."
        case .notConfigured: "サインインは準備中です。/ Sign-in is not available yet."
        case .missingAttributes: "名前を入力してください。/ Please enter your name."
        case .other(let detail): "エラー / Error: \(detail)"
        case nil: "エラー / Error: \(error.localizedDescription)"
        }
    }
}
