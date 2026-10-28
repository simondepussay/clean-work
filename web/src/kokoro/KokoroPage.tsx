import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { eraseKokoro, getKokoro, listApplications, setMood, setValues, type Application, type Kokoro, type MoodWeather } from "../api";
import { useAuth } from "../auth/auth";
import { buildAgenda, ymd } from "../home/agenda";
import { ChatIcon, CloseIcon, CloudIcon, GlobeIcon, HeartIcon, PhoneIcon, RainIcon, SunIcon } from "../icons";
import { formatDay, useTr, type T3, type Tr } from "../i18n";
import { CloudCurtain, KokoroLoading, KokoroSky } from "./KokoroSky";

/**
 * Onglet « こころ » : un endroit calme pour prendre soin de soi pendant le 就活.
 *
 * Inspirations : How We Feel (Yale) — choisir son humeur, puis la nommer ; Headspace et Calm —
 * une chose à la fois, respiration en plein écran ; Daylio — le calendrier en « jardin » de points ;
 * Finch — l'app parle doucement, comme une amie. Propre à Clean Work : le ciel en haut de la page
 * devient la météo intérieure de l'utilisateur, dessiné comme une estampe (voir KokoroSky.tsx).
 *
 * Données privées, jamais envoyées à l'IA. Les paliers de soutien sont calculés par l'API.
 */

const WEATHERS: { id: MoodWeather; label: T3; Icon: typeof SunIcon }[] = [
  { id: "sunny", label: { ja: "晴れ", en: "Sunny", fr: "Soleil" }, Icon: SunIcon },
  { id: "cloudy", label: { ja: "くもり", en: "Cloudy", fr: "Nuageux" }, Icon: CloudIcon },
  { id: "rainy", label: { ja: "雨", en: "Rainy", fr: "Pluie" }, Icon: RainIcon },
];

/** Ce que l'app répond, doucement, au choix du jour. */
const ECHO: Record<MoodWeather, T3> = {
  sunny: { ja: "いい天気ですね。この気持ち、覚えておきましょう。", en: "Lovely weather. Let's remember this feeling.", fr: "Belle météo. Gardons ce sentiment en mémoire." },
  cloudy: { ja: "くもりの日も、ちゃんと前に進んでいます。", en: "Even on cloudy days, you're moving forward.", fr: "Même les jours gris, vous avancez." },
  rainy: { ja: "雨の日もあります。ここで少し、ひと息つきましょう。", en: "Some days are rainy. Let's take a breath here.", fr: "Il y a des jours de pluie. Prenons un moment pour souffler." },
};

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

/** Bonjour selon l'heure : on parle à quelqu'un, pas à un formulaire. */
function greeting(tr: Tr, name: string | null) {
  const h = new Date().getHours();
  const hello = h < 5 || h >= 18 ? tr({ ja: "こんばんは", en: "Good evening", fr: "Bonsoir" })
    : h < 11 ? tr({ ja: "おはようございます", en: "Good morning", fr: "Bonjour" }) : tr({ ja: "こんにちは", en: "Hello", fr: "Bonjour" });
  return name ? tr({ ja: `${hello}、${name}さん。`, en: `${hello}, ${name}.`, fr: `${hello}, ${name}.` }) : `${hello}${tr({ ja: "。", en: ".", fr: "." })}`;
}

/** Respiration guidée : 4 s pour inspirer, 6 s pour expirer, pendant une minute (6 cycles). */
export function Breathing({ onDone }: { onDone?: () => void }) {
  const tr = useTr();
  const [tick, setTick] = useState(0);
  const TOTAL = 60;
  useEffect(() => {
    if (tick >= TOTAL) { onDone?.(); return; }
    const t = setTimeout(() => setTick((n) => n + 1), 1000);
    return () => clearTimeout(t);
  }, [tick, onDone]);
  const inhale = tick % 10 < 4;
  return (
    <div className="breathing">
      <div className="breath-circle" aria-hidden="true"><span /></div>
      <p className="breath-word" aria-live="polite">{tick >= TOTAL
        ? tr({ ja: "おつかれさま", en: "Well done", fr: "Bravo" })
        : inhale ? tr({ ja: "吸って", en: "Breathe in", fr: "Inspirez" }) : tr({ ja: "吐いて", en: "Breathe out", fr: "Expirez" })}</p>
      <p className="breath-count">{Math.max(0, TOTAL - tick)} s</p>
    </div>
  );
}

/** Plein écran apaisant (respiration seule, ou rituel d'avant-entretien). Échap ferme. */
function Calm({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const tr = useTr();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="calm" role="dialog" aria-modal="true" aria-label={label}>
      <button className="calm-close" onClick={onClose} aria-label={tr({ ja: "閉じる", en: "Close", fr: "Fermer" })}><CloseIcon size={22} /></button>
      <div className="calm-body">{children}</div>
    </div>
  );
}

/** « 面接前の3分 » : respirer → relire ce qui compte → requalifier le trac. */
function Ritual({ values, company, onEditValues, onClose }: { values: string[]; company?: string; onEditValues: () => void; onClose: () => void }) {
  const tr = useTr();
  const [step, setStep] = useState(0);
  const next = () => setStep((s) => s + 1);
  return (
    <Calm label={tr({ ja: "面接前の3分", en: "3 minutes before the interview", fr: "3 minutes avant l'entretien" })} onClose={onClose}>
      <ol className="ritual-steps" aria-hidden="true">
        {[0, 1, 2].map((i) => <li key={i} className={i === step ? "current" : i < step ? "done" : ""} />)}
      </ol>
      {step === 0 && (
        <>
          <h2>{tr({ ja: "まず、1分だけ呼吸を。", en: "First, one minute of breathing.", fr: "D'abord, une minute pour respirer." })}</h2>
          <Breathing onDone={next} />
          <SourceLink source={SOURCES.breathing} tr={tr} />
          <button className="calm-skip" onClick={next}>{tr({ ja: "次へ", en: "Next", fr: "Suivant" })}</button>
        </>
      )}
      {step === 1 && (
        <>
          <h2>{tr({ ja: "あなたが大切にしていること", en: "What matters to you", fr: "Ce qui compte pour vous" })}</h2>
          {values.length > 0 ? (
            <ul className="ritual-values">{values.map((v) => <li key={v}>{v}</li>)}</ul>
          ) : (
            <p>{tr({ ja: "まだ書かれていません。", en: "Nothing written yet.", fr: "Rien d'écrit pour l'instant." })} <button className="link" onClick={onEditValues}>{tr({ ja: "書く", en: "Write them", fr: "Les écrire" })}</button></p>
          )}
          <p className="calm-hint">{tr({ ja: "ゆっくり読んで、どうしてそれが大切か思い出してください。", en: "Read slowly and recall why each one matters.", fr: "Lisez lentement et rappelez-vous pourquoi chacune compte." })}</p>
          <SourceLink source={SOURCES.values} tr={tr} />
          <button className="calm-next" onClick={next}>{tr({ ja: "次へ", en: "Next", fr: "Suivant" })}</button>
        </>
      )}
      {step === 2 && (
        <>
          <h2>{tr({ ja: "ドキドキは、準備ができたしるし", en: "Nerves mean you are ready", fr: "Le trac, signe que vous êtes prêt" })}</h2>
          <p className="ritual-phrase">{tr({ ja: "「落ち着かなきゃ」ではなく、「ワクワクしてる」。", en: "Not “I must calm down” — “I am excited.”", fr: "Pas « je dois me calmer », mais « je suis enthousiaste »." })}</p>
          <p className="calm-hint">{tr({ ja: "声に出して一度だけ言ってみましょう。", en: "Say it out loud, once.", fr: "Dites-le une fois à voix haute." })}</p>
          <SourceLink source={SOURCES.excited} tr={tr} />
          <button className="calm-next" onClick={next}>{tr({ ja: "終わる", en: "Finish", fr: "Terminer" })}</button>
        </>
      )}
      {step >= 3 && (
        <>
          <h2 className="ritual-end">{company ? tr({ ja: `${company}、いってらっしゃい。`, en: `Good luck at ${company}.`, fr: `Bonne chance chez ${company}.` }) : tr({ ja: "いってらっしゃい。", en: "Good luck.", fr: "Bonne chance." })}</h2>
          <button className="calm-next" onClick={onClose}>{tr({ ja: "閉じる", en: "Close", fr: "Fermer" })}</button>
        </>
      )}
    </Calm>
  );
}

/** La petite lettre de soutien, selon le palier (voir api/src/lib/kokoro.ts). */
function Letter({ data, name, tr, onBreathe }: { data: Kokoro; name: string | null; tr: Tr; onBreathe: () => void }) {
  const { level } = data.support;
  if (level === "calm") return null;
  const w = data.week;
  const stamps = [
    w.applications && tr({ ja: `応募 ${w.applications}件`, en: `${w.applications} application(s)`, fr: `${w.applications} candidature(s)` }),
    w.drafts && tr({ ja: `ES ${w.drafts}本`, en: `${w.drafts} entry sheet(s)`, fr: `${w.drafts} ES` }),
    w.interviews && tr({ ja: `面接練習 ${w.interviews}回`, en: `${w.interviews} practice interview(s)`, fr: `${w.interviews} entretien(s) d'entraînement` }),
  ].filter(Boolean) as string[];
  return (
    <section className={`kokoro-letter ${level}`} role="status">
      <p className="letter-to">{name ? tr({ ja: `${name}さんへ`, en: `Dear ${name},`, fr: `Cher·e ${name},` }) : tr({ ja: "あなたへ", en: "Dear you,", fr: "À vous," })}</p>
      {level === "rain" && <p>{tr({ ja: "今日は雨。そんな日は、何かを足すより、少し休むことが大事です。", en: "It's raining today. On days like this, resting matters more than doing more.", fr: "Il pleut aujourd'hui. Ces jours-là, se reposer compte plus qu'en faire plus." })}</p>}
      {level === "often" && (
        <>
          <p className="letter-lead">{tr({ ja: "就活のストレス、ひとりで抱えなくて大丈夫。", en: "You don't have to carry job-hunting stress alone.", fr: "Vous n'avez pas à porter seul le stress du 就活." })}</p>
          <p>{tr({ ja: "この一週間、雨の日が続きましたね。新卒応援ハローワークでは、就活の不安を臨床心理士に無料で相談できる地域があります。学校の学生相談室も、あなたの味方です。", en: "It's been a rainy week. Many Hello Work offices for new graduates offer free sessions with a clinical psychologist, and your school's counseling office is on your side too.", fr: "La semaine a été pluvieuse. Beaucoup de Hello Work pour jeunes diplômés proposent un psychologue gratuit, et le service de conseil de votre école est aussi là pour vous." })}</p>
        </>
      )}
      {level === "long" && (
        <>
          <p className="letter-lead">{tr({ ja: "2週間近く、雨の日が続いています。", en: "It has been rainy for almost two weeks.", fr: "Cela fait près de deux semaines de pluie." })}</p>
          <p>{tr({ ja: "つらい気分が2週間以上続くときは、早めに誰かに話してみてください。下の窓口は無料で、あなたの話を聞いてくれます。", en: "When low mood lasts over two weeks, please talk to someone soon. The services below are free and will listen.", fr: "Quand le mal-être dure plus de deux semaines, parlez-en vite à quelqu'un. Les services ci-dessous sont gratuits et vous écouteront." })}</p>
          <SourceLink source={SOURCES.twoWeeks} tr={tr} />
        </>
      )}
      {stamps.length > 0 && (
        <div className="letter-stamps">
          <span>{tr({ ja: "それでも今週、あなたは", en: "And still, this week you did", fr: "Et pourtant, cette semaine" })}</span>
          {stamps.map((s) => <b key={s}>{s}</b>)}
        </div>
      )}
      {w.rejections > 0 && (
        <p className="letter-soft">{tr({ ja: "お祈りメールが届いた週でした。結果は相性で、あなたの価値ではありません。", en: "A rejection arrived this week. It is about fit, not about your worth.", fr: "Un refus est arrivé cette semaine. C'est une question d'affinité, pas de valeur." })}</p>
      )}
      <button className="kokoro-soft-button" onClick={onBreathe}>{tr({ ja: "一緒に1分、深呼吸", en: "Breathe together for a minute", fr: "Respirer ensemble une minute" })}</button>
    </section>
  );
}

/** Ceux qui peuvent écouter, toujours visibles ; adaptés à la région et aux étudiants étrangers. */
function Helplines({ data, tr }: { data: Kokoro; tr: Tr }) {
  const foreign = data.international || tr.lang !== "ja";
  const items: { Icon: typeof PhoneIcon; name: string; text: string; href: string }[] = [
    { Icon: ChatIcon, name: "まもろうよこころ", text: tr({ ja: "電話・LINEなどの相談窓口（厚生労働省）", en: "Phone and chat (LINE…) helplines, official list", fr: "Lignes d'écoute par téléphone et chat (LINE…)" }), href: "https://www.mhlw.go.jp/mamorouyokokoro/" },
    { Icon: PhoneIcon, name: "こころの健康相談統一ダイヤル 0570-064-556", text: tr({ ja: "お住まいの地域の公的な窓口につながります", en: "Connects you to your local public center", fr: "Vous relie au centre public de votre région" }), href: "tel:0570064556" },
    { Icon: HeartIcon, name: `${tr({ ja: "新卒応援ハローワーク", en: "Hello Work for new graduates", fr: "Hello Work jeunes diplômés" })}${data.prefecture ? `（${data.prefecture}）` : ""}`, text: tr({ ja: "就活の不安を臨床心理士に無料で（地域による）", en: "Free sessions with a clinical psychologist (in many areas)", fr: "Un psychologue gratuitement (selon les régions)" }), href: "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000184061.html" },
    ...(foreign ? [
      { Icon: GlobeIcon, name: tr({ ja: "よりそいホットライン（外国語）", en: "Yorisoi Hotline (foreign languages)", fr: "Yorisoi Hotline (langues étrangères)" }), text: "0120-279-338 · English, 中文, 한국어, Tiếng Việt, नेपाली…", href: "https://www.since2011.net/yorisoi/" },
      { Icon: PhoneIcon, name: "TELL Lifeline", text: tr({ ja: "英語の電話・チャット相談 0800-300-8355", en: "Counseling in English · 0800-300-8355", fr: "Écoute en anglais · 0800-300-8355" }), href: "https://telljp.com/lifeline/" },
    ] : []),
  ];
  return (
    <section className="kokoro-block kokoro-help" aria-label={tr({ ja: "相談先", en: "Where to talk", fr: "À qui parler" })}>
      <h3>{tr({ ja: "ひとりで抱えないで", en: "You don't have to face it alone", fr: "Ne restez pas seul" })}</h3>
      <p className="kokoro-sub">{tr({ ja: "話を聞いてくれる場所は、いつでもここにあります。学校の学生相談室も、そのひとつです。", en: "There are always people ready to listen — your school's counseling office too.", fr: "Il y a toujours quelqu'un pour écouter — le service de conseil de votre école aussi." })}</p>
      <ul className="help-list">
        {items.map(({ Icon, name, text, href }) => (
          <li key={href}>
            <a href={href} target={href.startsWith("tel:") ? undefined : "_blank"} rel="noreferrer">
              <span className="help-icon"><Icon size={20} /></span>
              <span><strong>{name}</strong><small>{text}</small></span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function KokoroPage() {
  const auth = useAuth();
  const tr = useTr();
  const name = auth.state.status === "signedIn" ? auth.state.name ?? null : null;
  const today = ymd(new Date());
  const [data, setData] = useState<Kokoro | null>(null);
  const [failed, setFailed] = useState(false);
  const [apps, setApps] = useState<Application[]>([]);
  const [word, setWord] = useState("");
  const [mode, setMode] = useState<"none" | "breathe" | "ritual">("none");
  const [editing, setEditing] = useState(false);
  const [draftValues, setDraftValues] = useState(["", "", ""]);
  /** Rideau de nuages fermé pendant un chargement (au début, et quand la météo change). */
  const [veiled, setVeiled] = useState(true);

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
  // Au premier affichage, les nuages s'ouvrent une fois les données arrivées.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load().finally(() => setTimeout(() => setVeiled(false), 250)); }, []);

  /** Le prochain entretien dans les 7 jours : le rituel lui est dédié. */
  const nextInterview = useMemo(() => {
    const limit = ymd(new Date(Date.now() + 7 * 86_400_000));
    return buildAgenda(apps, [], tr.lang).find((i) => i.kind === "interview" && !i.done && i.date >= today && i.date <= limit);
  }, [apps, today, tr.lang]);

  const todayMood = data?.moods.find((m) => m.date === today);

  // Sur cet onglet, tout l'arrière-plan prend la météo du jour (voir index.css, html[data-mood]).
  const moodWeather = todayMood?.weather;
  useEffect(() => {
    const root = document.documentElement;
    if (moodWeather) root.dataset.mood = moodWeather;
    else delete root.dataset.mood;
    return () => { delete root.dataset.mood; };
  }, [moodWeather]);

  async function choose(weather: MoodWeather | null, newWord = word, curtain = false) {
    const token = await auth.getToken();
    if (!token || !data) return;
    const trimmed = newWord.trim();
    // Changer de météo : les nuages se ferment, le ciel change derrière, puis ils s'ouvrent.
    if (curtain) setVeiled(true);
    const [res] = await Promise.all([
      setMood(token, { date: today, weather, ...(trimmed && weather ? { word: trimmed } : {}) }).catch(() => null),
      curtain ? new Promise((r) => setTimeout(r, 650)) : null,
    ]);
    if (res?.ok) await load();
    if (curtain) setVeiled(false);
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

  const editValues = () => { setDraftValues([...(data?.values ?? []), "", "", ""].slice(0, 3)); setEditing(true); };

  if (failed) return <p className="muted">{tr({ ja: "読み込めませんでした。", en: "Could not load.", fr: "Chargement impossible." })}</p>;
  // Pendant le premier chargement : le ciel est couvert de nuages (pas de roue qui tourne).
  if (!data) return <KokoroLoading label={tr({ ja: "読み込み中", en: "Loading", fr: "Chargement" })} />;

  // Les 4 dernières semaines, en « jardin » de points (aujourd'hui en dernier).
  const days = Array.from({ length: 28 }, (_, i) => ymd(new Date(Date.now() - (27 - i) * 86_400_000)));
  const byDate = new Map(data.moods.map((m) => [m.date, m]));
  const counted: Record<MoodWeather, number> = { sunny: 0, cloudy: 0, rainy: 0 };
  days.forEach((d) => { const m = byDate.get(d); if (m) counted[m.weather] += 1; });

  return (
    <div className="kokoro">
      <section className="kokoro-hero" aria-label={tr({ ja: "今日のこころの天気", en: "Today's inner weather", fr: "La météo du jour" })}>
        <KokoroSky weather={todayMood?.weather} />
        <CloudCurtain closed={veiled} />
        <div className="hero-content">
          <p className="hero-hello">{greeting(tr, name)}</p>
          <h2>{tr({ ja: "今日のこころの天気は？", en: "How's your inner weather today?", fr: "Quelle météo intérieure aujourd'hui ?" })}</h2>
          <div className="mood-choices" role="radiogroup" aria-label={tr({ ja: "天気", en: "Weather", fr: "Météo" })}>
            {WEATHERS.map(({ id, label, Icon }) => (
              <button key={id} role="radio" aria-checked={todayMood?.weather === id} className={`mood ${id}`}
                onClick={() => choose(todayMood?.weather === id ? null : id, word, true)}>
                <span className="mood-icon"><Icon size={30} /></span><span>{tr(label)}</span>
              </button>
            ))}
          </div>
          {todayMood && <p className="hero-echo">{tr(ECHO[todayMood.weather])}</p>}
        </div>
      </section>

      {todayMood && (
        <section className="kokoro-block mood-word">
          <h3>{tr({ ja: "ひとことで言うと？", en: "In one word?", fr: "En un mot ?" })}</h3>
          <div className="word-chips">
            {WORDS.map((w) => {
              const text = tr(w);
              return <button key={w.ja} aria-pressed={word === text} onClick={() => { const v = word === text ? "" : text; setWord(v); choose(todayMood.weather, v); }}>{text}</button>;
            })}
          </div>
          <form className="mood-word-form" onSubmit={(e) => { e.preventDefault(); choose(todayMood.weather); }}>
            <input value={word} maxLength={30} onChange={(e) => setWord(e.target.value)}
              aria-label={tr({ ja: "自分の言葉で", en: "In your own words", fr: "Avec vos mots" })} placeholder={tr({ ja: "自分の言葉で…", en: "In your own words…", fr: "Avec vos mots…" })} />
            <button type="submit">{tr({ ja: "保存", en: "Save", fr: "Enregistrer" })}</button>
          </form>
          <SourceLink source={SOURCES.labeling} tr={tr} />
        </section>
      )}

      <Letter data={data} name={name} tr={tr} onBreathe={() => setMode("breathe")} />

      <section className="kokoro-ritual">
        <div className="ritual-art" aria-hidden="true"><span /><span /><span /></div>
        <div className="ritual-text">
          <p className="eyebrow">{tr({ ja: "面接前の3分", en: "3 minutes before the interview", fr: "3 minutes avant l'entretien" })}</p>
          <h3>{nextInterview
            ? tr({ ja: `${formatDay(nextInterview.date, "ja")}、${nextInterview.title}の面接の前に`, en: `Before your interview at ${nextInterview.title}, ${formatDay(nextInterview.date, "en")}`, fr: `Avant votre entretien chez ${nextInterview.title}, ${formatDay(nextInterview.date, "fr")}` })
            : tr({ ja: "呼吸して、大切なことを思い出して、ひとこと。", en: "Breathe, remember what matters, one sentence.", fr: "Respirer, se rappeler l'essentiel, une phrase." })}</h3>
        </div>
        <button className="primary" onClick={() => setMode("ritual")}>{tr({ ja: "はじめる", en: "Start", fr: "Commencer" })}</button>
      </section>

      <section className="kokoro-block garden" aria-label={tr({ ja: "この4週間の天気", en: "The last 4 weeks", fr: "Les 4 dernières semaines" })}>
        <h3>{tr({ ja: "この4週間", en: "The last 4 weeks", fr: "Ces 4 semaines" })}</h3>
        <div className="garden-dots">
          {days.map((d) => {
            const m = byDate.get(d);
            const label = m ? tr(WEATHERS.find((w) => w.id === m.weather)!.label) : "";
            return <span key={d} className={`dot${m ? ` ${m.weather}` : ""}${d === today ? " today" : ""}`} title={`${formatDay(d, tr.lang)}${m ? ` · ${label}` : ""}${m?.word ? ` · ${m.word}` : ""}`} />;
          })}
        </div>
        <p className="garden-legend">
          {WEATHERS.map((w) => <span key={w.id}><i className={`dot ${w.id}`} />{tr(w.label)} {counted[w.id]}</span>)}
        </p>
      </section>

      <section className="kokoro-block values" aria-label={tr({ ja: "大切にしていること", en: "What matters to me", fr: "Ce qui compte pour moi" })}>
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
        ) : data.values.length > 0 ? (
          <>
            <ul className="values-notes">{data.values.map((v) => <li key={v}>{v}</li>)}</ul>
            <button className="link" onClick={editValues}>{tr({ ja: "書きなおす", en: "Edit", fr: "Modifier" })}</button>
          </>
        ) : (
          <div className="values-empty">
            <p>{tr({ ja: "面接の前に読み返す、自分のための3行。", en: "Three lines for yourself, to reread before interviews.", fr: "Trois lignes pour vous, à relire avant les entretiens." })}</p>
            <button onClick={editValues}>{tr({ ja: "書く", en: "Write", fr: "Écrire" })}</button>
          </div>
        )}
      </section>

      <Helplines data={data} tr={tr} />

      <footer className="kokoro-foot">
        <p>{tr({ ja: "この記録はあなただけのものです。AIには送りません。", en: "These records are yours only. They are never sent to the AI.", fr: "Ce journal n'appartient qu'à vous. Il n'est jamais envoyé à l'IA." })}</p>
        <details>
          <summary>{tr({ ja: "このページの根拠", en: "What this page is based on", fr: "Sur quoi repose cette page" })}</summary>
          <ul className="kokoro-sources">
            {Object.values(SOURCES).map((s) => (
              <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.name}</a><span>{tr(s.text)}</span></li>
            ))}
          </ul>
        </details>
        <button className="link danger" onClick={erase}>{tr({ ja: "記録をすべて消す", en: "Erase all records", fr: "Tout effacer" })}</button>
      </footer>

      {mode === "breathe" && (
        <Calm label={tr({ ja: "1分の呼吸", en: "One-minute breathing", fr: "Une minute de respiration" })} onClose={() => setMode("none")}>
          <h2>{tr({ ja: "一緒に、ゆっくり。", en: "Together, slowly.", fr: "Ensemble, doucement." })}</h2>
          <Breathing />
          <SourceLink source={SOURCES.breathing} tr={tr} />
        </Calm>
      )}
      {mode === "ritual" && (
        <Ritual values={data.values} company={nextInterview?.title} onClose={() => setMode("none")}
          onEditValues={() => { setMode("none"); editValues(); }} />
      )}
    </div>
  );
}
