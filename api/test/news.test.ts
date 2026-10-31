import { describe, expect, it } from "vitest";
import { latestNews, NEWS_SOURCES, parseFeed, resetNewsCache, text } from "../src/lib/news";

const rss2 = `<?xml version="1.0"?><rss version="2.0"><channel><title>JT</title>
<item><title><![CDATA[Japan's job-to-applicant ratio &amp; wages]]></title><link>https://www.japantimes.co.jp/a</link>
<pubDate>Thu, 22 Oct 2026 09:00:00 +0900</pubDate><description><![CDATA[<p>Hiring of <b>foreign</b> graduates rose…</p>]]></description></item>
<item><title>No link</title></item>
</channel></rss>`;

const rdf = `<rdf:RDF xmlns="http://purl.org/rss/1.0/"><channel><title>厚生労働省</title></channel>
<item rdf:about="https://www.mhlw.go.jp/stf/newpage_1.html"><title>外国人雇用状況の届出&#12398;まとめ</title>
<link>https://www.mhlw.go.jp/stf/newpage_1.html</link><dc:date>2026-10-23T10:00:00+09:00</dc:date></item>
</rdf:RDF>`;

describe("actualités (RSS)", () => {
  it("texte : sans CDATA ni HTML, entités décodées", () => {
    expect(text("<![CDATA[<p>A &amp; B</p>]]>")).toBe("A & B");
    expect(text("&#12398;&#x306E;")).toBe("のの");
  });

  it("RSS 2.0 : titre, lien, date ISO, extrait sans HTML ; ignore un article sans lien", () => {
    expect(parseFeed(rss2, "japantimes")).toEqual([{
      source: "japantimes", title: "Japan's job-to-applicant ratio & wages", link: "https://www.japantimes.co.jp/a",
      date: "2026-10-22T00:00:00.000Z", excerpt: "Hiring of foreign graduates rose…",
    }]);
  });

  it("RSS 1.0 (RDF, comme le 厚生労働省) : date dc:date", () => {
    expect(parseFeed(rdf, "mhlw")).toMatchObject([{ title: "外国人雇用状況の届出のまとめ", date: "2026-10-23T01:00:00.000Z" }]);
  });

  it("toutes les sources, les plus récentes d'abord ; une source en panne n'empêche pas les autres ; cache", async () => {
    resetNewsCache();
    let calls = 0;
    const fetcher = async (url: string) => {
      calls++;
      if (url === NEWS_SOURCES[1].url) return rdf;
      if (url === NEWS_SOURCES[2].url) return rss2;
      throw new Error("panne");
    };
    const items = await latestNews(fetcher, 0);
    expect(items.map((i) => i.source)).toEqual(["jetro", "japantimes"]);
    expect(NEWS_SOURCES.map((s) => s.id), "le 厚生労働省 n'est plus qu'un lien").toEqual(["nhk", "jetro", "japantimes"]);
    await latestNews(fetcher, 10 * 60 * 1000);
    expect(calls, "relu au plus toutes les 30 minutes").toBe(NEWS_SOURCES.length);
    await latestNews(fetcher, 31 * 60 * 1000);
    expect(calls).toBe(NEWS_SOURCES.length * 2);
  });
});
