import SwiftUI

/// Une source affichée sous un exercice (« 出典 »), comme sur le site.
struct KokoroSource: Identifiable {
    let name: String
    let url: String
    let ja: String, en: String, fr: String
    var id: String { url }
    var text: String { tr(ja, en, fr) }

    static let labeling = KokoroSource(name: "Lieberman et al., Psychological Science (2007)", url: "https://doi.org/10.1111/j.1467-9280.2007.01916.x",
        ja: "感情に名前をつけると、気持ちの反応がやわらぐ。", en: "Putting feelings into words dampens emotional reactions.", fr: "Mettre un mot sur une émotion en atténue la réaction.")
    static let breathing = KokoroSource(name: "こころの耳（厚生労働省）", url: "https://kokoro.mhlw.go.jp/fivemin/",
        ja: "ゆっくりした呼吸はリラクセーションの基本。", en: "Slow breathing is a basic relaxation method.", fr: "La respiration lente est une méthode de relaxation de base.")
    static let values = KokoroSource(name: "Creswell et al., Psychological Science (2005)", url: "https://doi.org/10.1111/j.1467-9280.2005.01624.x",
        ja: "大切な価値を思い出すと、ストレスへの反応が小さくなった。", en: "Recalling personal values lowered stress responses.", fr: "Se rappeler ses valeurs a réduit la réaction au stress.")
    static let excited = KokoroSource(name: "Brooks, J. Exp. Psychology: General (2014)", url: "https://doi.org/10.1037/a0035325",
        ja: "「落ち着こう」より「ワクワクしてる」と言う方が、人前での発表がうまくいった。", en: "Saying “I am excited” rather than “calm down” improved performance in public speaking.", fr: "Dire « je suis enthousiaste » plutôt que « calme-toi » a amélioré la prise de parole.")
    static let who = KokoroSource(name: "WHO — Doing What Matters in Times of Stress", url: "https://www.who.int/publications/i/item/9789240003927",
        ja: "大切なことに沿って行動し、自分にやさしくする。", en: "Act on your values and be kind to yourself.", fr: "Agir selon ses valeurs, être bienveillant envers soi.")
    static let twoWeeks = KokoroSource(name: "こころもメンテしよう（厚生労働省）", url: "https://www.mhlw.go.jp/kokoro/youth/",
        ja: "つらい気分が2週間以上続くときは、早めに相談を。", en: "If low mood lasts more than 2 weeks, talk to someone early.", fr: "Si le mal-être dure plus de 2 semaines, en parler tôt.")
    static let all = [labeling, breathing, values, excited, who, twoWeeks]
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

/// « 面接前の3分 » : respirer → relire ce qui compte → requalifier le trac.
struct RitualView: View {
    let values: [String]
    let company: String?
    var onEditValues: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var step = 0

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    HStack(spacing: 6) {
                        ForEach(0..<3) { i in
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
                        title(tr("あなたが大切にしていること", "What matters to you", "Ce qui compte pour vous"))
                        if values.isEmpty {
                            Button(tr("まだ書かれていません。書く", "Nothing written yet. Write them", "Rien d'écrit. Les écrire")) { dismiss(); onEditValues() }
                        } else {
                            ForEach(values, id: \.self) { Text($0).font(.title3.weight(.semibold)).foregroundStyle(Color.cwBlue800) }
                        }
                        Text(tr("ゆっくり読んで、どうしてそれが大切か思い出してください。", "Read slowly and recall why each one matters.", "Lisez lentement et rappelez-vous pourquoi chacune compte."))
                            .font(.footnote).foregroundStyle(Color.cwMuted).multilineTextAlignment(.center)
                        SourceLink(source: .values)
                        Button(tr("次へ", "Next", "Suivant")) { step = 2 }.buttonStyle(PrimaryButtonStyle())
                    case 2:
                        title(tr("ドキドキは、準備ができたしるし", "Nerves mean you are ready", "Le trac, signe que vous êtes prêt"))
                        Text(tr("「落ち着かなきゃ」ではなく、「ワクワクしてる」。", "Not “I must calm down” — “I am excited.”", "Pas « je dois me calmer », mais « je suis enthousiaste »."))
                            .font(.title3.bold()).foregroundStyle(Color.cwBlue800).multilineTextAlignment(.center)
                        Text(tr("声に出して一度だけ言ってみましょう。", "Say it out loud, once.", "Dites-le une fois à voix haute.")).font(.footnote).foregroundStyle(Color.cwMuted)
                        SourceLink(source: .excited)
                        Button(tr("終わる", "Finish", "Terminer")) { step = 3 }.buttonStyle(PrimaryButtonStyle())
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
            .navigationTitle(tr("面接前の3分", "3 minutes before the interview", "3 minutes avant l'entretien"))
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
    @State private var word = ""
    @State private var breathing = false
    @State private var ritual = false
    @State private var editingValues = false
    @State private var draftValues = ["", "", ""]
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
        .task { await model.load(); word = model.todayMood?.word ?? "" }
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
            RitualView(values: model.data?.values ?? [], company: model.nextInterview?.company) { startEditingValues() }
        }
        .sheet(isPresented: $editingValues) { valuesEditor }
        .confirmationDialog(tr("こころの記録（天気と大切なこと）をすべて消しますか？元に戻せません。", "Erase all your Mind records (weather and values)? This cannot be undone.", "Effacer tout votre journal (météo et valeurs) ? C'est définitif."),
                            isPresented: $confirmErase, titleVisibility: .visible) {
            Button(tr("すべて消す", "Erase all", "Tout effacer"), role: .destructive) { Task { await model.erase(); word = "" } }
        }
    }

    // MARK: colonne principale

    @ViewBuilder private func mainColumn(_ data: Kokoro) -> some View {
        today(data).card()
        support(data)
        ritualCard
    }

    private func today(_ data: Kokoro) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(tr("今日のこころの天気は？", "How's your inner weather today?", "Quelle météo intérieure aujourd'hui ?")).font(.headline).foregroundStyle(Color.cwBlue950)
            HStack(spacing: 10) {
                ForEach(MoodWeather.allCases) { w in
                    let selected = model.todayMood?.weather == w.rawValue
                    Button {
                        Task { await model.choose(selected ? nil : w.rawValue, word: word) }
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
            if let mood = model.todayMood {
                Text(tr("ひとことで言うと？", "In one word?", "En un mot ?")).font(.caption).foregroundStyle(Color.cwMuted)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(Self.words, id: \.ja) { w in
                            let text = tr(w.ja, w.en, w.fr)
                            let on = word == text
                            Button(text) {
                                word = on ? "" : text
                                Task { await model.choose(mood.weather, word: word) }
                            }
                            .font(.footnote)
                            .padding(.horizontal, 12).padding(.vertical, 5)
                            .foregroundStyle(on ? .white : Color.cwBlue800)
                            .background(on ? Color.cwBlue700 : .white, in: Capsule())
                            .overlay(Capsule().stroke(on ? Color.cwBlue700 : Color.cwBlue300))
                        }
                    }
                }
                HStack {
                    TextField(tr("自分の言葉で", "In your own words", "Avec vos mots"), text: $word)
                        .textFieldStyle(.roundedBorder)
                        .onSubmit { Task { await model.choose(mood.weather, word: word) } }
                    Button(tr("保存", "Save", "Enregistrer")) { Task { await model.choose(mood.weather, word: word) } }.buttonStyle(SecondaryButtonStyle())
                }
                SourceLink(source: .labeling)
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
                Text(tr("面接前の3分", "3 MINUTES BEFORE THE INTERVIEW", "3 MINUTES AVANT L'ENTRETIEN")).font(.caption.bold()).foregroundStyle(Color.cwBordeaux)
                Text(model.nextInterview.map { tr("\(Self.shortDate($0.date))、\($0.company)の面接の前に", "Before your interview at \($0.company), \(Self.shortDate($0.date))", "Avant votre entretien chez \($0.company), \(Self.shortDate($0.date))") }
                     ?? tr("呼吸・大切なこと・ひとこと", "Breathe, recall what matters, one sentence", "Respirer, se rappeler l'essentiel, une phrase"))
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
        VStack(alignment: .leading, spacing: 6) {
            sideTitle(tr("大切にしていること", "What matters to me", "Ce qui compte pour moi"))
            if data.values.isEmpty {
                Text(tr("面接の前に読み返す、自分のための3行。", "Three lines for yourself, to reread before interviews.", "Trois lignes pour vous, à relire avant les entretiens.")).font(.caption).foregroundStyle(Color.cwMuted)
            }
            ForEach(data.values, id: \.self) { Text("・\($0)").font(.subheadline.weight(.semibold)).foregroundStyle(Color.cwBlue800) }
            Button(data.values.isEmpty ? tr("書く", "Write", "Écrire") : tr("書きなおす", "Edit", "Modifier")) { startEditingValues() }
                .font(.subheadline).underline()
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

    private var valuesEditor: some View {
        NavigationStack {
            Form {
                Section {
                    ForEach(0..<3, id: \.self) { i in
                        TextField([tr("例：家族を安心させたい", "e.g. Reassure my family", "Ex. : rassurer ma famille"), tr("例：誠実でいること", "e.g. Stay honest", "Ex. : rester honnête"), ""][i], text: $draftValues[i])
                    }
                } footer: {
                    Text(tr("面接の前に読み返す、自分のための3行。", "Three lines for yourself, to reread before interviews.", "Trois lignes pour vous, à relire avant les entretiens."))
                }
            }
            .cleanList()
            .navigationTitle(tr("大切にしていること", "What matters to me", "Ce qui compte pour moi"))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(tr("やめる", "Cancel", "Annuler")) { editingValues = false } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(tr("保存", "Save", "Enregistrer")) { Task { await model.saveValues(draftValues); editingValues = false } }
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func startEditingValues() {
        draftValues = Array(((model.data?.values ?? []) + ["", "", ""]).prefix(3))
        editingValues = true
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

    /// Des mots pour nommer ce qu'on ressent (Lieberman 2007).
    static let words: [(ja: String, en: String, fr: String)] = [
        ("不安", "Anxious", "Inquiet"), ("疲れた", "Tired", "Fatigué"), ("焦り", "Rushed", "Pressé"), ("ほっとした", "Relieved", "Soulagé"), ("ワクワク", "Excited", "Enthousiaste"),
    ]
}
