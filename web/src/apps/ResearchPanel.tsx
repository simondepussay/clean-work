import { useEffect, useState } from "react";
import { getResearchUsage, researchCompany, type AdviceOutcome, type Application, type Usage } from "../api";
import { useAuth } from "../auth/auth";
import { CheckIcon, CopyIcon, SearchIcon } from "../icons";
import { useTr, type Tr } from "../i18n";

const LOCALE = { ja: "ja-JP", en: "en-US", fr: "fr-FR" } as const;

function refusal(outcome: Exclude<AdviceOutcome, { ok: true }>, tr: Tr) {
  if (outcome.error === "limit") {
    const d = new Date(outcome.retryAfter).toLocaleDateString(LOCALE[tr.lang]);
    if (outcome.reason === "budget") return tr({ ja: `今月のAI機能は終了しました。${d}から再開します`, en: `AI features are paused until ${d}`, fr: `Les fonctions IA reprendront le ${d}` });
    return outcome.reason === "day"
      ? tr({ ja: `今日の上限です。${d}から使えます`, en: `Today's limit is reached; available again on ${d}`, fr: `Limite du jour atteinte ; de nouveau disponible le ${d}` })
      : tr({ ja: `今月の上限です。${d}から使えます`, en: `This month's limit is reached; available again on ${d}`, fr: `Limite du mois atteinte ; de nouveau disponible le ${d}` });
  }
  if (outcome.error === "ai_not_configured") return tr({ ja: "企業研究は準備中です", en: "Company research is not available yet", fr: "La recherche sur l'entreprise n'est pas encore disponible" });
  return tr({ ja: "作成に失敗しました。回数は使われていません", en: "It failed; nothing was counted", fr: "Échec ; rien n'a été compté" });
}

/**
 * 企業研究 : la fiche de recherche d'une entreprise, préparée par l'IA à partir de la fiche officielle
 * (gBizINFO, si la candidature y est reliée) et des notes enregistrées — rien d'autre. Elle se construit
 * sur ce qui est enregistré : une note ou un lien ajoutés dans le formulaire comptent après « 保存 ».
 */
export function ResearchPanel({ application, onChange }: { application: Application; onChange: (app: Application) => void }) {
  const auth = useAuth();
  const tr = useTr();
  const [research, setResearch] = useState(application.research ?? null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    auth.getToken().then(async (t) => {
      const u = t ? await getResearchUsage(t) : null;
      if (u?.ok) setUsage(u.value);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      const token = await auth.getToken();
      if (!token) throw new Error("pas de jeton");
      const outcome = await researchCompany(token, application.id, tr.lang);
      if (outcome.ok) {
        setResearch(outcome.application.research ?? null);
        onChange(outcome.application);
        if (outcome.remaining) setUsage(outcome.remaining);
      } else {
        setMessage(refusal(outcome, tr));
      }
    } catch {
      setMessage(refusal({ ok: false, error: "ai_failed" }, tr));
    } finally {
      setBusy(false);
    }
  }

  async function copyQuestions() {
    if (!research) return;
    try {
      await navigator.clipboard.writeText(research.questions.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* presse-papiers refusé : le texte reste sélectionnable */ }
  }

  const sources = [
    application.corporateNumber ? tr({ ja: "公式データ（gBizINFO）", en: "official data (gBizINFO)", fr: "données officielles (gBizINFO)" }) : null,
    application.notes?.trim() ? tr({ ja: "企業メモ・求人票", en: "your notes and the job offer", fr: "vos notes et l'offre" }) : null,
  ].filter(Boolean);

  return (
    <section className="research-panel" aria-label={tr({ ja: "企業研究", en: "Company research", fr: "Recherche sur l'entreprise" })}>
      <p className="muted">
        {sources.length > 0
          ? tr({ ja: `${sources.join("と")}だけをもとに作ります。`, en: `Built only from ${sources.join(" and ")}.`, fr: `Préparée uniquement à partir de : ${sources.join(" et ")}.` })
          : tr({
            ja: "まだ情報がありません。「公式データで企業を探す」で企業を選ぶか、求人票を企業メモに貼って保存すると、内容が具体的になります。",
            en: "No information yet. Link the company with “Find the company in official data”, or paste the job offer into the notes and save, to get something specific.",
            fr: "Aucune information pour l'instant. Reliez l'entreprise aux données officielles ou collez l'offre dans les notes, puis enregistrez, pour obtenir une fiche précise.",
          })}
      </p>
      <div className="review-bar">
        <button type="button" className="primary" onClick={run} disabled={busy || usage?.today === 0}>
          <SearchIcon size={15} /> {busy ? tr({ ja: "作成中…", en: "Working…", fr: "En cours…" }) : research ? tr({ ja: "作り直す", en: "Rebuild", fr: "Refaire" }) : tr({ ja: "AIでまとめる", en: "Summarise with AI", fr: "Préparer avec l'IA" })}
        </button>
        {usage && <span className="muted">{tr({ ja: `残り：今日 ${usage.today} · 今月 ${usage.month}`, en: `Left: ${usage.today} today · ${usage.month} this month`, fr: `Reste : ${usage.today} aujourd'hui · ${usage.month} ce mois-ci` })}</span>}
      </div>
      {message && <p role="alert" className="notice">{message}</p>}

      {research && (
        <div className="research-result">
          <p>{research.summary}</p>
          {research.angles.length > 0 && (
            <>
              <h4>{tr({ ja: "志望動機の切り口", en: "Angles for your motivation", fr: "Pistes pour le 志望動機" })}</h4>
              <ul>{research.angles.map((a) => <li key={a}>{a}</li>)}</ul>
            </>
          )}
          {research.questions.length > 0 && (
            <>
              <h4>{tr({ ja: "逆質問", en: "Questions to ask (逆質問)", fr: "Questions à poser (逆質問)" })}</h4>
              <ol lang="ja">{research.questions.map((q) => <li key={q}>{q}</li>)}</ol>
              <button type="button" onClick={copyQuestions}>
                {copied ? <><CheckIcon size={14} /> {tr({ ja: "コピーしました", en: "Copied", fr: "Copié" })}</> : <><CopyIcon size={14} /> {tr({ ja: "逆質問をコピー", en: "Copy the questions", fr: "Copier les questions" })}</>}
              </button>
            </>
          )}
          {research.missing.length > 0 && (
            <>
              <h4>{tr({ ja: "自分で調べること", en: "To look up yourself", fr: "À chercher vous-même" })}</h4>
              <ul>{research.missing.map((m) => <li key={m}>{m}</li>)}</ul>
            </>
          )}
          <p className="muted research-note">{tr({
            ja: "AIは保存されたデータだけを読んでいます。最新の情報は、企業の公式サイトで必ず確かめてください。",
            en: "The AI only read the saved data. Always check the company's official site for current information.",
            fr: "L'IA n'a lu que les données enregistrées. Vérifiez toujours les informations récentes sur le site officiel de l'entreprise.",
          })} <span>({new Date(research.createdAt).toLocaleDateString(LOCALE[tr.lang])})</span></p>
        </div>
      )}
    </section>
  );
}
