import { useEffect, useState } from "react";
import { getInfoPage, type InfoPageData } from "../api";
import { useAuth } from "../auth/auth";
import { formatDay, useTr } from "../i18n";
import { ArrowRightIcon, BriefcaseIcon, ChevronLeftIcon, ChevronRightIcon, LightIcon } from "../icons";
import { JOB_SITES, PARTNERS, RESOURCES, type InfoLink } from "./links";

function LinkList({ links }: { links: InfoLink[] }) {
  const tr = useTr();
  return (
    <ul className="link-list">
      {links.map((l) => (
        <li key={l.url}>
          <a href={l.url} target="_blank" rel="noreferrer">
            <strong>{l.name}</strong>
            <small>{tr(l.text)}</small>
          </a>
        </li>
      ))}
    </ul>
  );
}

/**
 * Onglet « 情報 » : à gauche, en hauteur, les partenaires, les sites d'offres et les ressources
 * officielles. Au centre, « 最新の見出し » : 5 actualités choisies chaque matin, gardées jour après
 * jour (7 par page) ; dessous, les nouvelles du site (articles et interviews de Clean Work).
 */
export function InfoPage() {
  const auth = useAuth();
  const tr = useTr();
  const lang = tr.lang;
  const [data, setData] = useState<InfoPageData | null | "error">(null);
  const [page, setPage] = useState(1);
  const [source, setSource] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  // Une page de 7 titres ; rechargée quand on change de page ou de source.
  useEffect(() => {
    auth.getToken()
      .then((t) => (t ? getInfoPage(t, page, source) : null))
      .then((r) => setData(r?.ok && r.value && Array.isArray(r.value.items) ? r.value : "error"))
      .catch(() => setData("error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, source]);

  const goTo = (n: number) => {
    setPage(n);
    document.querySelector(".info-main")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };
  const chooseSource = (id: string) => {
    setSource(id);
    setPage(1);
  };
  const ready = data && data !== "error" ? data : null;
  const sourceName = (id?: string) => ready?.sources.find((s) => s.id === id)?.name ?? tr({ ja: "ニュース", en: "News", fr: "Actualité" });

  return (
    <div className="info">
      <aside className="info-side" aria-label={tr({ ja: "リンク", en: "Links", fr: "Liens" })}>
        <section>
          <h3>{tr({ ja: "パートナー", en: "Partners", fr: "Partenaires" })}</h3>
          <LinkList links={PARTNERS} />
        </section>
        <section>
          <h3><BriefcaseIcon size={16} /> {tr({ ja: "求人サイト", en: "Job sites", fr: "Sites d'offres d'emploi" })}</h3>
          <LinkList links={JOB_SITES} />
        </section>
        <section>
          <h3><LightIcon size={16} /> {tr({ ja: "役立つ公式情報", en: "Useful official information", fr: "Informations officielles utiles" })}</h3>
          <LinkList links={RESOURCES} />
        </section>
      </aside>

      <div className="info-main">
        <section aria-label={tr({ ja: "最新の見出し", en: "Latest headlines", fr: "Derniers titres" })}>
          <div className="news-head">
            <h2>{tr({ ja: "最新の見出し", en: "Latest headlines", fr: "Derniers titres" })}</h2>
            {ready && (
              <div className="chips-filter" role="group" aria-label={tr({ ja: "情報源", en: "Sources", fr: "Sources" })}>
                {[{ id: "", name: tr({ ja: "すべて", en: "All", fr: "Toutes" }) }, ...ready.sources].map((s) => (
                  <button key={s.id || "all"} aria-pressed={source === s.id} onClick={() => chooseSource(s.id)}>{s.name}</button>
                ))}
              </div>
            )}
          </div>
          {data === null && <p className="muted">…</p>}
          {data === "error" && <p className="muted">{tr({ ja: "読み込めませんでした", en: "Could not load", fr: "Chargement impossible" })}</p>}
          {ready && ready.items.length === 0 && <p className="muted">{tr({ ja: "まだありません", en: "Nothing yet", fr: "Rien pour l'instant" })}</p>}
          <ul className="news">
            {ready?.items.map((a) => (
              <li key={a.id}>
                <a href={a.link} target="_blank" rel="noreferrer">
                  <span className="news-meta">{sourceName(a.source)} · {formatDay(a.date, lang, false)}</span>
                  <strong>{tr(a.title)}</strong>
                  <small>{tr(a.summary)}</small>
                </a>
              </li>
            ))}
          </ul>
          {ready && ready.pages > 1 && (
            <nav className="pager" aria-label={tr({ ja: "ページ", en: "Pages", fr: "Pages" })}>
              <button className="icon-button" disabled={page <= 1} onClick={() => goTo(page - 1)} aria-label={tr({ ja: "前へ", en: "Previous", fr: "Précédent" })}><ChevronLeftIcon /></button>
              {Array.from({ length: ready.pages }, (_, i) => i + 1).map((n) => (
                <button key={n} aria-current={n === ready.page ? "page" : undefined} onClick={() => goTo(n)}>{n}</button>
              ))}
              <button className="icon-button" disabled={page >= ready.pages} onClick={() => goTo(page + 1)} aria-label={tr({ ja: "次へ", en: "Next", fr: "Suivant" })}><ChevronRightIcon /></button>
            </nav>
          )}
        </section>

        <section aria-label={tr({ ja: "Clean Work からのお知らせ", en: "News from Clean Work", fr: "Nouvelles de Clean Work" })}>
          <h2>{tr({ ja: "Clean Work からのお知らせ", en: "News from Clean Work", fr: "Nouvelles de Clean Work" })}</h2>
          <div className="articles">
            {ready?.articles.map((a) => (
              <article key={a.id} className="card article">
                <p className="article-meta">
                  <span className="tag">{a.kind === "interview" ? tr({ ja: "インタビュー", en: "Interview", fr: "Interview" }) : tr({ ja: "記事", en: "Article", fr: "Article" })}</span>
                  {formatDay(a.date, lang, false)}
                </p>
                <h3>{tr(a.title)}</h3>
                <p>{tr(a.summary)}</p>
                {open === a.id ? (
                  <div className="article-body" lang={a.lang}>{(a.body ?? "").split("\n\n").map((p, i) => <p key={i}>{p}</p>)}</div>
                ) : (
                  <button className="link" onClick={() => setOpen(a.id)}>
                    {tr({ ja: "続きを読む", en: "Read more", fr: "Lire la suite" })} <ArrowRightIcon size={14} />
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
