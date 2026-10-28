import { useState } from "react";
import { sendTestPush, setCharms, setCheerFrequency, type Charm, type CharmTiming, type Cheer, type CheerFrequency, type Kokoro } from "../api";
import { useAuth } from "../auth/auth";
import { CloseIcon, PhoneIcon, PlusIcon } from "../icons";
import { formatDay, type T3, type Tr } from "../i18n";

/**
 * Ce qui relie « こころ » au reste de l'app :
 *  - 今日のあなたへ : félicitations, réconfort, petites poussées vers 面接・書類・応募, mot du jour (api/src/lib/cheer.ts) ;
 *  - お守りの言葉 : des phrases à soi, reçues sur l'iPhone avant chaque entretien ;
 *  - 通知 : l'iPhone relié au compte, une notification d'essai, et le rythme des encouragements.
 */

export type CheerOpen = (action: NonNullable<Cheer["action"]>) => void;

const ACTION_LABEL: Record<NonNullable<Cheer["action"]>["tab"], T3> = {
  interview: { ja: "面接の練習へ", en: "Practice now", fr: "S'entraîner" },
  documents: { ja: "ESを書く", en: "Write the ES", fr: "Écrire l'ES" },
  apps: { ja: "応募を見る", en: "See applications", fr: "Voir les candidatures" },
  kokoro: { ja: "書いてみる", en: "Write them", fr: "Les écrire" },
};

/** 今日のあなたへ : les cartes du jour, puis le mot du jour en citation. */
export function Cheers({ cheers, tr, onOpen, onBreathe, onValues }: {
  cheers: Cheer[]; tr: Tr; onOpen: CheerOpen; onBreathe: () => void; onValues: () => void;
}) {
  const cards = cheers.filter((c) => c.kind !== "word").slice(0, 3);
  const word = cheers.find((c) => c.kind === "word");
  if (cards.length === 0 && !word) return null;
  const t = (x: T3) => tr(x);
  return (
    <section className="kokoro-block cheers" aria-label={tr({ ja: "今日のあなたへ", en: "For you today", fr: "Pour vous aujourd'hui" })}>
      <h3>{tr({ ja: "今日のあなたへ", en: "For you today", fr: "Pour vous aujourd'hui" })}</h3>
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
              {c.action?.tab === "kokoro" && c.kind === "nudge" && <button className="kokoro-soft-button" onClick={onValues}>{tr(ACTION_LABEL.kokoro)}</button>}
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

const FREQUENCIES: { id: CheerFrequency; label: T3 }[] = [
  { id: "daily", label: { ja: "毎日", en: "Every day", fr: "Chaque jour" } },
  { id: "every2", label: { ja: "2日に1回", en: "Every 2 days", fr: "Tous les 2 jours" } },
  { id: "weekly", label: { ja: "週に1回", en: "Once a week", fr: "Une fois par semaine" } },
  { id: "off", label: { ja: "オフ", en: "Off", fr: "Désactivé" } },
];

/** 通知 : l'iPhone relié au compte, l'essai, le rythme. */
export function Notifications({ data, tr, onOpenBeta }: { data: Kokoro; tr: Tr; onOpenBeta: () => void }) {
  const auth = useAuth();
  const [frequency, setFrequency] = useState<CheerFrequency>(data.cheerFrequency);
  const [test, setTest] = useState<"idle" | "sending" | Awaited<ReturnType<typeof sendTestPush>>>("idle");
  const linked = data.devices.count > 0;

  async function choose(f: CheerFrequency) {
    setFrequency(f);
    const token = await auth.getToken();
    if (token) await setCheerFrequency(token, f).catch(() => null);
  }
  async function tryPush() {
    const token = await auth.getToken();
    if (!token) return;
    setTest("sending");
    setTest(await sendTestPush(token));
  }

  return (
    <section className="kokoro-block notify" aria-label={tr({ ja: "通知", en: "Notifications", fr: "Notifications" })}>
      <h3>{tr({ ja: "通知", en: "Notifications", fr: "Notifications" })}</h3>
      <div className={`device-status${linked ? " linked" : ""}`}>
        <span className="help-icon"><PhoneIcon size={20} /></span>
        {linked ? (
          <div>
            <strong>{tr({ ja: `iPhone ${data.devices.count}台とつながっています`, en: `Connected to ${data.devices.count} iPhone(s)`, fr: `Relié à ${data.devices.count} iPhone` })}</strong>
            {data.devices.lastSeen && <small>{tr({ ja: "最終確認：", en: "Last seen: ", fr: "Vu le " })}{formatDay(data.devices.lastSeen.slice(0, 10), tr.lang, false)}</small>}
          </div>
        ) : (
          <div>
            <strong>{tr({ ja: "まだiPhoneがつながっていません", en: "No iPhone connected yet", fr: "Aucun iPhone relié pour l'instant" })}</strong>
            <small>{tr({
              ja: "iPhoneアプリにこのアカウントでサインインし、通知を許可すると、自動でつながります。",
              en: "Sign in to the iPhone app with this account and allow notifications: it connects automatically.",
              fr: "Connectez-vous à l'app iPhone avec ce compte et autorisez les notifications : le lien se fait tout seul.",
            })}</small>
          </div>
        )}
        {linked
          ? <button onClick={tryPush} disabled={test === "sending"}>{tr({ ja: "テスト通知を送る", en: "Send a test", fr: "Envoyer un essai" })}</button>
          : <button onClick={onOpenBeta}>{tr({ ja: "iPhoneアプリ（β）", en: "iPhone app (beta)", fr: "App iPhone (bêta)" })}</button>}
      </div>
      {test !== "idle" && test !== "sending" && (
        <p className="muted small" role="status">{{
          sent: tr({ ja: "送りました。iPhoneを見てみてください。", en: "Sent. Check your iPhone.", fr: "Envoyé. Regardez votre iPhone." }),
          no_device: tr({ ja: "iPhoneがつながっていません。", en: "No iPhone connected.", fr: "Aucun iPhone relié." }),
          limit: tr({ ja: "今日のテストは3回までです。", en: "Up to 3 tests a day.", fr: "3 essais par jour au maximum." }),
          off: tr({ ja: "通知は準備中です。", en: "Notifications are not set up yet.", fr: "Les notifications ne sont pas encore configurées." }),
          failed: tr({ ja: "送れませんでした。iPhoneで通知が許可されているか確認してください。", en: "Could not send. Check that notifications are allowed on the iPhone.", fr: "Envoi impossible. Vérifiez que les notifications sont autorisées sur l'iPhone." }),
        }[test]}</p>
      )}
      <p className="kokoro-sub notify-label">{tr({ ja: "はげましの通知（朝8時）", en: "Encouragement (8 am)", fr: "Encouragements (8 h)" })}</p>
      <div className="word-chips" role="radiogroup" aria-label={tr({ ja: "はげましの通知", en: "Encouragement", fr: "Encouragements" })}>
        {FREQUENCIES.map((f) => (
          <button key={f.id} role="radio" aria-checked={frequency === f.id} aria-pressed={frequency === f.id} onClick={() => choose(f.id)}>{tr(f.label)}</button>
        ))}
      </div>
      <p className="muted small">{tr({
        ja: "締切のお知らせは別に届きます。不採用や内定の日のことばは、オフ以外ならいつでも届きます。",
        en: "Deadline reminders arrive separately. Words on the day of a rejection or an offer arrive unless you choose Off.",
        fr: "Les rappels d'échéance arrivent à part. Les mots d'un jour de refus ou d'offre arrivent sauf si vous choisissez « Désactivé ».",
      })}</p>
    </section>
  );
}
