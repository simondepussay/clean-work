import { useEffect, useRef, useState } from "react";
import { getNotes, saveNotes } from "../api";
import { useAuth } from "../auth/auth";
import { useTr } from "../i18n";

const MAX = 10000;

/**
 * Bloc-notes libre, en bas de l'accueil : ce qu'on ne sait pas encore où ranger (une idée de 自己PR,
 * une question pour le 説明会…). Enregistré tout seul, un instant après la dernière frappe.
 * Un agent IA relié au compte peut y ajouter des lignes (jamais en effacer).
 */
export function NotesCard() {
  const auth = useAuth();
  const tr = useTr();
  const [text, setText] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef("");

  useEffect(() => {
    let alive = true;
    auth.getToken().then((t) => (t ? getNotes(t) : null)).then((n) => { if (alive) setText(n?.text ?? ""); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    const token = await auth.getToken();
    if (!token) return;
    setState("saving");
    const saved = await saveNotes(token, latest.current).catch(() => null);
    setState(saved ? "saved" : "error");
  };

  // Rien de perdu si on change d'onglet juste après avoir écrit.
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); void save(); } },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);

  const change = (value: string) => {
    setText(value);
    latest.current = value;
    setState("idle");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = undefined; void save(); }, 900);
  };

  const status = {
    idle: "", saving: tr({ ja: "保存中…", en: "Saving…", fr: "Enregistrement…" }),
    saved: tr({ ja: "保存しました", en: "Saved", fr: "Enregistré" }),
    error: tr({ ja: "保存できませんでした。もう一度お試しください", en: "Couldn't save. Please try again", fr: "Échec de l'enregistrement. Réessayez" }),
  }[state];

  return (
    <section className="card notes-card" aria-labelledby="notes-title">
      <div className="notes-head">
        <h2 id="notes-title">{tr({ ja: "メモ帳", en: "Notepad", fr: "Bloc-notes" })}</h2>
        <span className={`notes-status${state === "error" ? " error" : ""}`} aria-live="polite">{status}</span>
      </div>
      <textarea
        className="notes-area"
        value={text ?? ""}
        disabled={text === null}
        maxLength={MAX}
        onChange={(e) => change(e.target.value)}
        onBlur={() => { if (timer.current) { clearTimeout(timer.current); timer.current = undefined; void save(); } }}
        placeholder={tr({
          ja: "自己PRのアイデア、説明会で聞きたいこと、あとで調べること…",
          en: "Self-PR ideas, questions for the info session, things to look up…",
          fr: "Idées de 自己PR, questions pour le 説明会, choses à vérifier…",
        })}
        aria-label={tr({ ja: "メモ帳", en: "Notepad", fr: "Bloc-notes" })}
      />
      <p className="muted notes-foot">{text !== null && text.length > MAX * 0.9 ? `${text.length} / ${MAX}` : tr({ ja: "自動で保存されます", en: "Saved automatically", fr: "Enregistré automatiquement" })}</p>
    </section>
  );
}
