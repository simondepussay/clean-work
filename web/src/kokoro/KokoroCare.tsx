import { useState } from "react";
import { setCharms, setCheerFrequency, type Charm, type CharmTiming, type Cheer, type CheerFrequency } from "../api";
import { useAuth } from "../auth/auth";
import { BellIcon, CloseIcon, PlusIcon } from "../icons";
import { type T3, type Tr } from "../i18n";

/**
 * Ce qui relie « こころ » au reste de l'app :
 *  - 今日のあなたへ : félicitations, réconfort, petites poussées vers 面接・書類・応募, mot du jour (api/src/lib/cheer.ts) ;
 *  - お守りの言葉 : des phrases à soi, reçues sur l'iPhone avant chaque entretien ;
 *  - はげましの通知 : un petit bouton (téléphone et tablette seulement) qui ouvre le choix du rythme.
 */

export type CheerOpen = (action: NonNullable<Cheer["action"]>) => void;

const ACTION_LABEL: Record<NonNullable<Cheer["action"]>["tab"], T3> = {
  interview: { ja: "面接の練習へ", en: "Practice now", fr: "S'entraîner" },
  documents: { ja: "ESを書く", en: "Write the ES", fr: "Écrire l'ES" },
  apps: { ja: "応募を見る", en: "See applications", fr: "Voir les candidatures" },
  kokoro: { ja: "日記を書く", en: "Write in the journal", fr: "Écrire dans le journal" },
};

/** 今日のあなたへ : les cartes du jour, puis le mot du jour en citation. */
export function Cheers({ cheers, tr, onOpen, onBreathe, onJournal }: {
  cheers: Cheer[]; tr: Tr; onOpen: CheerOpen; onBreathe: () => void; onJournal: () => void;
}) {
  const cards = cheers.filter((c) => c.kind !== "word").slice(0, 3);
  const word = cheers.find((c) => c.kind === "word");
  if (cards.length === 0 && !word) return null;
  const t = (x: T3) => tr(x);
  return (
    <section className="kokoro-block cheers" aria-label={tr({ ja: "今日のあなたへ", en: "For you today", fr: "Pour vous aujourd'hui" })}>
      {cards.length > 0 && (
        <ul className="cheer-cards">
          {cards.map((c) => (
            <li key={c.id} className={`cheer ${c.kind}`}>
              <strong>{t(c.title)}</strong>
              <p>{t(c.body)}</p>
              {c.kind === "care" && <button className="kokoro-soft-button" onClick={onBreathe}>{tr({ ja: "一緒に1分、深呼吸", en: "Breathe together for a minute", fr: "Respirer ensemble une minute" })}</button>}
              {c.action && c.kind !== "care" && c.action.tab !== "kokoro" && (
                <button className="kokoro-soft-button" onClick={() => onOpen(c.action!)}>{tr(ACTION_LABEL[c.action.tab])} →</button>
              )}
              {c.action?.tab === "kokoro" && c.kind === "nudge" && <button className="kokoro-soft-button" onClick={onJournal}>{tr(ACTION_LABEL.kokoro)}</button>}
            </li>
          ))}
        </ul>
      )}
      {word && (
        <blockquote className="cheer-word">
          <p>{t(word.body)}</p>
          <cite>{t(word.title)}</cite>
        </blockquote>
      )}
    </section>
  );
}

const TIMINGS: { id: CharmTiming; label: T3 }[] = [
  { id: "eve", label: { ja: "前日の夜（21時）", en: "The evening before (9 pm)", fr: "La veille au soir (21 h)" } },
  { id: "morning", label: { ja: "当日の朝（7時）", en: "That morning (7 am)", fr: "Le matin même (7 h)" } },
  { id: "hour", label: { ja: "1時間前", en: "1 hour before", fr: "1 heure avant" } },
  { id: "tenmin", label: { ja: "10分前", en: "10 minutes before", fr: "10 minutes avant" } },
];
const SUGGESTIONS: T3[] = [
  { ja: "いつも通りで大丈夫。", en: "Just be yourself.", fr: "Reste toi-même." },
  { ja: "準備してきた自分を信じて。", en: "Trust the work you've done.", fr: "Fais confiance à ta préparation." },
  { ja: "ゆっくり話そう。", en: "Speak slowly.", fr: "Parle lentement." },
  { ja: "笑顔で入ろう。", en: "Walk in with a smile.", fr: "Entre avec le sourire." },
];

/** お守りの言葉 : jusqu'à 6 phrases, chacune avec son moment. */
export function Charms({ initial, tr, hasDevice }: { initial: Charm[]; tr: Tr; hasDevice: boolean }) {
  const auth = useAuth();
  const [charms, setList] = useState<Charm[]>(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const dirty = JSON.stringify(charms) !== JSON.stringify(initial) && state !== "saved";

  const update = (next: Charm[]) => { setList(next); setState("idle"); };
  async function save() {
    const token = await auth.getToken();
    if (!token) return;
    setState("saving");
    const res = await setCharms(token, charms.filter((c) => c.text.trim())).catch(() => null);
    setState(res?.ok ? "saved" : "error");
  }

  return (
    <section className="kokoro-block charms" aria-label={tr({ ja: "お守りの言葉", en: "Lucky-charm words", fr: "Mots porte-bonheur" })}>
      <h3>{tr({ ja: "お守りの言葉", en: "Lucky-charm words", fr: "Mots porte-bonheur" })}</h3>
      <p className="kokoro-sub">{tr({
        ja: "面接の前に、自分に届けたい言葉。iPhoneに通知で届きます（面接の日付と時刻が入っているとき）。",
        en: "Words you want to receive before an interview. They arrive as iPhone notifications (when the interview has a date and time).",
        fr: "Les mots que vous voulez recevoir avant un entretien. Ils arrivent en notification sur l'iPhone (quand l'entretien a une date et une heure).",
      })}</p>
      {charms.length > 0 && (
        <ul className="charm-list">
          {charms.map((c, i) => (
            <li key={i}>
              <input value={c.text} maxLength={80} aria-label={`${tr({ ja: "言葉", en: "Words", fr: "Mots" })} ${i + 1}`}
                onChange={(e) => update(charms.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
              <select value={c.when} aria-label={tr({ ja: "届くタイミング", en: "When", fr: "Quand" })}
                onChange={(e) => update(charms.map((x, j) => (j === i ? { ...x, when: e.target.value as CharmTiming } : x)))}>
                {TIMINGS.map((t) => <option key={t.id} value={t.id}>{tr(t.label)}</option>)}
              </select>
              <button className="charm-remove" aria-label={tr({ ja: "削除", en: "Remove", fr: "Supprimer" })} onClick={() => update(charms.filter((_, j) => j !== i))}><CloseIcon size={16} /></button>
            </li>
          ))}
        </ul>
      )}
      {charms.length < 6 && (
        <div className="charm-add">
          {SUGGESTIONS.filter((s) => !charms.some((c) => c.text === tr(s))).slice(0, 3).map((s) => (
            <button key={s.ja} onClick={() => update([...charms, { text: tr(s), when: "hour" }])}><PlusIcon size={14} /> {tr(s)}</button>
          ))}
          <button onClick={() => update([...charms, { text: "", when: "hour" }])}><PlusIcon size={14} /> {tr({ ja: "自分の言葉", en: "My own words", fr: "Mes propres mots" })}</button>
        </div>
      )}
      <div className="charm-save">
        {(dirty || state === "saving") && <button className="primary" disabled={state === "saving"} onClick={save}>{tr({ ja: "保存", en: "Save", fr: "Enregistrer" })}</button>}
        {state === "saved" && <span className="muted small" role="status">{hasDevice
          ? tr({ ja: "保存しました。iPhoneに届きます。", en: "Saved. They'll arrive on your iPhone.", fr: "Enregistré. Ils arriveront sur votre iPhone." })
          : tr({ ja: "保存しました。iPhoneアプリにサインインすると届きます。", en: "Saved. Sign in on the iPhone app to receive them.", fr: "Enregistré. Connectez-vous dans l'app iPhone pour les recevoir." })}</span>}
        {state === "error" && <span className="muted small" role="alert">{tr({ ja: "保存できませんでした。", en: "Could not save.", fr: "Enregistrement impossible." })}</span>}
      </div>
    </section>
  );
}

/**
 * はげましの通知 : un petit bouton « 🔔 毎日 » ; un clic ouvre le choix du rythme (ou l'arrêt).
 * Les encouragements arrivent en notification : le bouton ne s'affiche que sur téléphone et tablette (CSS).
 */
const RHYTHMS: { id: CheerFrequency; label: T3 }[] = [
  { id: "daily", label: { ja: "毎日", en: "Every day", fr: "Chaque jour" } },
  { id: "every2", label: { ja: "2日に1回", en: "Every 2 days", fr: "Tous les 2 jours" } },
  { id: "weekly", label: { ja: "週に1回", en: "Once a week", fr: "Chaque semaine" } },
  { id: "off", label: { ja: "オフ", en: "Off", fr: "Désactivés" } },
];

export function CheerRhythm({ initial, tr }: { initial: CheerFrequency; tr: Tr }) {
  const auth = useAuth();
  const [frequency, setFrequency] = useState<CheerFrequency>(initial);
  const [open, setOpen] = useState(false);
  async function choose(f: CheerFrequency) {
    setFrequency(f);
    setOpen(false);
    const token = await auth.getToken();
    if (token) await setCheerFrequency(token, f).catch(() => null);
  }
  const on = frequency !== "off";
  const name = tr({ ja: "はげましの通知", en: "Encouragement", fr: "Encouragements" });
  return (
    <div className="cheer-toggle">
      <button className={on ? "on" : ""} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <BellIcon size={14} />
        {on
          ? <>{name}<b>{tr(RHYTHMS.find((r) => r.id === frequency)!.label)}</b></>
          : tr({ ja: "はげましを受け取る", en: "Get encouragement", fr: "Activer les encouragements" })}
      </button>
      {open && (
        <div className="cheer-options" role="radiogroup" aria-label={name}>
          {RHYTHMS.map((r) => (
            <button key={r.id} role="radio" aria-checked={frequency === r.id} onClick={() => choose(r.id)}>{tr(r.label)}</button>
          ))}
          <small>{tr({ ja: "朝8時に届きます", en: "Arrives at 8 am", fr: "Arrive à 8 h" })}</small>
        </div>
      )}
    </div>
  );
}
