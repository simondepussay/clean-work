import { useEffect, useState } from "react";
import { getCompanyFacts, searchCompanies, type CompanyFacts as Facts, type CompanyMatch, type LabelId } from "../api";
import { useAuth } from "../auth/auth";
import { BuildingIcon, CloseIcon, SearchIcon, ShieldIcon } from "../icons";
import { Loader } from "../Loader";
import { useTr, type T3 } from "../i18n";

/** Ce que chaque label d'État veut dire pour un étudiant (affiché sous le badge). */
const LABEL_MEANING: Record<LabelId, T3> = {
  kurumin: { ja: "子育てサポート企業", en: "Supports working parents", fr: "Soutient les parents" },
  eruboshi: { ja: "女性の活躍推進", en: "Promotes women's careers", fr: "Égalité femmes-hommes" },
  youthyell: { ja: "若者の採用・育成に積極的", en: "Good employer for young people", fr: "Bon employeur pour les jeunes" },
  kenkou: { ja: "社員の健康に配慮", en: "Cares about employee health", fr: "Santé au travail" },
  monisu: { ja: "障害者雇用に積極的", en: "Disability-inclusive employer", fr: "Inclusion du handicap" },
  anzen: { ja: "安全衛生の優良企業", en: "Safe workplace", fr: "Sécurité au travail" },
};

/**
 * Fiche officielle de l'entreprise (gBizINFO, 経済産業省) dans le formulaire d'une candidature :
 * on la retrouve par son nom, on la relie, puis on voit ses labels d'État et les chiffres du lieu de travail.
 * Tout le bloc disparaît si le service n'est pas configuré ou ne répond pas.
 */
export function CompanyFacts({ company, corporateNumber, onLink }: {
  company: string;
  corporateNumber?: string | null;
  onLink: (match: CompanyMatch | null) => void;
}) {
  const auth = useAuth();
  const tr = useTr();
  const [matches, setMatches] = useState<CompanyMatch[] | null>(null);
  const [facts, setFacts] = useState<Facts | null>(null);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  /** gBizINFO n'a pas répondu à la recherche (panne passagère) : on le dit, le bouton reste là. */
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFacts(null);
    if (!corporateNumber) return;
    setBusy(true);
    auth.getToken()
      .then((t) => (t ? getCompanyFacts(t, corporateNumber) : null))
      .then((f) => (f ? setFacts(f) : setUnavailable(true)))
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corporateNumber]);

  async function search() {
    setBusy(true);
    try {
      setFailed(false);
      const t = await auth.getToken();
      const found = t ? await searchCompanies(t, company) : "error";
      if (found === "off") setUnavailable(true);
      else if (found === "error") setFailed(true);
      else setMatches(found);
    } finally {
      setBusy(false);
    }
  }

  if (unavailable && !corporateNumber) return null;
  const source = <p className="facts-source">{tr({ ja: "出典：gBizINFO（経済産業省）", en: "Source: gBizINFO (METI)", fr: "Source : gBizINFO (ministère japonais de l'Économie)" })}</p>;

  if (!corporateNumber) {
    return (
      <section className="company-facts" aria-label={tr({ ja: "企業データ", en: "Company data", fr: "Données de l'entreprise" })}>
        {matches === null || matches.length === 0 ? (
          <>
            <button type="button" onClick={search} disabled={busy || company.trim().length < 2}>
              <SearchIcon size={15} /> {matches === null
                ? tr({ ja: "公式データで企業を探す", en: "Find the official company data", fr: "Trouver les données officielles de l'entreprise" })
                : tr({ ja: "もう一度探す", en: "Search again", fr: "Chercher à nouveau" })}
            </button>
            {matches?.length === 0 && (
              <p className="facts-hint" role="status">
                <strong>{tr({ ja: `「${company}」は見つかりませんでした。`, en: `No company found for “${company}”.`, fr: `Aucune entreprise trouvée pour « ${company} ».` })}</strong>
                {tr({
                  ja: "登記上の正式な社名か確認してください（例：「ソニー」ではなく「ソニーグループ」）。英字の社名はカタカナでも試してください。",
                  en: "Check that the company name is its official registered name (e.g. “ソニーグループ” rather than “ソニー”). For a name in Latin letters, also try it in katakana.",
                  fr: "Vérifiez qu'il s'agit du nom officiel enregistré (ex. « ソニーグループ » plutôt que « ソニー »). Pour un nom en lettres latines, essayez aussi en katakana.",
                })}
              </p>
            )}
            {failed && (
              <p className="facts-hint" role="alert">{tr({ ja: "公式データに接続できませんでした。少し時間をおいてお試しください。", en: "Could not reach the official data. Please try again in a moment.", fr: "Les données officielles ne répondent pas. Réessayez dans un instant." })}</p>
            )}
          </>
        ) : (
          <>
            <p className="facts-ask">{tr({ ja: "どの会社ですか？", en: "Which company is it?", fr: "De quelle entreprise s'agit-il ?" })}</p>
            <ul className="facts-matches">
              {matches.map((m) => (
                <li key={m.corporateNumber}>
                  <button type="button" onClick={() => { setMatches(null); onLink(m); }}>
                    <BuildingIcon size={16} /><strong>{m.name}</strong><span className="muted">{m.location ?? ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {busy && <Loader size={24} />}
      </section>
    );
  }

  return (
    <section className="company-facts linked card" aria-label={tr({ ja: "企業データ", en: "Company data", fr: "Données de l'entreprise" })}>
      <div className="facts-head">
        <h4><BuildingIcon size={18} /> {facts?.name ?? company}</h4>
        <button type="button" className="icon-button" onClick={() => onLink(null)} aria-label={tr({ ja: "リンクを外す", en: "Unlink", fr: "Retirer le lien" })}><CloseIcon size={14} /></button>
      </div>
      {busy && <Loader size={24} />}
      {facts && (
        <>
          <p className="muted facts-meta">
            {[facts.location,
              facts.employees !== null && tr({ ja: `従業員 ${facts.employees.toLocaleString()}人`, en: `${facts.employees.toLocaleString()} employees`, fr: `${facts.employees.toLocaleString()} salariés` }),
              facts.founded !== null && tr({ ja: `${facts.founded}年創業`, en: `founded ${facts.founded}`, fr: `fondée en ${facts.founded}` })]
              .filter(Boolean).join(" · ")}
          </p>
          {facts.labels.some((l) => l.id) ? (
            <ul className="facts-labels">
              {facts.labels.filter((l) => l.id).map((l) => (
                <li key={l.title} title={l.date ? `${l.title}（${l.date}）` : l.title}>
                  <ShieldIcon size={18} />
                  <span><strong>{l.title}</strong><small>{tr(LABEL_MEANING[l.id!])}</small></span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{tr({ ja: "国の認定（くるみん・えるぼし等）はまだ登録されていません", en: "No government labels (Kurumin, Eruboshi…) on record", fr: "Aucun label de l'État (くるみん, えるぼし…) enregistré" })}</p>
          )}
          {facts.workplace && (
            <dl className="facts-stats">
              {stat(facts.workplace.overtimeHours, { ja: "月平均残業", en: "Overtime / month", fr: "Heures sup. / mois" }, (v) => tr({ ja: `${v}時間`, en: `${v} h`, fr: `${v} h` }))}
              {stat(facts.workplace.averageYears, { ja: "平均勤続年数", en: "Average tenure", fr: "Ancienneté moyenne" }, (v) => tr({ ja: `${v}年`, en: `${v} yrs`, fr: `${v} ans` }))}
              {stat(facts.workplace.averageAge, { ja: "平均年齢", en: "Average age", fr: "Âge moyen" }, (v) => tr({ ja: `${v}歳`, en: `${v}`, fr: `${v} ans` }))}
              {stat(facts.workplace.femaleManagersPct, { ja: "女性管理職", en: "Women managers", fr: "Femmes managers" }, (v) => `${v}%`)}
              {stat(facts.workplace.paternityLeavePct, { ja: "男性の育休取得", en: "Paternity leave taken", fr: "Congé paternité pris" }, (v) => `${v}%`)}
            </dl>
          )}
          <p className="facts-links">
            <a href={`https://info.gbiz.go.jp/hojin/ichiran?hojinBango=${facts.corporateNumber}`} target="_blank" rel="noreferrer">
              {tr({ ja: "gBizINFOで詳しく見る", en: "More on gBizINFO", fr: "Plus de détails sur gBizINFO" })}
            </a>
            {facts.url && <a href={facts.url} target="_blank" rel="noreferrer">{tr({ ja: "企業サイト", en: "Company website", fr: "Site de l'entreprise" })}</a>}
          </p>
        </>
      )}
      {unavailable && !facts && !busy && <p className="muted">{tr({ ja: "企業データを読み込めませんでした", en: "Could not load the company data", fr: "Impossible de charger les données de l'entreprise" })}</p>}
      {source}
    </section>
  );

  function stat(value: number | null, label: T3, format: (v: number) => string) {
    if (value === null) return null;
    return <div key={label.en}><dt>{tr(label)}</dt><dd>{format(Math.round(value * 10) / 10)}</dd></div>;
  }
}
