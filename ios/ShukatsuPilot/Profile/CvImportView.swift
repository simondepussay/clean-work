import SwiftUI
import UniformTypeIdentifiers

/// « Remplir depuis un CV » : un PDF (texte lu sur l'iPhone) ou le texte collé ;
/// l'IA range les informations, puis le formulaire du profil est rempli.
struct CvImportView: View {
    let api: APIClient
    let onImported: (CvImport) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var picking = false
    @State private var busy = false
    @State private var message: String?

    var body: some View {
        Form {
            Section {
                Button(tr("PDFファイルを選ぶ", "Choose a PDF file", "Choisir un fichier PDF"), systemImage: "doc.richtext") { picking = true }
            }
            Section(tr("またはCVの文字を貼り付け", "Or paste the CV text", "Ou collez le texte du CV")) {
                TextEditor(text: $text).frame(minHeight: 180)
            }
            Section {
                Button {
                    Task { await run() }
                } label: {
                    HStack {
                        Text(tr("読み込む", "Import", "Importer")).bold()
                        if busy { Spacer(); ArcLoader(size: 22) }
                    }
                }
                .disabled(busy || text.trimmingCharacters(in: .whitespacesAndNewlines).count < 30)
                if let message { Text(message).font(.callout).foregroundStyle(Color.cwBordeaux) }
            } footer: {
                Text(tr("フォームに入力されるだけで、保存はされません。確認してから保存してください。",
                        "This only fills in the form; nothing is saved until you check it and press Save.",
                        "Le formulaire est seulement rempli : rien n'est enregistré avant que vous vérifiiez et enregistriez."))
            }
        }
        .navigationTitle(tr("CVから入力", "Fill in from a CV", "Remplir depuis un CV"))
        .cleanList()
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button(tr("閉じる", "Close", "Fermer")) { dismiss() } }
        }
        .fileImporter(isPresented: $picking, allowedContentTypes: [.pdf, .plainText]) { result in
            guard case .success(let url) = result else { return }
            read(url)
        }
    }

    private func read(_ url: URL) {
        message = nil
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        let content = url.pathExtension.lowercased() == "pdf" ? CvText.fromPDF(url) : ((try? String(contentsOf: url, encoding: .utf8)) ?? "")
        if content.count < 30 {
            message = tr("このPDFから文字を読み取れませんでした（画像のPDFかもしれません）。CVの文字を貼り付けてください。",
                         "No text could be read from this file (it may be an image). Paste your CV text instead.",
                         "Aucun texte lisible dans ce fichier (c'est peut-être une image). Collez plutôt le texte de votre CV.")
        }
        text = String(content.prefix(15000))
    }

    private func run() async {
        busy = true
        message = nil
        defer { busy = false }
        do {
            onImported(try await api.importCv(text))
            dismiss()
        } catch CvImportError.limit {
            message = tr("AIの利用回数の上限です", "AI limit reached", "Limite d'IA atteinte")
        } catch CvImportError.tooShort {
            message = tr("CVの文字が少なすぎます", "The CV text is too short", "Le texte du CV est trop court")
        } catch {
            message = tr("読み込めませんでした。もう一度試してください", "Could not import; please try again", "Import impossible ; réessayez")
        }
    }
}
