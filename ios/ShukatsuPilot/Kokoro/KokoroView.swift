import SwiftUI

/// Une source affichée sous un exercice (« 出典 »), comme sur le site.
struct KokoroSource: Identifiable {
    let name: String
    let url: String
    let ja: String, en: String, fr: String
    var id: String { url }
    var text: String { tr(ja, en, fr) }

    static let breathing = KokoroSource(name: "こころの耳（厚生労働省）", url: "https://kokoro.mhlw.go.jp/fivemin/",
        ja: "ゆっくりした呼吸はリラクセーションの基本。", en: "Slow breathing is a basic relaxation method.", fr: "La respiration lente est une méthode de relaxation de base.")
    static let journal = KokoroSource(name: "APA Monitor — Writing to heal (2002)", url: "https://www.apa.org/monitor/jun02/writing",
        ja: "気持ちを書き出すことで、心と体の調子がよくなるという研究。", en: "Research on how writing about feelings improves well-being.", fr: "Les recherches sur l'écriture de ses émotions et le bien-être.")
    static let excited = KokoroSource(name: "Brooks, J. Exp. Psychology: General (2014)", url: "https://doi.org/10.1037/a0035325",
        ja: "「落ち着こう」より「ワクワクしてる」と言う方が、人前での発表がうまくいった。", en: "Saying “I am excited” rather than “calm down” improved performance in public speaking.", fr: "Dire « je suis enthousiaste » plutôt que « calme-toi » a amélioré la prise de parole.")
    static let who = KokoroSource(name: "WHO — Doing What Matters in Times of Stress", url: "https://www.who.int/publications/i/item/9789240003927",
        ja: "大切なことに沿って行動し、自分にやさしくする。", en: "Act on your values and be kind to yourself.", fr: "Agir selon ses valeurs, être bienveillant envers soi.")
    static let twoWeeks = KokoroSource(name: "こころもメンテしよう（厚生労働省）", url: "https://www.mhlw.go.jp/kokoro/youth/",
        ja: "つらい気分が2週間以上続くときは、早めに相談を。", en: "If low mood lasts more than 2 weeks, talk to someone early.", fr: "Si le mal-être dure plus de 2 semaines, en parler tôt.")
    static let all = [breathing, journal, excited, who, twoWeeks]
}

private struct SourceLink: View {
    let source: KokoroSource
    var body: some View {
        if let url = URL(string: source.url) {
            Link(destination: url) {
                Text("\(tr("出典", "Source", "Source")) : \(source.name)").font(.caption2).foregroundStyle(Color.cwMuted).underline()
            }
        }
    }
}

/// Les trois météos du moral.
enum MoodWeather: String, CaseIterable, Identifiable {
    case sunny, cloudy, rainy
    var id: String { rawValue }
    var label: String {
        switch self { case .sunny: tr("晴れ", "Sunny", "Soleil"); case .cloudy: tr("くもり", "Cloudy", "Nuageux"); case .rainy: tr("雨", "Rainy", "Pluie") }
    }
    var symbol: String {
        switch self { case .sunny: "sun.max"; case .cloudy: "cloud"; case .rainy: "cloud.rain" }
    }
    var tint: Color { self == .sunny ? Color(red: 0.6, green: 0.42, blue: 0) : self == .rainy ? .white : .cwBlue800 }
    var fill: Color { self == .sunny ? Color(red: 1, green: 0.965, blue: 0.863) : self == .rainy ? .cwBlue700 : .cwBlue100 }
}

/// Respiration guidée : 4 s pour inspirer, 6 s pour expirer, pendant une minute.
struct BreathingView: View {
    var onDone: (() -> Void)?
    @State private var tick = 0
    @State private var expanded = false
    private let total = 60

    var body: some View {
        VStack(spacing: 14) {
            ZStack {
                Circle().stroke(Color.cwLine).frame(width: 190, height: 190)
                Circle().stroke(Color.cwLine).frame(width: 164, height: 164)
                Circle().fill(Color.cwBlue100).frame(width: 140, height: 140).scaleEffect(expanded ? 1 : 0.6)
            }
            .frame(height: 200)
            .accessibilityHidden(true)
            Text(tick >= total ? tr("おつかれさま", "Well done", "Bravo") : inhale ? tr("吸って", "Breathe in", "Inspirez") : tr("吐いて", "Breathe out", "Expirez"))
                .font(.title3.bold()).foregroundStyle(Color.cwBlue800)
            Text("\(max(0, total - tick)) s").font(.caption).foregroundStyle(Color.cwMuted)
        }
        .frame(maxWidth: .infinity)
        .task {
            while tick < total {
                let phase = tick % 10
                if phase == 0 { withAnimation(.easeInOut(duration: 4)) { expanded = true } }
                if phase == 4 { withAnimation(.easeInOut(duration: 6)) { expanded = false } }
                try? await Task.sleep(for: .seconds(1))
                if Task.isCancelled { return }
                tick += 1
            }
            onDone?()
        }
    }

    private var inhale: Bool { tick % 10 < 4 }
}

/// « ひと休みしましょう » : respirer une minute → requalifier le trac.
struct RitualView: View {
    let company: String?
    @Environment(\.dismiss) private var dismiss
    @State private var step = 0

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    HStack(spacing: 6) {
                        ForEach(0..<2) { i in
                            Capsule().fill(i == step ? Color.cwBordeaux : i < step ? Color.cwBlue300 : Color.cwLine).frame(width: 28, height: 4)
                        }
                    }
                    .accessibilityHidden(true)
                    switch step {
                    case 0:
                        title(tr("1分、呼吸をととのえる", "One minute to steady your breath", "Une minute pour respirer"))
                        BreathingView { step = 1 }
                        SourceLink(source: .breathing)
                        Button(tr("次へ", "Next", "Suivant")) { step = 1 }.buttonStyle(SecondaryButtonStyle())
                    case 1:
                        title(tr("ドキドキは、準備ができたしるし", "Nerves mean you are ready", "Le trac, signe que vous êtes prêt"))
                        Text(tr("「落ち着かなきゃ」ではなく、「ワクワクしてる」。", "Not “I must calm down” — “I am excited.”", "Pas « je dois me calmer », mais « je suis enthousiaste »."))
                            .font(.title3.bold()).foregroundStyle(Color.cwBlue800).multilineTextAlignment(.center)
                        Text(tr("声に出して一度だけ言ってみましょう。", "Say it out loud, once.", "Dites-le une fois à voix haute.")).font(.footnote).foregroundStyle(Color.cwMuted)
                        SourceLink(source: .excited)
                        Button(tr("終わる", "Finish", "Terminer")) { step = 2 }.buttonStyle(PrimaryButtonStyle())
                    default:
                        title(company.map { tr("\($0)、いってらっしゃい。", "Good luck at \($0).", "Bonne chance chez \($0).") } ?? tr("いってらっしゃい。", "Good luck.", "Bonne chance."))
                        Button(tr("閉じる", "Close", "Fermer")) { dismiss() }.buttonStyle(SecondaryButtonStyle())
                    }
                }
                .padding(24)
                .frame(maxWidth: 520)
                .frame(maxWidth: .infinity)
            }
            .background(Color.cwBlue50)
            .navigationTitle(KokoroView.pause)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(tr("閉じる", "Close", "Fermer")) { dismiss() } } }
        }
    }

    private func title(_ text: String) -> some View {
        Text(text).font(.title3.bold()).foregroundStyle(Color.cwBlue950).multilineTextAlignment(.center)
    }
}

/// Onglet « こころ » : la météo du moral, le soutien par paliers, le rituel d'avant-entretien et les aides.
struct KokoroView: View {
    @State var model: KokoroModel
    @Environment(\.horizontalSizeClass) private var sizeClass
    @State private var breathing = false
    @State private var ritual = false
    @State private var journalText = ""
    @State private var journalState: JournalState = .idle
    @State private var shownPages = 5
    @State private var openPages: Set<String> = []
    @State private var confirmErase = false

    var body: some View {
        ScrollView {
            if let data = model.data {
                if sizeClass == .regular {
                    HStack(alignment: .top, spacing: 20) {
                        VStack(spacing: 16) { mainColumn(data) }
                        VStack(alignment: .leading, spacing: 18) { sideColumn(data) }
                            .padding(16).frame(width: 320)
                            .background(Color.cwBlue50, in: RoundedRectangle(cornerRadius: 14))
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.cwLine))
                    }
                    .padding(20)
                } else {
                    VStack(spacing: 16) {
                        mainColumn(data)
                        VStack(alignment: .leading, spacing: 18) { sideColumn(data) }
                            .padding(16)
                            .background(Color.cwBlue50, in: RoundedRectangle(cornerRadius: 14))
                    }
                    .padding(14)
                }
            } else if model.failed {
                Text(tr("読み込めませんでした", "Could not load", "Chargement impossible")).foregroundStyle(.secondary).padding(.top, 40)
            } else {
                ArcLoader().padding(.top, 60)
            }
        }
        .background(.white)
        .task { await model.load(); journalText = model.journal.first { $0.date == model.today }?.text ?? "" }
        .refreshable { await model.load() }
        .sheet(isPresented: $breathing) {
            VStack(spacing: 12) {
                BreathingView()
                SourceLink(source: .breathing)
                Button(tr("閉じる", "Close", "Fermer")) { breathing = false }.buttonStyle(SecondaryButtonStyle())
            }
            .padding(24)
            .presentationDetents([.medium])
        }
        .sheet(isPresented: $ritual) {
            RitualView(company: model.nextInterview?.company)
        }
        .confirmationDialog(tr("こころの記録（天気と日記）をすべて消しますか？元に戻せません。", "Erase all your Mind records (weather and journal)? This cannot be undone.", "Tout effacer (météo et journal intime) ? C'est définitif."),
                            isPresented: $confirmErase, titleVisibility: .visible) {
            Button(tr("すべて消す", "Erase all", "Tout effacer"), role: .destructive) { Task { await model.erase(); journalText = "" } }
        }
    }

    // MARK: colonne principale

    @ViewBuilder private func mainColumn(_ data: Kokoro) -> some View {
        today(data).card()
        support(data)
        ritualCard
        cheerMenu(data)
        journalCard
    }

    static let pause = tr("ひと休みしましょう", "Take a break", "Faites une pause")

    enum JournalState { case idle, saving, saved, failed }

    /// 日記 : la page du jour (lignée), puis les pages précédentes, deux lignes chacune ; un tap déplie.
    private var journalCard: some View {
        let saved = model.journal.first { $0.date == model.today }?.text ?? ""
        let dirty = journalText.trimmingCharacters(in: .whitespacesAndNewlines) != saved
        let past = model.journal.filter { $0.date != model.today }
        return VStack(alignment: .leading, spacing: 10) {
            heading(tr("日記", "Journal", "Journal intime"))
            Text(tr("あなただけのページ。AIには送りません。", "Your own page. Never sent to the AI.", "Votre page à vous. Jamais envoyée à l'IA."))
                .font(.caption).foregroundStyle(Color.cwMuted)
            VStack(alignment: .leading, spacing: 4) {
                Text(Self.shortDate(model.today)).font(.caption2).foregroundStyle(Color.cwMuted)
                TextEditor(text: $journalText)
                    .frame(minHeight: 120)
                    .scrollContentBackground(.hidden)
                    .font(.body)
                    .overlay(alignment: .topLeading) {
                        if journalText.isEmpty {
                            Text(tr("今日あったこと、感じたこと…", "What happened today, how you felt…", "Ce qui s'est passé aujourd'hui, ce que vous avez ressenti…"))
                                .foregroundStyle(Color.cwMuted).padding(.top, 8).padding(.leading, 5).allowsHitTesting(false)
                        }
                    }
                    .onChange(of: journalText) { if journalState != .saving { journalState = .idle } }
            }
            .padding(12)
            .background(Color(red: 1, green: 0.992, blue: 0.97), in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.cwLine))
            HStack(spacing: 12) {
                Button(tr("保存", "Save", "Enregistrer")) {
                    journalState = .saving
                    Task { journalState = await model.saveJournal(journalText) ? .saved : .failed }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(!dirty || journalState == .saving)
                if journalState == .saved && !dirty { Text(tr("保存しました", "Saved", "Enregistré")).font(.caption).foregroundStyle(Color.cwMuted) }
                if journalState == .failed { Text(tr("保存できませんでした", "Could not save", "Enregistrement impossible")).font(.caption).foregroundStyle(Color.cwBordeaux) }
            }
            if !past.isEmpty {
                Divider().padding(.vertical, 4)
                ForEach(past.prefix(shownPages)) { page in
                    let open = openPages.contains(page.date)
                    Button {
                        if open { openPages.remove(page.date) } else { openPages.insert(page.date) }
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(Self.shortDate(page.date)).font(.caption.bold()).foregroundStyle(Color.cwBlue800)
                            Text(page.text).font(.subheadline).foregroundStyle(Color.cwBlue950)
                                .lineLimit(open ? nil : 2).multilineTextAlignment(.leading)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint(open ? tr("たたむ", "Collapse", "Replier") : tr("全文を見る", "Show all", "Tout afficher"))
                }
                if past.count > shownPages {
                    Button(tr("もっと見る", "Show more", "Voir plus")) { shownPages += 10 }.font(.subheadline).underline()
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }

    /// はげましの通知 : un petit bouton ; le menu propose le rythme (ou l'arrêt). Seulement dans l'app iPhone,
    /// là où les encouragements arrivent.
    private static let rhythms: [(id: String, ja: String, en: String, fr: String)] = [
        ("daily", "毎日", "Every day", "Chaque jour"),
        ("every2", "2日に1回", "Every 2 days", "Tous les 2 jours"),
        ("weekly", "週に1回", "Once a week", "Chaque semaine"),
        ("off", "オフ", "Off", "Désactivés"),
    ]

    private func cheerMenu(_ data: Kokoro) -> some View {
        let current = data.cheerFrequency ?? "daily"
        let label = Self.rhythms.first { $0.id == current }.map { tr($0.ja, $0.en, $0.fr) } ?? ""
        return HStack {
            Menu {
                Picker(tr("はげましの通知（朝8時）", "Encouragement (8 am)", "Encouragements (8 h)"), selection: Binding(
                    get: { current },
                    set: { f in Task { await model.setCheerFrequency(f) } }
                )) {
                    ForEach(Self.rhythms, id: \.id) { r in Text(tr(r.ja, r.en, r.fr)).tag(r.id) }
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: current == "off" ? "bell.slash" : "bell").font(.caption)
                    Text(current == "off" ? tr("はげましを受け取る", "Get encouragement", "Activer les encouragements") : tr("はげましの通知", "Encouragement", "Encouragements"))
                    if current != "off" { Text(label).fontWeight(.semibold) }
                }
                .font(.footnote)
                .foregroundStyle(current == "off" ? Color.cwMuted : Color.cwBlue800)
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(.white, in: Capsule())
                .overlay(Capsule().stroke(Color.cwLine))
            }
            .accessibilityLabel(tr("はげましの通知", "Encouragement", "Encouragements"))
            .accessibilityValue(label)
            Spacer(minLength: 0)
        }
        .padding(.top, -6)
    }

    private func today(_ data: Kokoro) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(tr("今日のこころの天気は？", "How's your inner weather today?", "Quelle météo intérieure aujourd'hui ?")).font(.headline).foregroundStyle(Color.cwBlue950)
            HStack(spacing: 10) {
                ForEach(MoodWeather.allCases) { w in
                    let selected = model.todayMood?.weather == w.rawValue
                    Button {
                        Task { await model.choose(selected ? nil : w.rawValue) }
                    } label: {
                        VStack(spacing: 6) {
                            Image(systemName: w.symbol).font(.title2)
                            Text(w.label).font(.subheadline.weight(.semibold))
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 14)
                        .foregroundStyle(selected ? w.tint : Color.cwBlue800)
                        .background(selected ? w.fill : .white, in: RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(selected ? w.fill : Color.cwBlue300))
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(selected ? .isSelected : [])
                }
            }
            monthStrip(data)
        }
    }

    /// Les 4 dernières semaines, 7 cases par ligne, aujourd'hui entouré.
    private func monthStrip(_ data: Kokoro) -> some View {
        let byDate = Dictionary(data.moods.map { ($0.date, $0) }, uniquingKeysWith: { a, _ in a })
        let days = (0..<28).map { offset in
            ISO8601DateFormatter.dayOnly.string(from: Calendar.current.date(byAdding: .day, value: offset - 27, to: .now) ?? .now)
        }
        return LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 4) {
            ForEach(days, id: \.self) { day in
                let weather = byDate[day].flatMap { MoodWeather(rawValue: $0.weather) }
                RoundedRectangle(cornerRadius: 6)
                    .fill(weather?.fill ?? Color.cwBlue50)
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(day == model.today ? Color.cwBordeaux : Color.cwLine, lineWidth: day == model.today ? 2 : 1))
                    .overlay { if let weather { Image(systemName: weather.symbol).font(.caption2).foregroundStyle(weather.tint) } }
                    .aspectRatio(1, contentMode: .fit)
            }
        }
        .frame(maxWidth: 320)
        .accessibilityLabel(tr("この4週間の天気", "The last 4 weeks", "Les 4 dernières semaines"))
    }

    /// Ce que dit l'app selon le palier (voir api/src/lib/kokoro.ts).
    @ViewBuilder private func support(_ data: Kokoro) -> some View {
        let level = data.support.level
        if level != "calm" {
            VStack(alignment: .leading, spacing: 10) {
                switch level {
                case "rain": heading(tr("雨の日もあります。", "Some days are rainy.", "Il y a des jours de pluie."))
                case "often":
                    heading(tr("就活のストレス、ひとりで抱えなくて大丈夫。", "You don't have to carry job-hunting stress alone.", "Vous n'avez pas à porter seul le stress du 就活."))
                    Text(tr("新卒応援ハローワークでは、就活の不安を臨床心理士に無料で相談できる地域があります。学校の学生相談室も頼れます。", "Many Hello Work offices for new graduates offer free sessions with a clinical psychologist. Your school's counseling office can help too.", "Beaucoup de Hello Work pour jeunes diplômés proposent un psychologue gratuit. Le service de conseil de l'école peut aussi aider."))
                default:
                    heading(tr("2週間近く、雨の日が続いています。", "It has been rainy for almost two weeks.", "Cela fait près de deux semaines de pluie."))
                    Text(tr("つらい気分が2週間以上続くときは、早めに誰かに相談することがすすめられています。下の窓口は無料です。", "When low mood lasts over two weeks, talking to someone early is recommended. The services below are free.", "Quand le mal-être dure plus de deux semaines, il est conseillé d'en parler tôt. Les services ci-dessous sont gratuits."))
                    SourceLink(source: .twoWeeks)
                }
                if let done = weekSummary(data.week) {
                    (Text(tr("今週やったこと：", "This week you did: ", "Cette semaine : ")) + Text(done).bold().foregroundColor(.cwBlue700))
                }
                if data.week.rejections > 0 {
                    Text(tr("お祈りメールが届いた週でした。結果は相性で、あなたの価値ではありません。", "A rejection arrived this week. It is about fit, not about your worth.", "Un refus est arrivé cette semaine. C'est une question d'affinité, pas de valeur."))
                        .foregroundStyle(Color.cwMuted)
                }
                Button(tr("1分の呼吸", "One-minute breathing", "Une minute de respiration")) { breathing = true }.buttonStyle(SecondaryButtonStyle())
            }
            .font(.subheadline)
            .frame(maxWidth: .infinity, alignment: .leading)
            .card()
            .overlay(alignment: .leading) {
                UnevenRoundedRectangle(topLeadingRadius: 14, bottomLeadingRadius: 14)
                    .fill(level == "long" ? Color.cwBordeaux : level == "often" ? Color.cwBlue700 : Color.cwBlue300).frame(width: 4)
            }
        }
    }

    private var ritualCard: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text(Self.pause).font(.caption.bold()).foregroundStyle(Color.cwBordeaux)
                Text(model.nextInterview.map { tr("\(Self.shortDate($0.date))、\($0.company)の面接の前に", "Before your interview at \($0.company), \(Self.shortDate($0.date))", "Avant votre entretien chez \($0.company), \(Self.shortDate($0.date))") }
                     ?? tr("1分呼吸して、ひとこと。", "One minute of breathing, then one sentence.", "Une minute pour respirer, puis une phrase."))
                    .font(.subheadline.weight(.semibold)).foregroundStyle(Color.cwBlue950)
            }
            Spacer(minLength: 0)
            Button(tr("はじめる", "Start", "Commencer")) { ritual = true }.buttonStyle(PrimaryButtonStyle())
        }
        .card()
        .overlay(alignment: .leading) {
            UnevenRoundedRectangle(topLeadingRadius: 14, bottomLeadingRadius: 14).fill(Color.cwBordeaux).frame(width: 4)
        }
    }

    // MARK: colonne des aides

    @ViewBuilder private func sideColumn(_ data: Kokoro) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sideTitle(tr("相談先", "Where to talk", "À qui parler"))
            helpline("まもろうよこころ", tr("電話・SNS（LINEなど）の相談窓口の一覧（厚生労働省）", "Phone and chat (LINE…) helplines, official list (Ministry of Health)", "Lignes d'écoute par téléphone et chat (LINE…), liste officielle"), "https://www.mhlw.go.jp/mamorouyokokoro/")
            helpline("こころの健康相談統一ダイヤル 0570-064-556", tr("お住まいの地域の公的な相談窓口につながります", "Connects you to the public counseling center in your area", "Vous met en relation avec le centre public de votre région"), "tel:0570064556")
            helpline(tr("新卒応援ハローワーク", "Hello Work for new graduates", "Hello Work jeunes diplômés") + (data.prefecture.map { "（\($0)）" } ?? ""),
                     tr("就活のストレスを臨床心理士に無料で相談できる地域があります", "In many areas, free sessions with a clinical psychologist about job-hunting stress", "Dans de nombreuses régions, un psychologue reçoit gratuitement pour le stress du 就活"),
                     "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000184061.html")
            if data.international || HelpLanguage.saved != .ja {
                helpline(tr("よりそいホットライン（外国語）", "Yorisoi Hotline (foreign languages)", "Yorisoi Hotline (langues étrangères)"), "0120-279-338 · English, 中文, 한국어, Tiếng Việt, नेपाली…", "https://www.since2011.net/yorisoi/")
                helpline("TELL Lifeline", tr("英語の電話・チャット相談 0800-300-8355", "Counseling in English, phone and chat · 0800-300-8355", "Écoute en anglais, téléphone et chat · 0800-300-8355"), "https://telljp.com/lifeline/")
            }
            Text(tr("学校の学生相談室も、就活の悩みを聞いてくれます。", "Your school's student counseling office also listens to job-hunting worries.", "Le service de conseil aux étudiants de votre école écoute aussi les soucis liés au 就活."))
                .font(.caption).foregroundStyle(Color.cwMuted)
        }
        VStack(alignment: .leading, spacing: 8) {
            sideTitle(tr("このページの根拠", "What this page is based on", "Sur quoi repose cette page"))
            ForEach(KokoroSource.all) { s in
                VStack(alignment: .leading, spacing: 2) {
                    if let url = URL(string: s.url) { Link(s.name, destination: url).font(.caption).underline() }
                    Text(s.text).font(.caption2).foregroundStyle(Color.cwMuted)
                }
            }
        }
        VStack(alignment: .leading, spacing: 6) {
            Divider()
            Text(tr("この記録はあなただけのものです。AIには送りません。", "These records are yours only. They are never sent to the AI.", "Ce journal n'appartient qu'à vous. Il n'est jamais envoyé à l'IA."))
                .font(.caption).foregroundStyle(Color.cwMuted)
            Button(tr("記録をすべて消す", "Erase all records", "Tout effacer")) { confirmErase = true }
                .font(.caption).foregroundStyle(Color.cwBordeaux)
        }
    }

    private func heading(_ text: String) -> some View { Text(text).font(.headline).foregroundStyle(Color.cwBlue950) }
    private func sideTitle(_ text: String) -> some View { Text(text).font(.subheadline.bold()).foregroundStyle(Color.cwBlue950) }

    private func helpline(_ name: String, _ text: String, _ link: String) -> some View {
        Link(destination: URL(string: link)!) {
            VStack(alignment: .leading, spacing: 2) {
                Text(name).font(.subheadline.bold()).foregroundStyle(Color.cwBlue700).multilineTextAlignment(.leading)
                Text(text).font(.caption).foregroundStyle(Color.cwMuted).multilineTextAlignment(.leading)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(10)
            .background(.white, in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.cwLine))
        }
    }

    private func weekSummary(_ w: Kokoro.Week) -> String? {
        let parts = [
            w.applications > 0 ? tr("応募 \(w.applications)件", "\(w.applications) application(s)", "\(w.applications) candidature(s)") : nil,
            w.drafts > 0 ? tr("ES \(w.drafts)本", "\(w.drafts) entry sheet(s)", "\(w.drafts) ES") : nil,
            w.interviews > 0 ? tr("面接練習 \(w.interviews)回", "\(w.interviews) practice interview(s)", "\(w.interviews) entretien(s) d'entraînement") : nil,
        ].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: tr("・", ", ", ", "))
    }

    /// « 11月3日(火) », « Tue, Nov 3 », « mar. 3 nov. ».
    static func shortDate(_ key: String) -> String {
        guard let date = ISO8601DateFormatter.dayOnly.date(from: key) else { return key }
        let f = DateFormatter()
        f.locale = Locale(identifier: tr("ja_JP", "en_US", "fr_FR"))
        f.setLocalizedDateFormatFromTemplate("MMMdEEE")
        return f.string(from: date)
    }
}
