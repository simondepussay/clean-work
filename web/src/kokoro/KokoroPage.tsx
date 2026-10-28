import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Loader } from "../Loader";
import { eraseKokoro, getKokoro, listApplications, setMood, setValues, type Application, type Kokoro, type MoodWeather } from "../api";
import { useAuth } from "../auth/auth";
import { buildAgenda, ymd } from "../home/agenda";
import { CloudIcon, RainIcon, SunIcon } from "../icons";
import { formatDay, useTr, type T3, type Tr } from "../i18n";

/**
 * Onglet « こころ » : prendre soin de soi pendant le 就活, avec des gestes simples et sourcés.
 *  - こころの天気 : nommer son humeur chaque jour (晴れ・くもり・雨 + un mot).
 *  - un soutien par paliers selon les jours de pluie (règle calculée par l'API) ;
 *  - 面接前の3分 : respirer, relire ce qui compte pour soi, requalifier le trac ;
 *  - des aides réelles et officielles, adaptées à la région et à la langue.
 * Ces données restent privées et ne sont jamais envoyées à l'IA.
 */

const WEATHERS: { id: MoodWeather; label: T3; Icon: typeof SunIcon }[] = [
  { id: "sunny", label: { ja: "晴れ", en: "Sunny", fr: "Soleil" }, Icon: SunIcon },
  { id: "cloudy", label: { ja: "くもり", en: "Cloudy", fr: "Nuageux" }, Icon: CloudIcon },
  { id: "rainy", label: { ja: "雨", en: "Rainy", fr: "Pluie" }, Icon: RainIcon },
];
const ICON = Object.fromEntries(WEATHERS.map((w) => [w.id, w.Icon])) as Record<MoodWeather, typeof SunIcon>;

/** Des mots pour nommer ce qu'on ressent : les choisir aide à prendre du recul (Lieberman 2007). */
const WORDS: T3[] = [
  { ja: "不安", en: "Anxious", fr: "Inquiet" },
  { ja: "疲れた", en: "Tired", fr: "Fatigué" },
  { ja: "焦り", en: "Rushed", fr: "Pressé" },
  { ja: "ほっとした", en: "Relieved", fr: "Soulagé" },
  { ja: "ワクワク", en: "Excited", fr: "Enthousiaste" },
];

type Source = { name: string; url: string; text: T3 };
const SOURCES: Record<"labeling" | "breathing" | "values" | "excited" | "who" | "twoWeeks", Source> = {
  labeling: {
    name: "Lieberman et al., Psychological Science (2007)", url: "https://doi.org/10.1111/j.1467-9280.2007.01916.x",
    text: { ja: "感情に名前をつけると、気持ちの反応がやわらぐ。", en: "Putting feelings into words dampens emotional reactions.", fr: "Mettre un mot sur une émotion en atténue la réaction." },
  },
  breathing: {
    name: "こころの耳（厚生労働省）", url: "https://kokoro.mhlw.go.jp/fivemin/",
    text: { ja: "ゆっくりした呼吸はリラクセーションの基本。", en: "Slow breathing is a basic relaxation method.", fr: "La respiration lente est une méthode de relaxation de base." },
  },
  values: {
    name: "Creswell et al., Psychological Science (2005)", url: "https://doi.org/10.1111/j.1467-9280.2005.01624.x",
    text: { ja: "大切な価値を思い出すと、ストレスへの反応が小さくなった。", en: "Recalling personal values lowered stress responses.", fr: "Se rappeler ses valeurs a réduit la réaction au stress." },
  },
  excited: {
    name: "Brooks, J. Exp. Psychology: General (2014)", url: "https://doi.org/10.1037/a0035325",
    text: { ja: "「落ち着こう」より「ワクワクしてる」と言う方が、人前での発表がうまくいった。", en: "Saying “I am excited” rather than “calm down” improved performance in public speaking.", fr: "Dire « je suis enthousiaste » plutôt que « calme-toi » a amélioré la prise de parole." },
  },
  who: {
    name: "WHO — Doing What Matters in Times of Stress", url: "https://www.who.int/publications/i/item/9789240003927",
    text: { ja: "大切なことに沿って行動し、自分にやさしくする。", en: "Act on your values and be kind to yourself.", fr: "Agir selon ses valeurs, être bienveillant envers soi." },
  },
  twoWeeks: {
    name: "こころもメンテしよう（厚生労働省）", url: "https://www.mhlw.go.jp/kokoro/youth/",
    text: { ja: "つらい気分が2週間以上続くときは、早めに相談を。", en: "If low mood lasts more than 2 weeks, talk to someone early.", fr: "Si le mal-être dure plus de 2 semaines, en parler tôt." },
  },
};

function SourceLink({ source, tr }: { source: Source; tr: Tr }) {
  return <a className="kokoro-source" href={source.url} target="_blank" rel="noreferrer" title={tr(source.text)}>{tr({ ja: "出典", en: "Source", fr: "Source" })} : {source.name}</a>;
}

/** Respiration guidée : 4 s pour inspirer, 6 s pour expirer, pendant une minute (6 cycles). */
export function Breathing({ onDone }: { onDone?: () => void }) {
  const tr = useTr();
  const [tick, setTick] = useState(0);
  const CYCLE = 10;
  const TOTAL = 60;
  useEffect(() => {
    if (tick >= TOTAL) { onDone?.(); return; }
    const t = setTimeout(() => setTick((n) => n + 1), 1000);
    return () => clearTimeout(t);
  }, [tick, onDone]);
  const inhale = tick % CYCLE < 4;
  return (
    <div className="breathing">
      <div className="breath-circle" aria-hidden="true" />
      <p className="breath-word" aria-live="polite">{tick >= TOTAL
        ? tr({ ja: "おつかれさま", en: "Well done", fr: "Bravo" })
        : inhale ? tr({ ja: "吸って", en: "Breathe in", fr: "Inspirez" }) : tr({ ja: "吐いて", en: "Breathe out", fr: "Expirez" })}</p>
      <p className="muted small">{Math.max(0, TOTAL - tick)} s</p>
    </div>
  );
}

/** « 面接前の3分 » : respirer → relire ce qui compte → requalifier le trac. */
function Ritual({ values, company, onEditValues, onClose }: { values: string[]; company?: string; onEditValues: () => void; onClose: () => void }) {
  const tr = useTr();
  const [step, setStep] = useState(0);
  const next = () => setStep((s) => s + 1);
  return (
    <section className="card ritual" aria-label={tr({ ja: "面接前の3分", en: "3 minutes before the interview", fr: "3 minutes avant l'entretien" })}>
      <ol className="ritual-steps" aria-hidden="true">
        {[0, 1, 2].map((i) => <li key={i} className={i === step ? "current" : i < step ? "done" : ""} />)}
      </ol>
      {step === 0 && (
        <>
          <h2>{tr({ ja: "1分、呼吸をととのえる", en: "One minute to steady your breath", fr: "Une minute pour respirer" })}</h2>
          <Breathing onDone={next} />
          <SourceLink source={SOURCES.breathing} tr={tr} />
          <button className="link" onClick={next}>{tr({ ja: "次へ", en: "Next", fr: "Suivant" })}</button>
        </>
      )}
      {step === 1 && (
        <>
          <h2>{tr({ ja: "あなたが大切にしていること", en: "What matters to you", fr: "Ce qui compte pour vous" })}</h2>
          {values.length > 0 ? (
            <ul className="ritual-values">{values.map((v) => <li key={v}>{v}</li>)}</ul>
          ) : (
            <p className="muted">{tr({ ja: "まだ書かれていません。", en: "Nothing written yet.", fr: "Rien d'écrit pour l'instant." })} <button className="link" onClick={onEditValues}>{tr({ ja: "書く", en: "Write them", fr: "Les écrire" })}</button></p>
          )}
          <p className="muted small">{tr({ ja: "ゆっくり読んで、どうしてそれが大切か思い出してください。", en: "Read slowly and recall why each one matters.", fr: "Lisez lentement et rappelez-vous pourquoi chacune compte." })}</p>
          <SourceLink source={SOURCES.values} tr={tr} />
          <button className="primary" onClick={next}>{tr({ ja: "次へ", en: "Next", fr: "Suivant" })}</button>
        </>
      )}
      {step === 2 && (
        <>
          <h2>{tr({ ja: "ドキドキは、準備ができたしるし", en: "Nerves mean you are ready", fr: "Le trac, signe que vous êtes prêt" })}</h2>
          <p className="ritual-phrase">{tr({ ja: "「落ち着かなきゃ」ではなく、「ワクワクしてる」。", en: "Not “I must calm down” — “I am excited.”", fr: "Pas « je dois me calmer », mais « je suis enthousiaste »." })}</p>
          <p className="muted small">{tr({ ja: "声に出して一度だけ言ってみましょう。", en: "Say it out loud, once.", fr: "Dites-le une fois à voix haute." })}</p>
          <SourceLink source={SOURCES.excited} tr={tr} />
          <button className="primary" onClick={next}>{tr({ ja: "終わる", en: "Finish", fr: "Terminer" })}</button>
        </>
      )}
      {step >= 3 && (
        <>
          <h2>{company ? tr({ ja: `${company}、いってらっしゃい。`, en: `Good luck at ${company}.`, fr: `Bonne chance chez ${company}.` }) : tr({ ja: "いってらっしゃい。", en: "Good luck.", fr: "Bonne chance." })}</h2>
          <button onClick={onClose}>{tr({ ja: "閉じる", en: "Close", fr: "Fermer" })}</button>
        </>
      )}
    </section>
  );
}

/** Les aides, toujours visibles ; adaptées à la région et aux étudiants étrangers. */
function Helplines({ data, tr }: { data: Kokoro; tr: Tr }) {
  const foreign = data.international || tr.lang !== "ja";
  return (
    <section className="kokoro-help" aria-label={tr({ ja: "相談先", en: "Where to talk", fr: "À qui parler" })}>
      <h3>{tr({ ja: "相談先", en: "Where to talk", fr: "À qui parler" })}</h3>
      <ul className="link-list">
        <li><a href="https://www.mhlw.go.jp/mamorouyokokoro/" target="_blank" rel="noreferrer">
          <strong>まもろうよこころ</strong>
          <small>{tr({ ja: "電話・SNS（LINEなど）の相談窓口の一覧（厚生労働省）", en: "Phone and chat (LINE…) helplines, official list (Ministry of Health)", fr: "Lignes d'écoute par téléphone et chat (LINE…), liste officielle" })}</small>
        </a></li>
        <li><a href="tel:0570064556">
          <strong>こころの健康相談統一ダイヤル 0570-064-556</strong>
          <small>{tr({ ja: "お住まいの地域の公的な相談窓口につながります", en: "Connects you to the public counseling center in your area", fr: "Vous met en relation avec le centre public de votre région" })}</small>
        </a></li>
        <li><a href="https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000184061.html" target="_blank" rel="noreferrer">
          <strong>{tr({ ja: "新卒応援ハローワーク", en: "Hello Work for new graduates", fr: "Hello Work jeunes diplômés" })}{data.prefecture ? `（${data.prefecture}）` : ""}</strong>
          <small>{tr({ ja: "就活のストレスを臨床心理士に無料で相談できる地域があります", en: "In many areas, free sessions with a clinical psychologist about job-hunting stress", fr: "Dans de nombreuses régions, un psychologue reçoit gratuitement pour le stress du 就活" })}</small>
        </a></li>
        {foreign && (
          <>
            <li><a href="https://www.since2011.net/yorisoi/" target="_blank" rel="noreferrer">
              <strong>{tr({ ja: "よりそいホットライン（外国語）", en: "Yorisoi Hotline (foreign languages)", fr: "Yorisoi Hotline (langues étrangères)" })}</strong>
              <small>0120-279-338 · English, 中文, 한국어, Tiếng Việt, नेपाली…</small>
            </a></li>
            <li><a href="https://telljp.com/lifeline/" target="_blank" rel="noreferrer">
              <strong>TELL Lifeline</strong>
              <small>{tr({ ja: "英語の電話・チャット相談 0800-300-8355", en: "Counseling in English, phone and chat · 0800-300-8355", fr: "Écoute en anglais, téléphone et chat · 0800-300-8355" })}</small>
            </a></li>
          </>
        )}
      </ul>
      <p className="muted small">{tr({ ja: "学校の学生相談室も、就活の悩みを聞いてくれます。", en: "Your school's student counseling office also listens to job-hunting worries.", fr: "Le service de conseil aux étudiants de votre école écoute aussi les soucis liés au 就活." })}</p>
    </section>
  );
}

/** Ce que dit l'app selon le palier (voir api/src/lib/kokoro.ts). */
function Support({ data, tr, onBreathe }: { data: Kokoro; tr: Tr; onBreathe: () => void }) {
  const { level } = data.support;
  if (level === "calm") return null;
  const w = data.week;
  const done = [
    w.applications && tr({ ja: `応募 ${w.applications}件`, en: `${w.applications} application(s)`, fr: `${w.applications} candidature(s)` }),
    w.drafts && tr({ ja: `ES ${w.drafts}本`, en: `${w.drafts} entry sheet(s)`, fr: `${w.drafts} ES` }),
    w.interviews && tr({ ja: `面接練習 ${w.interviews}回`, en: `${w.interviews} practice interview(s)`, fr: `${w.interviews} entretien(s) d'entraînement` }),
  ].filter(Boolean);
  return (
    <section className={`card kokoro-support ${level}`} role="status">
      {level === "rain" && <h2>{tr({ ja: "雨の日もあります。", en: "Some days are rainy.", fr: "Il y a des jours de pluie." })}</h2>}
      {level === "often" && <h2>{tr({ ja: "就活のストレス、ひとりで抱えなくて大丈夫。", en: "You don't have to carry job-hunting stress alone.", fr: "Vous n'avez pas à porter seul le stress du 就活." })}</h2>}
      {level === "long" && (
        <>
          <h2>{tr({ ja: "2週間近く、雨の日が続いています。", en: "It has been rainy for almost two weeks.", fr: "Cela fait près de deux semaines de pluie." })}</h2>
          <p>{tr({ ja: "つらい気分が2週間以上続くときは、早めに誰かに相談することがすすめられています。下の窓口は無料です。", en: "When low mood lasts over two weeks, talking to someone early is recommended. The services below are free.", fr: "Quand le mal-être dure plus de deux semaines, il est conseillé d'en parler tôt. Les services ci-dessous sont gratuits." })}</p>
          <SourceLink source={SOURCES.twoWeeks} tr={tr} />
        </>
      )}
      {level === "often" && (
        <p>{tr({ ja: "新卒応援ハローワークでは、就活の不安を臨床心理士に無料で相談できる地域があります。学校の学生相談室も頼れます。", en: "Many Hello Work offices for new graduates offer free sessions with a clinical psychologist. Your school's counseling office can help too.", fr: "Beaucoup de Hello Work pour jeunes diplômés proposent un psychologue gratuit. Le service de conseil de l'école peut aussi aider." })}</p>
      )}
      {done.length > 0 && (
        <p className="kokoro-done">{tr({ ja: "今週やったこと：", en: "This week you did: ", fr: "Cette semaine : " })}<strong>{done.join(tr({ ja: "・", en: ", ", fr: ", " }))}</strong></p>
      )}
      {w.rejections > 0 && (
        <p className="muted">{tr({ ja: "お祈りメールが届いた週でした。結果は相性で、あなたの価値ではありません。", en: "A rejection arrived this week. It is about fit, not about your worth.", fr: "Un refus est arrivé cette semaine. C'est une question d'affinité, pas de valeur." })}</p>
      )}
      <button onClick={onBreathe}>{tr({ ja: "1分の呼吸", en: "One-minute breathing", fr: "Une minute de respiration" })}</button>
    </section>
  );
}

export function KokoroPage() {
  const auth = useAuth();
  const tr = useTr();
  const today = ymd(new Date());
  const [data, setData] = useState<Kokoro | null>(null);
  const [failed, setFailed] = useState(false);
  const [apps, setApps] = useState<Application[]>([]);
  const [word, setWord] = useState("");
  const [mode, setMode] = useState<"none" | "breathe" | "ritual">("none");
  const [editing, setEditing] = useState(false);
  const [draftValues, setDraftValues] = useState(["", "", ""]);

  async function load() {
    const token = await auth.getToken();
    if (!token) return;
    try {
      const [k, a] = await Promise.all([getKokoro(token, today), listApplications(token).catch(() => null)]);
      if (k.ok) { setData(k.value); setWord(k.value.moods.find((m) => m.date === today)?.word ?? ""); }
      else setFailed(true);
      if (a && a.ok) setApps(a.value);
    } catch { setFailed(true); }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  /** Le prochain entretien dans les 7 jours : le rituel lui est dédié. */
  const nextInterview = useMemo(() => {
    const limit = ymd(new Date(Date.now() + 7 * 86_400_000));
    return buildAgenda(apps, [], tr.lang).find((i) => i.kind === "interview" && !i.done && i.date >= today && i.date <= limit);
  }, [apps, today, tr.lang]);

  const todayMood = data?.moods.find((m) => m.date === today);

  async function choose(weather: MoodWeather | null, newWord = word) {
    const token = await auth.getToken();
    if (!token || !data) return;
    const trimmed = newWord.trim();
    const res = await setMood(token, { date: today, weather, ...(trimmed && weather ? { word: trimmed } : {}) }).catch(() => null);
    if (res?.ok) await load();
  }

  async function saveValues(e: FormEvent) {
    e.preventDefault();
    const token = await auth.getToken();
    if (!token) return;
    const res = await setValues(token, draftValues).catch(() => null);
    if (res?.ok) { setEditing(false); await load(); }
  }

  async function erase() {
    if (!window.confirm(tr({ ja: "こころの記録（天気と大切なこと）をすべて消しますか？元に戻せません。", en: "Erase all your Mind records (weather and values)? This cannot be undone.", fr: "Effacer tout votre journal (météo et valeurs) ? C'est définitif." }))) return;
    const token = await auth.getToken();
    if (token && (await eraseKokoro(token).catch(() => null))?.ok) await load();
  }

  if (failed) return <p className="muted">{tr({ ja: "読み込めませんでした。", en: "Could not load.", fr: "Chargement impossible." })}</p>;
  if (!data) return <Loader />;

  // Les 4 dernières semaines, 7 jours par ligne, aujourd'hui en dernier.
  const days = Array.from({ length: 28 }, (_, i) => ymd(new Date(Date.now() - (27 - i) * 86_400_000)));
  const byDate = new Map(data.moods.map((m) => [m.date, m]));

  return (
    <div className="kokoro">
      <div className="kokoro-main">
        <section className="card kokoro-today" aria-label={tr({ ja: "今日のこころの天気", en: "Today's inner weather", fr: "La météo du jour" })}>
          <h2>{tr({ ja: "今日のこころの天気は？", en: "How's your inner weather today?", fr: "Quelle météo intérieure aujourd'hui ?" })}</h2>
          <div className="mood-choices" role="radiogroup" aria-label={tr({ ja: "天気", en: "Weather", fr: "Météo" })}>
            {WEATHERS.map(({ id, label, Icon }) => (
              <button key={id} role="radio" aria-checked={todayMood?.weather === id} className={`mood ${id}`}
                onClick={() => choose(todayMood?.weather === id ? null : id)}>
                <Icon size={30} /><span>{tr(label)}</span>
              </button>
            ))}
          </div>
          {todayMood && (
            <div className="mood-word">
              <p className="muted small">{tr({ ja: "ひとことで言うと？", en: "In one word?", fr: "En un mot ?" })}</p>
              <div className="chips-filter">
                {WORDS.map((w) => {
                  const text = tr(w);
                  return <button key={w.ja} aria-pressed={word === text} onClick={() => { const v = word === text ? "" : text; setWord(v); choose(todayMood.weather, v); }}>{text}</button>;
                })}
              </div>
              <form className="mood-word-form" onSubmit={(e) => { e.preventDefault(); choose(todayMood.weather); }}>
                <input value={word} maxLength={30} onChange={(e) => setWord(e.target.value)}
                  aria-label={tr({ ja: "自分の言葉で", en: "In your own words", fr: "Avec vos mots" })} placeholder={tr({ ja: "自分の言葉で", en: "In your own words", fr: "Avec vos mots" })} />
                <button type="submit">{tr({ ja: "保存", en: "Save", fr: "Enregistrer" })}</button>
              </form>
              <SourceLink source={SOURCES.labeling} tr={tr} />
            </div>
          )}
          <div className="mood-weeks" role="img" aria-label={tr({ ja: "この4週間の天気", en: "The last 4 weeks", fr: "Les 4 dernières semaines" })}>
            {days.map((d) => {
              const m = byDate.get(d);
              const Icon = m ? ICON[m.weather] : null;
              return (
                <span key={d} className={`mood-day${m ? ` ${m.weather}` : ""}${d === today ? " today" : ""}`} title={`${formatDay(d, tr.lang)}${m?.word ? ` · ${m.word}` : ""}`}>
                  {Icon ? <Icon size={14} /> : null}
                </span>
              );
            })}
          </div>
        </section>

        <Support data={data} tr={tr} onBreathe={() => setMode("breathe")} />

        {mode === "breathe" && (
          <section className="card" aria-label={tr({ ja: "1分の呼吸", en: "One-minute breathing", fr: "Une minute de respiration" })}>
            <Breathing />
            <SourceLink source={SOURCES.breathing} tr={tr} />
            <button className="link" onClick={() => setMode("none")}>{tr({ ja: "閉じる", en: "Close", fr: "Fermer" })}</button>
          </section>
        )}

        {mode === "ritual" ? (
          <Ritual values={data.values} company={nextInterview?.title} onClose={() => setMode("none")}
            onEditValues={() => { setDraftValues([...data.values, "", "", ""].slice(0, 3)); setEditing(true); }} />
        ) : (
          <section className="card kokoro-ritual-card">
            <div>
              <p className="eyebrow">{tr({ ja: "面接前の3分", en: "3 minutes before the interview", fr: "3 minutes avant l'entretien" })}</p>
              <h2>{nextInterview
                ? tr({ ja: `${formatDay(nextInterview.date, "ja")}、${nextInterview.title}の面接の前に`, en: `Before your interview at ${nextInterview.title}, ${formatDay(nextInterview.date, "en")}`, fr: `Avant votre entretien chez ${nextInterview.title}, ${formatDay(nextInterview.date, "fr")}` })
                : tr({ ja: "呼吸・大切なこと・ひとこと", en: "Breathe, recall what matters, one sentence", fr: "Respirer, se rappeler l'essentiel, une phrase" })}</h2>
            </div>
            <button className="primary" onClick={() => setMode("ritual")}>{tr({ ja: "はじめる", en: "Start", fr: "Commencer" })}</button>
          </section>
        )}
      </div>

      <aside className="kokoro-side">
        <Helplines data={data} tr={tr} />

        <section aria-label={tr({ ja: "大切にしていること", en: "What matters to me", fr: "Ce qui compte pour moi" })}>
          <h3>{tr({ ja: "大切にしていること", en: "What matters to me", fr: "Ce qui compte pour moi" })}</h3>
          {editing ? (
            <form onSubmit={saveValues} className="values-form">
              {draftValues.map((v, i) => (
                <input key={i} value={v} maxLength={60} onChange={(e) => setDraftValues(draftValues.map((x, j) => (j === i ? e.target.value : x)))}
                  aria-label={`${tr({ ja: "大切なこと", en: "Value", fr: "Valeur" })} ${i + 1}`}
                  placeholder={[tr({ ja: "例：家族を安心させたい", en: "e.g. Reassure my family", fr: "Ex. : rassurer ma famille" }), tr({ ja: "例：誠実でいること", en: "e.g. Stay honest", fr: "Ex. : rester honnête" }), ""][i]} />
              ))}
              <div className="actions">
                <button type="submit" className="primary">{tr({ ja: "保存", en: "Save", fr: "Enregistrer" })}</button>
                <button type="button" onClick={() => setEditing(false)}>{tr({ ja: "やめる", en: "Cancel", fr: "Annuler" })}</button>
              </div>
            </form>
          ) : (
            <>
              {data.values.length > 0
                ? <ul className="values-list">{data.values.map((v) => <li key={v}>{v}</li>)}</ul>
                : <p className="muted small">{tr({ ja: "面接の前に読み返す、自分のための3行。", en: "Three lines for yourself, to reread before interviews.", fr: "Trois lignes pour vous, à relire avant les entretiens." })}</p>}
              <button className="link" onClick={() => { setDraftValues([...data.values, "", "", ""].slice(0, 3)); setEditing(true); }}>
                {data.values.length ? tr({ ja: "書きなおす", en: "Edit", fr: "Modifier" }) : tr({ ja: "書く", en: "Write", fr: "Écrire" })}
              </button>
            </>
          )}
        </section>

        <section aria-label={tr({ ja: "根拠", en: "Evidence", fr: "Sources" })}>
          <h3>{tr({ ja: "このページの根拠", en: "What this page is based on", fr: "Sur quoi repose cette page" })}</h3>
          <ul className="kokoro-sources">
            {Object.values(SOURCES).map((s) => (
              <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.name}</a><span className="muted small">{tr(s.text)}</span></li>
            ))}
          </ul>
        </section>

        <section className="kokoro-privacy">
          <p className="muted small">{tr({ ja: "この記録はあなただけのものです。AIには送りません。", en: "These records are yours only. They are never sent to the AI.", fr: "Ce journal n'appartient qu'à vous. Il n'est jamais envoyé à l'IA." })}</p>
          <button className="link danger" onClick={erase}>{tr({ ja: "記録をすべて消す", en: "Erase all records", fr: "Tout effacer" })}</button>
        </section>
      </aside>
    </div>
  );
}
