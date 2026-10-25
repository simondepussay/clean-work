/**
 * Actualités de l'onglet « 情報 » : les titres récents de quelques sources publiques (RSS),
 * avec la date, un court extrait et le lien vers l'article. On ne copie jamais l'article :
 * le titre et le lien suffisent pour aller le lire chez son éditeur.
 *
 * Les flux sont relus au plus toutes les 30 minutes (cache en mémoire) : peu de requêtes
 * vers les éditeurs, et une page rapide.
 */

export type NewsSource = { id: string; name: string; url: string; site: string; lang: "ja" | "en" };
export type NewsItem = { source: string; title: string; link: string; date: string | null; excerpt: string };

/** Sources vérifiées le 2026-10-23 (flux publics, prévus pour être lus par d'autres sites). */
export const NEWS_SOURCES: NewsSource[] = [
  { id: "mhlw", name: "厚生労働省", url: "https://www.mhlw.go.jp/stf/news.rdf", site: "https://www.mhlw.go.jp/", lang: "ja" },
  { id: "nhk", name: "NHK 経済", url: "https://www3.nhk.or.jp/rss/news/cat5.xml", site: "https://www3.nhk.or.jp/news/", lang: "ja" },
  { id: "jetro", name: "JETRO", url: "https://www.jetro.go.jp/rss/biznews.xml", site: "https://www.jetro.go.jp/", lang: "ja" },
  { id: "japantimes", name: "The Japan Times", url: "https://www.japantimes.co.jp/business/feed/", site: "https://www.japantimes.co.jp/", lang: "en" },
];

const PER_SOURCE = 8;
const EXCERPT = 140;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Texte d'une balise XML : sans CDATA, sans HTML, entités décodées, espaces resserrés. */
export function text(raw: string | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(\w+);/g, (m, name) => ENTITIES[name] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

const tag = (block: string, name: string) => new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(block)?.[1];

/** Les articles d'un flux RSS 2.0 ou RSS 1.0 (RDF) : assez simple pour ne pas ajouter de dépendance. */
export function parseFeed(xml: string, source: string): NewsItem[] {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  return blocks.slice(0, PER_SOURCE).flatMap((block) => {
    const title = text(tag(block, "title"));
    const link = text(tag(block, "link")) || (/<item[^>]*rdf:about="([^"]+)"/i.exec(block)?.[1] ?? "");
    if (!title || !/^https?:\/\//.test(link)) return [];
    const rawDate = text(tag(block, "pubDate")) || text(tag(block, "dc:date"));
    const parsed = rawDate ? new Date(rawDate) : null;
    const excerpt = text(tag(block, "description"));
    return [{
      source, title, link,
      date: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null,
      excerpt: excerpt.length > EXCERPT ? `${excerpt.slice(0, EXCERPT)}…` : excerpt,
    }];
  });
}

type Fetcher = (url: string) => Promise<string>;

const defaultFetcher: Fetcher = async (url) => {
  const res = await fetch(url, { headers: { "user-agent": "CleanWork/1.0 (+https://cleanwork.simondepussay.com)" }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${url} : ${res.status}`);
  return res.text();
};

let cache: { at: number; items: NewsItem[] } | null = null;
const TTL_MS = 30 * 60 * 1000;

/** Toutes les sources, les plus récents d'abord ; une source en panne n'empêche pas les autres. */
export async function latestNews(fetcher: Fetcher = defaultFetcher, now = Date.now(), useCache = true): Promise<NewsItem[]> {
  if (useCache && cache && now - cache.at < TTL_MS) return cache.items;
  const results = await Promise.allSettled(NEWS_SOURCES.map(async (s) => parseFeed(await fetcher(s.url), s.id)));
  const items = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  // Tout en panne : on garde l'ancien cache plutôt qu'une page vide.
  if (items.length > 0 || !cache) cache = { at: now, items };
  return cache.items;
}

/** Pour les tests. */
export function resetNewsCache() {
  cache = null;
}
