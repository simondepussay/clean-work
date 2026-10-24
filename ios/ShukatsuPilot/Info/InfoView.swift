import SwiftUI

/// Liens de l'onglet « 情報 » (les mêmes que le site).
struct InfoLink: Identifiable {
    let name: String
    let url: String
    let ja: String, en: String, fr: String
    var id: String { url }
    var text: String { tr(ja, en, fr) }

    static let partners = [
        InfoLink(name: "JLPT Étude", url: "https://jlpt.simondepussay.com", ja: "JLPT N1 の語彙・漢字・文法を勉強するサイト", en: "Study JLPT N1 vocabulary, kanji and grammar", fr: "Réviser le vocabulaire, les kanji et la grammaire du JLPT N1"),
        InfoLink(name: "JLPT Kanji Otter Adventure", url: "https://apps.apple.com/us/app/jlpt-kanji-otter-adventure/id6497395953", ja: "ゲームで漢字を覚える iPhone アプリ", en: "An iPhone game for learning kanji", fr: "Un jeu iPhone pour apprendre les kanji"),
    ]
    static let jobSites = [
        InfoLink(name: "ハローワーク", url: "https://www.hellowork.mhlw.go.jp/", ja: "国の求人検索", en: "Japan's public job search", fr: "Recherche d'emploi publique"),
        InfoLink(name: "リクナビ", url: "https://job.rikunabi.com/", ja: "新卒向けの大手就職サイト", en: "Major site for new graduates", fr: "Grand site pour jeunes diplômés"),
        InfoLink(name: "マイナビ", url: "https://job.mynavi.jp/", ja: "新卒向けの大手就職サイト", en: "Major site for new graduates", fr: "Grand site pour jeunes diplômés"),
        InfoLink(name: "TokyoDev", url: "https://www.tokyodev.com/", ja: "外国人エンジニア向け（英語）", en: "Developer jobs for foreigners (English)", fr: "Postes de développeur pour étrangers (anglais)"),
        InfoLink(name: "Japan Dev", url: "https://japan-dev.com/", ja: "英語で働けるIT企業", en: "English-friendly tech companies", fr: "Entreprises tech anglophones"),
        InfoLink(name: "GaijinPot Jobs", url: "https://jobs.gaijinpot.com/", ja: "外国人向けの求人", en: "Jobs for foreigners in Japan", fr: "Offres pour étrangers au Japon"),
        InfoLink(name: "LAPRAS", url: "https://lapras.com/?lang=ja", ja: "エンジニア向けのスカウト型転職サービス", en: "Scouting platform for engineers", fr: "Recrutement par approche directe pour ingénieurs"),
        InfoLink(name: "Daijob", url: "https://www.daijob.com/", ja: "バイリンガル向けの求人", en: "Bilingual jobs", fr: "Postes bilingues"),
    ]
    static let resources = [
        InfoLink(name: "出入国在留管理庁", url: "https://www.moj.go.jp/isa/", ja: "就労ビザ・在留資格の変更", en: "Work visas and status changes", fr: "Visas de travail et changement de statut"),
        InfoLink(name: "厚生労働省 外国人雇用", url: "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyou/gaikokujin/index.html", ja: "外国人の雇用と労働のルール", en: "Rules on employing foreign workers", fr: "Règles d'emploi des étrangers"),
        InfoLink(name: "JETRO 高度外国人材", url: "https://www.jetro.go.jp/hrportal/", ja: "日本で働く外国人材の情報", en: "Information for international talent", fr: "Informations pour les talents étrangers"),
        InfoLink(name: "JLPT 日本語能力試験", url: "https://www.jlpt.jp/", ja: "試験日程と申し込み", en: "Test dates and registration", fr: "Dates et inscription"),
        InfoLink(name: "外国人雇用サービスセンター", url: "https://jsite.mhlw.go.jp/tokyo-foreigner/", ja: "留学生の就職を無料で支援", en: "Free job support for international students", fr: "Aide gratuite à l'emploi des étudiants étrangers"),
    ]
}

/// Onglet « 情報 » : 最新の見出し (5 par jour, 7 par page), nouvelles du site, liens utiles.
struct InfoView: View {
    let api: APIClient
    @State private var data: InfoPageData?
    @State private var failed = false
    @State private var page = 1
    @State private var source: String?
    @State private var opened: String?

    var body: some View {
        List {
            Section {
                if !(data?.sources.isEmpty ?? true) {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            chip(tr("すべて", "All", "Toutes"), selected: source == nil) { choose(nil) }
                            ForEach(data?.sources ?? []) { s in chip(s.name, selected: source == s.id) { choose(s.id) } }
                        }
                    }
                    .listRowInsets(EdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12))
                }
                if data == nil && !failed { HStack { Spacer(); ArcLoader(); Spacer() }.listRowSeparator(.hidden) }
                if failed { Text(tr("読み込めませんでした", "Could not load", "Chargement impossible")).foregroundStyle(.secondary) }
                ForEach(data?.items ?? []) { item in
                    if let link = item.link, let url = URL(string: link) {
                        Link(destination: url) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text("\(sourceName(item.source)) · \(item.date)").font(.caption.weight(.semibold)).foregroundStyle(Color.cwBordeaux)
                                Text(item.title.current).font(.subheadline.weight(.bold)).foregroundStyle(Color.cwBlue800)
                                Text(item.summary.current).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                if let data, data.pages > 1 {
                    HStack {
                        Button { go(page - 1) } label: { Image(systemName: "chevron.left") }.disabled(page <= 1)
                        Spacer()
                        Text("\(data.page) / \(data.pages)").font(.subheadline.monospacedDigit())
                        Spacer()
                        Button { go(page + 1) } label: { Image(systemName: "chevron.right") }.disabled(page >= data.pages)
                    }
                    .buttonStyle(.borderless)
                }
            } header: {
                Text(tr("最新の見出し", "Latest headlines", "Derniers titres"))
            }

            if let articles = data?.articles, !articles.isEmpty {
                Section(tr("Clean Work からのお知らせ", "News from Clean Work", "Nouvelles de Clean Work")) {
                    ForEach(articles) { a in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(a.title.current).font(.headline).foregroundStyle(Color.cwBlue800)
                            Text(a.summary.current).font(.subheadline)
                            if opened == a.id, let body = a.body {
                                Text(body).font(.callout).padding(.top, 4)
                            } else {
                                Button(tr("続きを読む", "Read more", "Lire la suite")) { opened = a.id }.font(.caption).buttonStyle(.borderless)
                            }
                        }
                    }
                }
            }

            linkSection(tr("パートナー", "Partners", "Partenaires"), InfoLink.partners)
            linkSection(tr("求人サイト", "Job sites", "Sites d'offres d'emploi"), InfoLink.jobSites)
            linkSection(tr("役立つ公式情報", "Useful official information", "Informations officielles utiles"), InfoLink.resources)
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .navigationTitle(tr("情報", "Info", "Infos"))
        .navigationBarTitleDisplayMode(.inline)
        .task(id: "\(page)-\(source ?? "")") { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do {
            data = try await api.info(page: page, source: source)
            failed = false
        } catch {
            failed = data == nil
        }
    }

    private func choose(_ id: String?) {
        source = id
        page = 1
    }

    private func go(_ n: Int) { page = n }

    private func sourceName(_ id: String?) -> String {
        data?.sources.first { $0.id == id }?.name ?? tr("ニュース", "News", "Actualité")
    }

    private func chip(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(.caption.weight(.semibold))
                .padding(.horizontal, 12).padding(.vertical, 5)
                .foregroundStyle(selected ? .white : Color.cwBlue800)
                .background(selected ? Color.cwBlue700 : .white, in: Capsule())
                .overlay(Capsule().stroke(selected ? Color.cwBlue700 : Color.cwBlue300))
        }
        .buttonStyle(.plain)
    }

    private func linkSection(_ title: String, _ links: [InfoLink]) -> some View {
        Section(title) {
            ForEach(links) { l in
                if let url = URL(string: l.url) {
                    Link(destination: url) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(l.name).font(.subheadline.weight(.bold)).foregroundStyle(Color.cwBlue700)
                            Text(l.text).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }
}
