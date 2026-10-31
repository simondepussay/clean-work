import { useEffect, useState } from "react";
import { downloadResume, downloadWorkHistory, listDrafts, type Draft, type ResumeOutcome, type ResumeTemplate, type Weekday } from "../api";
import { useAuth } from "../auth/auth";
import { useTr } from "../i18n";

const DEFAULT_WISHES = "貴社の規定に従います。";

type Kind = "resume" | "workHistory";
type Era = "western" | "japanese";
const WEEKDAYS: { id: Weekday; ja: string; en: string; fr: string }[] = [
  { id: "mon", ja: "月", en: "Mon", fr: "Lun" }, { id: "tue", ja: "火", en: "Tue", fr: "Mar" }, { id: "wed", ja: "水", en: "Wed", fr: "Mer" },
  { id: "thu", ja: "木", en: "Thu", fr: "Jeu" }, { id: "fri", ja: "金", en: "Fri", fr: "Ven" }, { id: "sat", ja: "土", en: "Sat", fr: "Sam" },
  { id: "sun", ja: "日", en: "Sun", fr: "Dim" },
];
type Status = "idle" | "busy" | "done" | Extract<ResumeOutcome, { ok: false }>["error"];

/**
 * Les deux feuilles, au trait comme les icônes du site : 履歴書 (cadre photo, tableau des dates)
 * et 職務経歴書 (titres et paragraphes). Celle qu'on prépare passe devant.
 */
function Sheets({ front }: { front: Kind }) {
  const resume = (
    <g className="sheet">
      <rect x="0" y="0" width="96" height="128" rx="4" />
      <text x="10" y="18">履歴書</text>
      <path d="M10 28h44M10 38h44M10 48h44" />
      <rect className="photo" x="62" y="12" width="24" height="32" rx="1.5" />
      <path className="grid" d="M10 60h76M10 70h76M10 80h76M10 90h76M10 100h76M10 110h76M30 60v50" />
    </g>
  );
  const history = (
    <g className="sheet">
      <rect x="0" y="0" width="96" height="128" rx="4" />
      <text x="10" y="18">職務経歴書</text>
      <path className="accent" d="M10 30h30" />
      <path d="M10 38h76M10 45h70M10 52h74" />
      <path className="accent" d="M10 66h30" />
      <path d="M10 74h76M10 81h66M10 88h72M10 95h60" />
      <path className="accent" d="M10 108h22" />
      <path d="M10 116h56" />
    </g>
  );
  return (
    <svg className="resume-sheets" viewBox="0 0 150 150" aria-hidden="true">
      <g transform={`translate(${front === "resume" ? 44 : 8} 6) rotate(${front === "resume" ? 5 : -5} 48 64)`} className="behind">
        {front === "resume" ? history : resume}
      </g>
      <g transform={`translate(${front === "resume" ? 10 : 42} 14) rotate(${front === "resume" ? -3 : 3} 48 64)`}>
        {front === "resume" ? resume : history}
      </g>
    </svg>
  );
}

/**
 * 履歴書 (S11) et 職務経歴書 (S12) en PDF, à partir du profil enregistré.
 * Le 履歴書 existe en trois variantes, comme au Japon : 新卒用 (par défaut, c'est le 就活),
 * 一般用 (modèle du 厚生労働省) et アルバイト用.
 */
export function ResumePanel() {
  const auth = useAuth();
  const tr = useTr();
  const [kind, setKind] = useState<Kind>("resume");
  const [era, setEra] = useState<Era>("western");
  const [template, setTemplate] = useState<ResumeTemplate>("student");
  const [texts, setTexts] = useState({ appeal: "", wishes: DEFAULT_WISHES, summary: "", skills: "", selfPr: "", gakuchika: "", hours: "", station: "", commute: "" });
  const [days, setDays] = useState<Weekday[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    auth.getToken()
      .then((t) => (t ? listDrafts(t) : null))
      // Une réponse inattendue ne doit pas faire planter l'écran : on n'utilise qu'une vraie liste.
      .then((r) => r?.ok && Array.isArray(r.value) && setDrafts(r.value))
      .catch(() => {});
    // Chargé une fois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (key: keyof typeof texts, value: string) => setTexts((t) => ({ ...t, [key]: value }));

  async function generate() {
    setStatus("busy");
    try {
      const token = await auth.getToken();
      if (!token) throw new Error("pas de jeton");
      const result = kind === "resume"
        ? await downloadResume(token, {
          era, template, appeal: texts.appeal, wishes: texts.wishes,
          ...(template === "student" && { gakuchika: texts.gakuchika, selfPr: texts.selfPr }),
          ...(template === "baito" && {
            days: WEEKDAYS.map((d) => d.id).filter((d) => days.includes(d)), hours: texts.hours, station: texts.station,
            commute: Number(texts.commute) > 0 ? Math.round(Number(texts.commute)) : undefined,
          }),
        })
        : await downloadWorkHistory(token, { era, summary: texts.summary, skills: texts.skills, selfPr: texts.selfPr });
      if (!result.ok) return setStatus(result.error);
      const url = URL.createObjectURL(result.pdf);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setStatus("done");
    } catch {
      setStatus("failed");
    }
  }

  const withBody = drafts.filter((d) => d.body.trim());
  const fromEs = (key: keyof typeof texts) =>
    withBody.length > 0 && (
      <select aria-label={tr({ ja: "ESから入れる", en: "Fill from an ES", fr: "Remplir depuis une ES" })} value=""
        onChange={(e) => { const d = withBody.find((x) => x.id === e.target.value); if (d) set(key, d.body); }}>
        <option value="">{tr({ ja: "ESから入れる", en: "Fill from an ES", fr: "Remplir depuis une ES" })}</option>
        {withBody.map((d) => <option key={d.id} value={d.id}>{d.company || tr({ ja: "共通", en: "General", fr: "Commune" })}：{d.question}</option>)}
      </select>
    );
  const area = (key: keyof typeof texts, label: string, rows: number, max: number) => (
    <label>
      <span>{label}</span>
      <textarea rows={rows} value={texts[key]} onChange={(e) => set(key, e.target.value)} maxLength={max} />
    </label>
  );

  return (
    <section className="resume" aria-label={tr({ ja: "応募書類PDF", en: "Application documents", fr: "Documents de candidature" })}>
      <div className="grid">
        <label>
          <span>{tr({ ja: "書類", en: "Document", fr: "Document" })}</span>
          <select value={kind} onChange={(e) => { setKind(e.target.value as Kind); setStatus("idle"); }}>
            <option value="resume">{tr({ ja: "履歴書", en: "Résumé (rirekisho)", fr: "CV japonais (rirekisho)" })}</option>
            <option value="workHistory">{tr({ ja: "職務経歴書", en: "Work history (shokumu keirekisho)", fr: "Historique professionnel (shokumu keirekisho)" })}</option>
          </select>
        </label>
        {kind === "resume" && (
          <label>
            <span>{tr({ ja: "様式", en: "Template", fr: "Modèle" })}</span>
            <select value={template} onChange={(e) => { setTemplate(e.target.value as ResumeTemplate); setStatus("idle"); }}>
              <option value="student">{tr({ ja: "新卒用（就活）", en: "New graduates (job hunting)", fr: "Jeunes diplômés (就活)" })}</option>
              <option value="standard">{tr({ ja: "一般用（厚生労働省様式）", en: "General (ministry format)", fr: "Général (modèle du ministère)" })}</option>
              <option value="baito">{tr({ ja: "アルバイト・パート用", en: "Part-time job (baito)", fr: "Petit boulot (baito)" })}</option>
            </select>
          </label>
        )}
        <label>
          <span>{tr({ ja: "年の書き方", en: "Years", fr: "Années" })}</span>
          <select value={era} onChange={(e) => setEra(e.target.value as Era)}>
            <option value="western">{tr({ ja: "西暦（2026年）", en: "Western (2026)", fr: "Occidentales (2026)" })}</option>
            <option value="japanese">{tr({ ja: "和暦（令和8年）", en: "Japanese era (Reiwa 8)", fr: "Ère japonaise (Reiwa 8)" })}</option>
          </select>
        </label>
      </div>
      <div className="resume-intro">
        <Sheets front={kind} />
        <div>
      <p className="muted">
        {kind === "resume"
          ? {
            student: tr({ ja: "新卒の就活向け。志望動機・学生時代に力を入れたこと・自己PRの欄が大きい様式です。", en: "For graduate job hunting: large boxes for motivation, what you focused on as a student, and self-PR.", fr: "Pour le 就活 des jeunes diplômés : grandes cases pour la motivation, ce que tu as fait pendant tes études (gakuchika) et l'auto-présentation." }),
            standard: tr({ ja: "厚生労働省の様式。どの応募にも使えます。", en: "The Ministry of Health, Labour and Welfare format, accepted everywhere.", fr: "Le modèle du ministère japonais de la Santé et du Travail, accepté partout." }),
            baito: tr({ ja: "アルバイト・パート向け。勤務できる曜日・時間帯と通勤時間の欄があります。", en: "For part-time jobs: boxes for the days and hours you can work, and your commute.", fr: "Pour un petit boulot : cases pour les jours et horaires possibles, et le temps de trajet." }),
          }[template]
          : tr({ ja: "職歴（アルバイト・インターン含む）を時系列でまとめます。", en: "Your work experience (part-time jobs and internships included), in chronological order.", fr: "Votre expérience (petits boulots et stages compris), par ordre chronologique." })}
      </p>
          <details className="hint">
            <summary aria-label={tr({ ja: "どこから情報を取るの？", en: "Where does the information come from?", fr: "D'où viennent les informations ?" })}>?</summary>
            <p>
              {tr({
                ja: "氏名・連絡先・学歴・職歴・資格・語学は、プロフィールに保存した内容がそのまま入ります。ここで書くのは、この書類だけの欄です。直したいときはプロフィールを更新してください。",
                en: "Your name, contact details, education, work, certifications and languages come straight from your saved profile. Here you only write the parts specific to this document. To change the rest, update your profile.",
                fr: "Le nom, les coordonnées, les études, les expériences, les certifications et les langues sont repris de ton profil enregistré. Ici, tu n'écris que les cases propres à ce document. Pour changer le reste, modifie ton profil.",
              })}
              {kind === "resume" && template === "student" && (tr.lang === "ja" ? "" : " ") + tr({ ja: "新卒の履歴書では、アルバイトは職歴に書かないのが一般的です（自己PRや学生時代に力を入れたことで触れましょう）。", en: "On a graduate résumé, part-time jobs usually don't go under work history: mention them in your self-PR or gakuchika instead.", fr: "Sur un 履歴書 de jeune diplômé, on n'écrit en général pas les petits boulots dans 職歴 : parles-en plutôt dans l'auto-présentation ou le gakuchika." })}
              {kind === "resume" && (tr.lang === "ja" ? "" : " ") + tr({ ja: "写真の枠は空けてあるので、印刷して貼ってください。", en: "The photo box is left empty: print and paste your photo.", fr: "Le cadre photo reste vide : imprime et colle ta photo." })}
            </p>
          </details>
        </div>
      </div>

      {kind === "resume" && template === "student" ? (
        <>
          {area("appeal", tr({ ja: "志望動機", en: "Motivation", fr: "Motivation" }), 4, 1500)}
          {fromEs("appeal")}
          {area("gakuchika", tr({ ja: "学生時代に力を入れたこと", en: "What you focused on as a student", fr: "Ce que tu as fait pendant tes études (gakuchika)" }), 4, 1500)}
          {fromEs("gakuchika")}
          {area("selfPr", tr({ ja: "自己PR", en: "Self-PR", fr: "Auto-présentation (jiko PR)" }), 4, 1500)}
          {fromEs("selfPr")}
          {area("wishes", tr({ ja: "本人希望記入欄", en: "Your requests", fr: "Vos souhaits" }), 2, 500)}
        </>
      ) : kind === "resume" && template === "baito" ? (
        <>
          <fieldset className="weekdays">
            <legend>{tr({ ja: "勤務できる曜日", en: "Days you can work", fr: "Jours possibles" })}</legend>
            {WEEKDAYS.map((d) => (
              <label key={d.id} className="chip-check">
                <input type="checkbox" checked={days.includes(d.id)}
                  onChange={(e) => setDays((all) => (e.target.checked ? [...all, d.id] : all.filter((x) => x !== d.id)))} />
                <span>{tr(d)}</span>
              </label>
            ))}
          </fieldset>
          <label>
            <span>{tr({ ja: "時間帯", en: "Hours", fr: "Horaires" })}</span>
            <input value={texts.hours} onChange={(e) => set("hours", e.target.value)} maxLength={200}
              placeholder={tr({ ja: "例：平日17時以降、土日は終日", en: "e.g. weekdays after 5 pm, all day on weekends", fr: "ex. : en semaine après 17 h, le week-end toute la journée" })} />
          </label>
          <div className="grid">
            <label>
              <span>{tr({ ja: "最寄り駅", en: "Nearest station", fr: "Gare la plus proche" })}</span>
              <input value={texts.station} onChange={(e) => set("station", e.target.value)} maxLength={40} />
            </label>
            <label>
              <span>{tr({ ja: "通勤時間（分）", en: "Commute (minutes)", fr: "Trajet (minutes)" })}</span>
              <input type="number" min={1} max={300} inputMode="numeric" value={texts.commute} onChange={(e) => set("commute", e.target.value)} />
            </label>
          </div>
          {area("appeal", tr({ ja: "志望動機・自己PR・特技など", en: "Motivation, strengths, skills", fr: "Motivation, points forts, compétences" }), 4, 1500)}
          {area("wishes", tr({ ja: "本人希望記入欄", en: "Your requests", fr: "Vos souhaits" }), 2, 500)}
        </>
      ) : kind === "resume" ? (
        <>
          {area("appeal", tr({ ja: "志望の動機・特技・アピールポイントなど", en: "Motivation, skills, strengths", fr: "Motivation, compétences, points forts" }), 6, 1500)}
          {fromEs("appeal")}
          {area("wishes", tr({ ja: "本人希望記入欄", en: "Your requests", fr: "Vos souhaits" }), 2, 500)}
        </>
      ) : (
        <>
          {area("summary", tr({ ja: "職務要約（2〜3文）", en: "Summary (2–3 sentences)", fr: "Résumé (2 ou 3 phrases)" }), 3, 800)}
          {area("skills", tr({ ja: "活かせる経験・知識・スキル", en: "Skills you can bring", fr: "Compétences à apporter" }), 4, 1500)}
          {area("selfPr", tr({ ja: "自己PR", en: "Self-PR", fr: "Auto-présentation (jiko PR)" }), 6, 1500)}
          {fromEs("selfPr")}
        </>
      )}

      <div className="actions">
        <button className="primary" type="button" onClick={generate} disabled={status === "busy"}>
          {status === "busy" ? tr({ ja: "作成中…", en: "Creating…", fr: "Création…" }) : tr({ ja: "PDFをダウンロード", en: "Download PDF", fr: "Télécharger le PDF" })}
        </button>
        <span role="status" className="muted">
          {status === "done" && tr({ ja: "ダウンロードしました", en: "Downloaded", fr: "Téléchargé" })}
          {status === "profile_missing" && tr({ ja: "先にプロフィールを保存してください", en: "Save your profile first", fr: "Enregistrez d'abord votre profil" })}
          {status === "no_work" && tr({ ja: "職歴がありません。プロフィールに職歴を追加してください", en: "Add work experience to your profile first", fr: "Ajoutez d'abord une expérience à votre profil" })}
          {status === "invalid" && tr({ ja: "入力を確認してください", en: "Please check your input", fr: "Vérifiez votre saisie" })}
          {status === "failed" && tr({ ja: "作成できませんでした", en: "Could not create the PDF", fr: "Impossible de créer le PDF" })}
        </span>
      </div>
    </section>
  );
}
