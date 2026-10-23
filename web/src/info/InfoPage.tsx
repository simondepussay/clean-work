import { useEffect, useState } from "react";
import { getInfoPage, getNews, type InfoPageData, type NewsItem, type NewsSource } from "../api";
import { useAuth } from "../auth/auth";
import { formatDay, useTr } from "../i18n";
import { ArrowRightIcon, BriefcaseIcon, ChevronLeftIcon, ChevronRightIcon, DocIcon, LightIcon } from "../icons";
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
 * officielles ; au centre, les articles et interviews de Clean Work puis l'actualité (RSS).
 */
export function InfoPage() {
  const auth = useAuth();
  const tr = useTr();
  const lang = tr.lang;
  const [cards, setCards] = useState<InfoPageData | null | "error">(null);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [news, setNews] = useState<{ sources: NewsSource[]; items: NewsItem[] } | null | "error">(null);
  const [source, setSource] = useState<string>("all");

  useEffect(() => {
    auth.getToken()
      .then((t) => (t ? getNews(t) : null))
      .then((r) => setNews(r?.ok && r.value && Array.isArray(r.value.items) ? r.value : "error"))
      .catch(() => setNews("error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Une page de 7 cartes (articles et sélection du jour), rechargée quand on change de page.
  useEffect(() => {
    auth.getToken()
      .then((t) => (t ? getInfoPage(t, page) : null))
      .then((r) => setCards(r?.ok && r.value && Array.isArray(r.value.items) ? r.value : "error"))
      .catch(() => setCards("error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const goTo = (n: number) => {
    setPage(n);
    setOpen(null);
    document.querySelector(".info-main")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  const sourceName = (id: string) => (news && news !== "error" ? news.sources.find((s) => s.id === id)?.name : undefined) ?? id;
  const items = news && news !== "error" ? news.items.filter((i) => source === "all" || i.source === source) : [];

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
        <section aria-label={tr({ ja: "今日の就活ニュースと記事", en: "Today's picks and articles", fr: "Sélection du jour et articles" })}>
          <h2>{tr({ ja: "今日の就活ニュースと記事", en: "Today's picks and articles", fr: "Sélection du jour et articles" })}</h2>
          <p className="muted small">{tr({
            ja: "毎朝、留学生の就活に役立つニュースを5つ選んで紹介します。",
            en: "Every morning, 5 news items useful for international students' job hunting.",
            fr: "Chaque matin, 5 actualités utiles à la recherche d'emploi des étudiants étrangers.",
          })}</p>
          {cards === null && <p className="muted">…</p>}
          {cards === "error" && <p className="muted">{tr({ ja: "読み込めませんでした", en: "Could not load", fr: "Chargement impossible" })}</p>}
          <div className="articles">
            {cards && cards !== "error" && cards.items.map((a) => (
              <article key={a.id} className={`card article ${a.kind}`}>
                <p className="article-meta">
                  <span className="tag">{a.kind === "news"
                    ? (cards.sources.find((s) => s.id === a.source)?.name ?? tr({ ja: "ニュース", en: "News", fr: "Actualité" }))
                    : a.kind === "interview" ? tr({ ja: "インタビュー", en: "Interview", fr: "Interview" }) : tr({ ja: "記事", en: "Article", fr: "Article" })}</span>
                  {formatDay(a.date, lang, false)}
                </p>
                <h3>{tr(a.title)}</h3>
                <p>{tr(a.summary)}</p>
                {a.kind === "news" && a.link ? (
                  <a className="link-out" href={a.link} target="_blank" rel="noreferrer">
                    {tr({ ja: "記事を読む", en: "Read the article", fr: "Lire l'article" })} <ArrowRightIcon size={14} />
                  </a>
                ) : open === a.id ? (
                  <div className="article-body" lang={a.lang}>{(a.body ?? "").split("\n\n").map((p, i) => <p key={i}>{p}</p>)}</div>
                ) : (
                  <button className="link" onClick={() => setOpen(a.id)}>
                    {tr({ ja: "続きを読む", en: "Read more", fr: "Lire la suite" })} <ArrowRightIcon size={14} />
                  </button>
                )}
              </article>
            ))}
          </div>
          {cards && cards !== "error" && cards.pages > 1 && (
            <nav className="pager" aria-label={tr({ ja: "ページ", en: "Pages", fr: "Pages" })}>
              <button className="icon-button" disabled={page <= 1} onClick={() => goTo(page - 1)} aria-label={tr({ ja: "前へ", en: "Previous", fr: "Précédent" })}><ChevronLeftIcon /></button>
              {Array.from({ length: cards.pages }, (_, i) => i + 1).map((n) => (
                <button key={n} aria-current={n === cards.page ? "page" : undefined} onClick={() => goTo(n)}>{n}</button>
              ))}
              <button className="icon-button" disabled={page >= cards.pages} onClick={() => goTo(page + 1)} aria-label={tr({ ja: "次へ", en: "Next", fr: "Suivant" })}><ChevronRightIcon /></button>
            </nav>
          )}
        </section>

        <section aria-label={tr({ ja: "ニュース", en: "News", fr: "Actualités" })}>
          <div className="news-head">
            <h2>{tr({ ja: "最新の見出し", en: "Latest headlines", fr: "Derniers titres" })}</h2>
            {news && news !== "error" && (
              <div className="chips-filter" role="group" aria-label={tr({ ja: "情報源", en: "Sources", fr: "Sources" })}>
                {[{ id: "all", name: tr({ ja: "すべて", en: "All", fr: "Toutes" }) }, ...news.sources].map((s) => (
                  <button key={s.id} aria-pressed={source === s.id} onClick={() => setSource(s.id)}>{s.name}</button>
                ))}
              </div>
            )}
          </div>
          {news === null && <p className="muted">…</p>}
          {news === "error" && <p className="muted">{tr({ ja: "ニュースを読み込めませんでした", en: "Could not load the news", fr: "Impossible de charger l'actualité" })}</p>}
          <ul className="news">
            {items.map((i) => (
              <li key={i.link}>
                <a href={i.link} target="_blank" rel="noreferrer">
                  <span className="news-meta">{sourceName(i.source)}{i.date && ` · ${formatDay(i.date, lang, false)}`}</span>
                  <strong>{i.title}</strong>
                  {i.excerpt && <small>{i.excerpt}</small>}
                </a>
              </li>
            ))}
          </ul>
          <p className="muted small"><DocIcon size={13} /> {tr({
            ja: "見出しとリンクは各サイトの RSS から自動で表示しています。記事は各サイトで読めます。",
            en: "Headlines and links come automatically from each site's RSS feed; read the full articles on their sites.",
            fr: "Titres et liens issus automatiquement des flux RSS de chaque site ; les articles se lisent sur leur site.",
          })}</p>
        </section>
      </div>
    </div>
  );
}
