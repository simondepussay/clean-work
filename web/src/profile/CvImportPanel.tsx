import { useState } from "react";
import { importCv, type CvImport } from "../api";
import { useAuth } from "../auth/auth";
import { formatDay, useTr } from "../i18n";
import { DocIcon } from "../icons";
import { Loader } from "../Loader";

/**
 * « Importer un CV » : un PDF (texte extrait dans le navigateur) ou le texte collé ; l'IA range
 * les informations dans le profil, puis le formulaire est rempli — l'utilisateur vérifie et enregistre.
 */
export function CvImportPanel({ onImported, defaultOpen = false }: { onImported: (cv: CvImport) => void; /** Déjà déplié : à la création du compte, c'est la première chose proposée. */ defaultOpen?: boolean }) {
  const auth = useAuth();
  const tr = useTr();
  const [open, setOpen] = useState(defaultOpen);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"reading" | "sorting" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function readFile(file: File) {
    setMessage(null);
    setBusy("reading");
    try {
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        const { pdfToText } = await import("./pdfText");
        const extracted = await pdfToText(file);
        if (extracted.length < 30) {
          setMessage(tr({
            ja: "このPDFから文字を読み取れませんでした（画像のPDFかもしれません）。CVの文字を下に貼り付けてください。",
            en: "No text could be read from this PDF (it may be an image). Paste your CV text below instead.",
            fr: "Aucun texte lisible dans ce PDF (c'est peut-être une image). Collez plutôt le texte de votre CV ci-dessous.",
          }));
        }
        setText(extracted);
      } else {
        setText(await file.text());
      }
    } catch {
      setMessage(tr({ ja: "ファイルを読めませんでした", en: "Could not read the file", fr: "Impossible de lire le fichier" }));
    } finally {
      setBusy(null);
    }
  }

  async function run() {
    setMessage(null);
    setBusy("sorting");
    try {
      const token = await auth.getToken();
      if (!token) throw new Error("non connecté");
      const outcome = await importCv(token, text);
      if (outcome.ok) {
        onImported(outcome.profile);
        setOpen(false);
        setText("");
      } else if (outcome.error === "limit") {
        setMessage(tr({ ja: `AIの利用回数の上限です（${formatDay(outcome.retryAfter, "ja", false)}から）`, en: `AI limit reached (available again on ${formatDay(outcome.retryAfter, "en", false)})`, fr: `Limite d'IA atteinte (de nouveau le ${formatDay(outcome.retryAfter, "fr", false)})` }));
      } else if (outcome.error === "too_short") {
        setMessage(tr({ ja: "CVの文字が少なすぎます", en: "The CV text is too short", fr: "Le texte du CV est trop court" }));
      } else {
        setMessage(tr({ ja: "読み込めませんでした。もう一度試してください", en: "Could not import; please try again", fr: "Import impossible ; réessayez" }));
      }
    } catch {
      setMessage(tr({ ja: "読み込めませんでした。もう一度試してください", en: "Could not import; please try again", fr: "Import impossible ; réessayez" }));
    } finally {
      setBusy(null);
    }
  }

  if (!open) {
    return (
      <button type="button" className="cv-import-open" onClick={() => setOpen(true)}>
        <DocIcon size={16} /> {tr({ ja: "CVから入力", en: "Fill in from a CV", fr: "Remplir depuis un CV" })}
      </button>
    );
  }

  return (
    <section className="cv-import card" aria-label={tr({ ja: "CVから入力", en: "Fill in from a CV", fr: "Remplir depuis un CV" })}>
      <h3>{tr({ ja: "CVから入力", en: "Fill in from a CV", fr: "Remplir depuis un CV" })}</h3>
      <label className="file">
        <span>{tr({ ja: "PDFファイル", en: "PDF file", fr: "Fichier PDF" })}</span>
        <input type="file" accept=".pdf,.txt,application/pdf,text/plain" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
      </label>
      <label>
        <span>{tr({ ja: "またはCVの文字を貼り付け", en: "Or paste the CV text", fr: "Ou collez le texte du CV" })}</span>
        <textarea rows={8} value={text} maxLength={15000} onChange={(e) => setText(e.target.value)} />
      </label>
      {busy && <Loader size={30} />}
      {message && <p role="alert" className="notice">{message}</p>}
      <div className="actions">
        <button type="button" className="primary" onClick={run} disabled={!!busy || text.trim().length < 30}>
          {tr({ ja: "読み込む", en: "Import", fr: "Importer" })}
        </button>
        <button type="button" onClick={() => setOpen(false)}>{tr({ ja: "閉じる", en: "Close", fr: "Fermer" })}</button>
      </div>
      <p className="muted small">{tr({
        ja: "フォームに入力されるだけで、保存はされません。確認してから保存してください。",
        en: "This only fills in the form; nothing is saved until you check it and press Save.",
        fr: "Le formulaire est seulement rempli : rien n'est enregistré avant que vous vérifiiez et enregistriez.",
      })}</p>
    </section>
  );
}
