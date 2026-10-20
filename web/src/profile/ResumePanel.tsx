import { useEffect, useState } from "react";
import { downloadResume, downloadWorkHistory, listDrafts, type Draft, type ResumeOutcome } from "../api";
import { useAuth } from "../auth/auth";

const DEFAULT_WISHES = "貴社の規定に従います。";

type Kind = "resume" | "workHistory";
type Era = "western" | "japanese";
type Status = "idle" | "busy" | "done" | Extract<ResumeOutcome, { ok: false }>["error"];

/** 履歴書 (S11) et 職務経歴書 (S12) en PDF, à partir du profil enregistré. */
export function ResumePanel() {
  const auth = useAuth();
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
      <select aria-label="ESから入れる / Fill from an ES" value=""
        onChange={(e) => { const d = withBody.find((x) => x.id === e.target.value); if (d) set(key, d.body); }}>
        <option value="">ESから入れる / Fill from an ES</option>
        {withBody.map((d) => <option key={d.id} value={d.id}>{d.company || "共通"}：{d.question}</option>)}
      </select>
    );
  const area = (key: keyof typeof texts, label: string, rows: number, max: number) => (
    <label>
      <span>{label}</span>
      <textarea rows={rows} value={texts[key]} onChange={(e) => set(key, e.target.value)} maxLength={max} />
    </label>
  );

  return (
    <section className="resume" aria-label="応募書類PDF / Application documents">
      <h2>応募書類PDF / Application documents</h2>
      <div className="grid">
        <label>
          <span>書類 / Document</span>
          <select value={kind} onChange={(e) => { setKind(e.target.value as Kind); setStatus("idle"); }}>
            <option value="resume">履歴書 / Résumé (rirekisho)</option>
            <option value="workHistory">職務経歴書 / Work history (shokumu keirekisho)</option>
          </select>
        </label>
        <label>
          <span>年の書き方 / Years</span>
          <select value={era} onChange={(e) => setEra(e.target.value as Era)}>
            <option value="western">西暦（2026年）/ Western</option>
            <option value="japanese">和暦（令和8年）/ Japanese era</option>
          </select>
        </label>
      </div>
      <p className="muted">
        {kind === "resume"
          ? "厚生労働省の様式で作成します。/ Ministry of Health, Labour and Welfare format."
          : "職歴（アルバイト・インターン含む）を時系列でまとめます。/ Your work experience (part-time jobs and internships included), in chronological order."}
      </p>

      {kind === "resume" ? (
        <>
          {area("appeal", "志望の動機・特技・アピールポイントなど / Motivation, skills, strengths", 6, 1500)}
          {fromEs("appeal")}
          {area("wishes", "本人希望記入欄 / Your requests", 2, 500)}
        </>
      ) : (
        <>
          {area("summary", "職務要約 / Summary (2–3 sentences)", 3, 800)}
          {area("skills", "活かせる経験・知識・スキル / Skills you can bring", 4, 1500)}
          {area("selfPr", "自己PR / Self-PR", 6, 1500)}
          {fromEs("selfPr")}
        </>
      )}

      <div className="actions">
        <button className="primary" type="button" onClick={generate} disabled={status === "busy"}>
          {status === "busy" ? "作成中… / Creating…" : "PDFをダウンロード / Download PDF"}
        </button>
        <span role="status" className="muted">
          {status === "done" && "ダウンロードしました / Downloaded"}
          {status === "profile_missing" && "先にプロフィールを保存してください / Save your profile first"}
          {status === "no_work" && "職歴がありません。プロフィールに職歴を追加してください / Add work experience to your profile first"}
          {status === "invalid" && "入力を確認してください / Please check your input"}
          {status === "failed" && "作成できませんでした / Could not create the PDF"}
        </span>
      </div>
    </section>
  );
}
