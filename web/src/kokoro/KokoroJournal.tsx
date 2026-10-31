import { useEffect, useState } from "react";
import { getJournal, writeJournal, type JournalEntry } from "../api";
import { useAuth } from "../auth/auth";
import { CheckIcon } from "../icons";
import { formatDay, type Tr } from "../i18n";

/**
 * 日記 : le journal intime de « こころ ». Une page par jour ; on écrit celle d'aujourd'hui, on relit les
 * précédentes. Écrire ce qu'on ressent aide à le poser (écriture expressive, Pennebaker).
 * Les pages ne vont jamais à l'IA et ne sont lues qu'ici, à l'ouverture de l'onglet.
 */
export function Journal({ today, tr }: { today: string; tr: Tr }) {
  const auth = useAuth();
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [shown, setShown] = useState(5);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    auth.getToken()
      .then((t) => (t ? getJournal(t) : null))
      .then((r) => {
        const list = r?.ok && Array.isArray(r.value?.entries) ? r.value.entries : [];
        setEntries(list);
        const mine = list.find((e) => e.date === today)?.text ?? "";
        setText(mine);
        setSaved(mine);
      })
      .catch(() => setEntries([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  async function save() {
    setState("saving");
    const token = await auth.getToken();
    const res = token ? await writeJournal(token, today, text).catch(() => null) : null;
    if (!res?.ok) return setState("error");
    // Le serveur renvoie la page telle qu'enregistrée ; à défaut, le texte envoyé sans les blancs de fin.
    const sent = text.trimEnd();
    const entry = res.value?.entry ?? (sent ? { date: today, text: sent, updatedAt: new Date().toISOString() } : null);
    setEntries((list) => [...(entry ? [entry] : []), ...(list ?? []).filter((e) => e.date !== today)]);
    setSaved(entry?.text ?? "");
    setSavedAt(new Date());
    setState("saved");
  }

  const past = (entries ?? []).filter((e) => e.date !== today);
  // Le serveur retire les espaces et retours à la ligne de la fin : on compare sans eux.
  const dirty = text.trimEnd() !== saved;
  const time = savedAt?.toLocaleTimeString(tr.lang === "ja" ? "ja-JP" : tr.lang === "fr" ? "fr-FR" : "en-US", { hour: "2-digit", minute: "2-digit" });

  return (
    <section className="kokoro-block journal" aria-label={tr({ ja: "日記", en: "Journal", fr: "Journal intime" })}>
      <h3>{tr({ ja: "日記", en: "Journal", fr: "Journal intime" })}</h3>
      <p className="kokoro-sub">{tr({ ja: "あなただけのページ。AIには送りません。", en: "Pages for you alone. Never sent to the AI.", fr: "Des pages rien que pour toi. Jamais envoyées à l'IA." })}</p>
      <div className="journal-page">
        <p className="journal-date">{formatDay(today, tr.lang)}</p>
        <textarea value={text} rows={6} maxLength={4000} disabled={entries === null}
          onChange={(e) => { setText(e.target.value); setState("idle"); }}
          aria-label={tr({ ja: "今日の日記", en: "Today's page", fr: "La page d'aujourd'hui" })}
          placeholder={tr({ ja: "今日あったこと、感じたこと…", en: "What happened today, how you felt…", fr: "Ce qui s'est passé aujourd'hui, ce que tu as ressenti…" })} />
      </div>
      <div className="actions journal-actions">
        <button className={`primary${state === "saved" && !dirty ? " done" : ""}`} onClick={save} disabled={!dirty || state === "saving"}>
          {state === "saving"
            ? tr({ ja: "保存中…", en: "Saving…", fr: "Enregistrement…" })
            : state === "saved" && !dirty
              ? <><CheckIcon size={16} /> {tr({ ja: "保存しました", en: "Saved", fr: "Enregistré" })}</>
              : tr({ ja: "保存", en: "Save", fr: "Enregistrer" })}
        </button>
        {state === "saved" && !dirty && time && <span role="status" className="muted small">{tr({ ja: `${time}に保存`, en: `Saved at ${time}`, fr: `Enregistré à ${time}` })}</span>}
        {state === "error" && <span role="alert" className="journal-error small">{tr({ ja: "保存できませんでした。もう一度お試しください。", en: "Could not save. Please try again.", fr: "Enregistrement impossible. Réessaie." })}</span>}
      </div>
      {past.length > 0 && (
        <ul className="journal-past">
          {past.slice(0, shown).map((e) => (
            <li key={e.date}>
              <button className="journal-entry" aria-expanded={open === e.date} onClick={() => setOpen(open === e.date ? null : e.date)}>
                <span className="journal-date">{formatDay(e.date, tr.lang)}</span>
                <span className={open === e.date ? "journal-text" : "journal-text clamp"}>{e.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {past.length > shown && (
        <button className="link" onClick={() => setShown((n) => n + 10)}>{tr({ ja: "もっと見る", en: "Show more", fr: "Voir plus" })}</button>
      )}
    </section>
  );
}
