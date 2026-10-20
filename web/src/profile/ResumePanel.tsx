import { useEffect, useState } from "react";
import { downloadResume, listDrafts, type Draft, type ResumeOptions } from "../api";
import { useAuth } from "../auth/auth";

const DEFAULT_WISHES = "貴社の規定に従います。";

/** Téléchargement du 履歴書 en PDF (S11), à partir du profil enregistré. */
export function ResumePanel() {
  const auth = useAuth();
  const [era, setEra] = useState<ResumeOptions["era"]>("western");
  const [appeal, setAppeal] = useState("");
  const [wishes, setWishes] = useState(DEFAULT_WISHES);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [status, setStatus] = useState<"idle" | "busy" | "done" | "profile_missing" | "invalid" | "failed">("idle");

  useEffect(() => {
    auth.getToken()
      .then((t) => (t ? listDrafts(t) : null))
      // Une réponse inattendue ne doit pas faire planter l'écran : on n'utilise qu'une vraie liste.
      .then((r) => r?.ok && Array.isArray(r.value) && setDrafts(r.value))
      .catch(() => {});
    // Chargé une fois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generate() {
    setStatus("busy");
    try {
      const token = await auth.getToken();
      if (!token) throw new Error("pas de jeton");
      const result = await downloadResume(token, { era, appeal, wishes });
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

  return (
    <section className="resume" aria-label="履歴書PDF / Résumé PDF">
      <h2>履歴書PDF / Résumé PDF</h2>
      <p className="muted">保存したプロフィールから、厚生労働省の様式で作成します。/ Created from your saved profile, in the Ministry of Health, Labour and Welfare format.</p>
      <div className="grid">
        <label>
          <span>年の書き方 / Years</span>
          <select value={era} onChange={(e) => setEra(e.target.value as ResumeOptions["era"])}>
            <option value="western">西暦（2026年）/ Western</option>
            <option value="japanese">和暦（令和8年）/ Japanese era</option>
          </select>
        </label>
        {withBody.length > 0 && (
          <label>
            <span>ESから入れる / Fill from an ES</span>
            <select value="" onChange={(e) => { const d = withBody.find((x) => x.id === e.target.value); if (d) setAppeal(d.body); }}>
              <option value="">選択 / Choose</option>
              {withBody.map((d) => <option key={d.id} value={d.id}>{d.company || "共通"}：{d.question}</option>)}
            </select>
          </label>
        )}
      </div>
      <label>
        <span>志望の動機・特技・アピールポイントなど / Motivation, skills, strengths</span>
        <textarea rows={6} value={appeal} onChange={(e) => setAppeal(e.target.value)} maxLength={1500} />
      </label>
      <label>
        <span>本人希望記入欄 / Your requests</span>
        <textarea rows={2} value={wishes} onChange={(e) => setWishes(e.target.value)} maxLength={500} />
      </label>
      <div className="actions">
        <button className="primary" type="button" onClick={generate} disabled={status === "busy"}>
          {status === "busy" ? "作成中… / Creating…" : "PDFをダウンロード / Download PDF"}
        </button>
        <span role="status" className="muted">
          {status === "done" && "ダウンロードしました / Downloaded"}
          {status === "profile_missing" && "先にプロフィールを保存してください / Save your profile first"}
          {status === "invalid" && "入力を確認してください / Please check your input"}
          {status === "failed" && "作成できませんでした / Could not create the PDF"}
        </span>
      </div>
    </section>
  );
}
