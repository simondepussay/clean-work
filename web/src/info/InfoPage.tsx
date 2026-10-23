import { useEffect, useState } from "react";
import { getArticles, getNews, type Article, type NewsItem, type NewsSource } from "../api";
import { useAuth } from "../auth/auth";
import { formatDay, useTr } from "../i18n";
import { ArrowRightIcon, BriefcaseIcon, DocIcon, LightIcon } from "../icons";
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
  const [articles, setArticles] = useState<Article[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [news, setNews] = useState<{ sources: NewsSource[]; items: NewsItem[] } | null | "error">(null);
  const [source, setSource] = useState<string>("all");

  useEffect(() => {
    getArticles().then((a) => setArticles([...a].sort((x, y) => y.date.localeCompare(x.date))));
    auth.getToken()
      .then((t) => (t ? getNews(t) : null))
      .then((r) => setNews(r?.ok && r.value && Array.isArray(r.value.items) ? r.value : "error"))
      .catch(() => setNews("error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <section aria-label={tr({ ja: "記事・インタビュー", en: "Articles and interviews", fr: "Articles et interviews" })}>
          <h2>{tr({ ja: "記事・インタビュー", en: "Articles and interviews", fr: "Articles et interviews" })}</h2>
          {articles.length === 0 && <p className="muted">{tr({ ja: "記事を準備中です", en: "Articles are coming soon", fr: "Articles à venir" })}</p>}
          <div className="articles">
            {articles.map((a) => (
              <article key={a.id} className="card article">
                <p className="article-meta">
                  <span className="tag">{a.kind === "interview" ? tr({ ja: "インタビュー", en: "Interview", fr: "Interview" }) : tr({ ja: "記事", en: "Article", fr: "Article" })}</span>
                  {formatDay(a.date, lang, false)}
                </p>
                <h3>{tr(a.title)}</h3>
                <p>{tr(a.summary)}</p>
                {open === a.id ? (
                  <div className="article-body" lang={a.lang}>{a.body.split("\n\n").map((p, i) => <p key={i}>{p}</p>)}</div>
                ) : (
                  <button className="link" onClick={() => setOpen(a.id)}>
                    {tr({ ja: "続きを読む", en: "Read more", fr: "Lire la suite" })} <ArrowRightIcon size={14} />
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>

        <section aria-label={tr({ ja: "ニュース", en: "News", fr: "Actualités" })}>
          <div className="news-head">
            <h2>{tr({ ja: "就活・雇用のニュース", en: "Jobs and employment news", fr: "Actualité de l'emploi" })}</h2>
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
