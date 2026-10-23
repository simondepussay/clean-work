import { useEffect, useState } from "react";
import { downloadResume, downloadWorkHistory, listDrafts, type Draft, type ResumeOutcome } from "../api";
import { useAuth } from "../auth/auth";
import { useTr } from "../i18n";

const DEFAULT_WISHES = "貴社の規定に従います。";

type Kind = "resume" | "workHistory";
type Era = "western" | "japanese";
type Status = "idle" | "busy" | "done" | Extract<ResumeOutcome, { ok: false }>["error"];

/** 履歴書 (S11) et 職務経歴書 (S12) en PDF, à partir du profil enregistré. */
export function ResumePanel() {
  const auth = useAuth();
  const tr = useTr();
  const [kind, setKind] = useState<Kind>("resume");
  const [era, setEra] = useState<Era>("western");
  const [texts, setTexts] = useState({ appeal: "", wishes: DEFAULT_WISHES, summary: "", skills: "", selfPr: "" });
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
        ? await downloadResume(token, { era, appeal: texts.appeal, wishes: texts.wishes })
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
      <h2>{tr({ ja: "応募書類PDF", en: "Application documents (PDF)", fr: "Documents de candidature (PDF)" })}</h2>
      <div className="grid">
        <label>
          <span>{tr({ ja: "書類", en: "Document", fr: "Document" })}</span>
          <select value={kind} onChange={(e) => { setKind(e.target.value as Kind); setStatus("idle"); }}>
            <option value="resume">{tr({ ja: "履歴書", en: "Résumé (rirekisho)", fr: "CV japonais (rirekisho)" })}</option>
            <option value="workHistory">{tr({ ja: "職務経歴書", en: "Work history (shokumu keirekisho)", fr: "Historique professionnel (shokumu keirekisho)" })}</option>
          </select>
        </label>
        <label>
          <span>{tr({ ja: "年の書き方", en: "Years", fr: "Années" })}</span>
          <select value={era} onChange={(e) => setEra(e.target.value as Era)}>
            <option value="western">{tr({ ja: "西暦（2026年）", en: "Western (2026)", fr: "Occidentales (2026)" })}</option>
            <option value="japanese">{tr({ ja: "和暦（令和8年）", en: "Japanese era (Reiwa 8)", fr: "Ère japonaise (Reiwa 8)" })}</option>
          </select>
        </label>
      </div>
      <p className="muted">
        {kind === "resume"
          ? tr({ ja: "厚生労働省の様式で作成します。", en: "Created in the Ministry of Health, Labour and Welfare format.", fr: "Au format du ministère japonais de la Santé et du Travail." })
          : tr({ ja: "職歴（アルバイト・インターン含む）を時系列でまとめます。", en: "Your work experience (part-time jobs and internships included), in chronological order.", fr: "Votre expérience (petits boulots et stages compris), par ordre chronologique." })}
      </p>

      {kind === "resume" ? (
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
