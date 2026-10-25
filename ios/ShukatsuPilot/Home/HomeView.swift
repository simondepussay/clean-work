import SwiftUI

/// Accueil (comme sur le site) : d'abord le calendrier — entretiens et étapes des candidatures,
/// événements, objectifs et notes —, puis le détail du jour choisi et les objectifs.
/// Appui long sur une date : note rapide.
struct HomeView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.horizontalSizeClass) private var sizeClass
    var onPractice: (InterviewTarget) -> Void = { _ in }
    @State private var home: HomeModel?

    var body: some View {
        Group {
            if let home {
                HomeContent(home: home, wide: sizeClass == .regular, onPractice: onPractice)
            } else {
                ArcLoader().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .task {
            if home == nil, let api = model.apiClient { home = HomeModel(api: api) }
            await home?.load()
            await model.refreshMe()
        }
        .toolbar(.hidden, for: .navigationBar)
    }
}

private struct HomeContent: View {
    @Environment(AppModel.self) private var model
    let home: HomeModel
    let wide: Bool
    let onPractice: (InterviewTarget) -> Void
    @State private var kind = "event"
    @State private var title = ""
    @State private var time = Calendar.current.date(bySettingHour: 10, minute: 0, second: 0, of: .now) ?? .now
    @State private var noteDay: String?
    @State private var noteText = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                calendar.card()
                // iPad : le détail du jour et les objectifs côte à côte.
                if wide {
                    HStack(alignment: .top, spacing: 16) {
                        dayDetail.card().frame(maxWidth: .infinity)
                        goals.card().frame(maxWidth: 340)
                    }
                } else {
                    dayDetail.card()
                    goals.card()
                }
            }
            .padding(16)
        }
        .refreshable { await home.load() }
        .alert(tr("メモ", "Note", "Note"), isPresented: Binding(get: { noteDay != nil }, set: { if !$0 { noteDay = nil } })) {
            TextField(tr("メモ", "Note", "Note"), text: $noteText)
            Button(tr("追加", "Add", "Ajouter")) {
                let text = noteText
                Task { await home.add(kind: "note", title: text, time: nil) }
            }
            Button(tr("キャンセル", "Cancel", "Annuler"), role: .cancel) {}
        } message: {
            Text(noteDay.map(longDate) ?? "")
        }
    }

    // MARK: En-tête

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("CLEAN WORK").font(.caption.weight(.bold)).kerning(1.5).foregroundStyle(Color.cwBordeaux)
            Text(greeting).font(.title2.bold()).foregroundStyle(Color.cwBlue800)
            if let next = home.nextInterview {
                highlight(tr("次の面接", "Next interview", "Prochain entretien"), "\(longDate(next.date))\(next.time.map { " \($0)" } ?? "")  \(next.title)",
                          bordeaux: true, weather: home.nextInterviewWeather)
            }
            if let goal = home.goals.first {
                highlight(tr("目標", "Goal", "Objectif"), "⚑ \(goal.title)  " + tr("（\(longDate(goal.date))まで）", "(by \(longDate(goal.date)))", "(avant le \(longDate(goal.date)))"), bordeaux: false)
            }
            if !home.loaded { ArcLoader(size: 28) }
        }
    }

    private var greeting: String {
        let name = model.displayName
        return tr("\(name.map { "\($0)さん、" } ?? "")おかえりなさい", "Welcome back\(name.map { ", \($0)" } ?? "")", "Bon retour\(name.map { ", \($0)" } ?? "")")
    }

    private func highlight(_ label: String, _ text: String, bordeaux: Bool, weather: DayWeather? = nil) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption2).foregroundStyle(Color.cwMuted)
            Text(text).font(.subheadline.weight(.semibold)).foregroundStyle(bordeaux ? Color.cwBordeaux : Color.cwBlue700)
            if let weather { WeatherBadge(weather: weather).padding(.top, 4) }
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(bordeaux ? Color.cwBordeaux50 : Color.cwBlue100, in: RoundedRectangle(cornerRadius: 12))
    }

    // MARK: Calendrier

    private var calendar: some View {
        VStack(spacing: 10) {
            HStack {
                Image(systemName: "calendar").foregroundStyle(Color.cwBlue700)
                Text(monthTitle).font(.title3.bold()).foregroundStyle(Color.cwBlue800)
                Spacer()
                Button { home.shift(-1) } label: { Image(systemName: "chevron.left") }
                    .accessibilityLabel(tr("前の月", "Previous month", "Mois précédent"))
                Button(tr("今日", "Today", "Aujourd'hui")) { home.goToday() }.buttonStyle(SecondaryButtonStyle())
                Button { home.shift(1) } label: { Image(systemName: "chevron.right") }
                    .accessibilityLabel(tr("次の月", "Next month", "Mois suivant"))
            }
            .buttonStyle(.borderless)
            let weekdays = [tr("日", "Sun", "dim."), tr("月", "Mon", "lun."), tr("火", "Tue", "mar."), tr("水", "Wed", "mer."),
                            tr("木", "Thu", "jeu."), tr("金", "Fri", "ven."), tr("土", "Sat", "sam.")]
            Grid(horizontalSpacing: 0, verticalSpacing: 0) {
                GridRow {
                    ForEach(Array(weekdays.enumerated()), id: \.offset) { i, w in
                        Text(w).font(.caption.weight(.bold))
                            .foregroundStyle(i == 0 ? Color.cwBordeaux : i == 6 ? Color.cwBlue500 : Color.cwBlue800)
                            .frame(maxWidth: .infinity).padding(.vertical, 5).background(Color.cwBlue50)
                    }
                }
                ForEach(Agenda.weeks(year: home.month.year ?? 2026, month: home.month.month ?? 1), id: \.self) { week in
                    GridRow { ForEach(week, id: \.self) { day in cell(day) } }
                }
            }
            .overlay(RoundedRectangle(cornerRadius: 4).stroke(Color.cwLine))
            legend
        }
    }

    private func cell(_ day: Date) -> some View {
        let key = Agenda.key(day)
        let items = home.items(on: key)
        let inMonth = Calendar.current.component(.month, from: day) == home.month.month
        let weekday = Calendar.current.component(.weekday, from: day)
        let isToday = key == home.today
        let holiday = home.holidays[key]
        return Button {
            home.selected = key
        } label: {
            VStack(spacing: 3) {
                Text("\(Calendar.current.component(.day, from: day))")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(isToday ? .white : (weekday == 1 || holiday != nil) ? Color.cwBordeaux : weekday == 7 ? Color.cwBlue500 : Color.cwBlue950)
                    .frame(width: 26, height: 26)
                    .background(isToday ? Color.cwBlue700 : .clear, in: Circle())
                // Jour férié : son nom sous le numéro (iPad), en bordeaux comme le dimanche.
                if wide, let holiday {
                    Text(holiday).font(.system(size: 9)).foregroundStyle(Color.cwBordeaux.opacity(0.85)).lineLimit(1)
                }
                if wide {
                    VStack(spacing: 2) {
                        ForEach(items.prefix(3)) { chip($0) }
                        if items.count > 3 { Text("+\(items.count - 3)").font(.caption2).foregroundStyle(Color.cwMuted) }
                    }
                } else {
                    HStack(spacing: 2) { ForEach(items.prefix(4)) { dot($0.kind) } }.frame(height: 8)
                }
                Spacer(minLength: 0)
            }
            .padding(.top, 4)
            .frame(maxWidth: .infinity, minHeight: wide ? 96 : 52)
            .background(inMonth ? Color.white : Color.cwBlue50.opacity(0.5))
            .opacity(inMonth ? 1 : 0.55)
            .overlay(Rectangle().stroke(key == home.selected ? Color.cwBordeaux : Color.cwLine, lineWidth: key == home.selected ? 2 : 0.5))
        }
        .buttonStyle(.plain)
        .simultaneousGesture(LongPressGesture().onEnded { _ in
            home.selected = key
            noteText = ""
            noteDay = key
        })
        .accessibilityLabel("\(longDate(key))\(holiday.map { " · \($0)" } ?? "")\(items.isEmpty ? "" : " · \(items.count)")")
    }

    private func chip(_ item: AgendaItem) -> some View {
        Text((item.time.map { "\($0) " } ?? "") + item.title)
            .font(.system(size: 10, weight: .semibold)).lineLimit(1)
            .padding(.horizontal, 4).padding(.vertical, 1)
            .frame(maxWidth: .infinity, alignment: .leading)
            .foregroundStyle(item.kind == .interview ? .white : item.kind == .goal ? Color.cwBordeaux : Color.cwBlue800)
            .background(chipColor(item.kind), in: RoundedRectangle(cornerRadius: 4))
            .opacity(item.done ? 0.5 : 1)
            .padding(.horizontal, 3)
    }

    private func chipColor(_ kind: AgendaItem.Kind) -> Color {
        switch kind {
        case .interview: .cwBordeaux
        case .step: .cwBlue100
        case .event: .cwBlue50
        case .goal: .cwBordeaux50
        case .note: Color(red: 0.984, green: 0.957, blue: 0.875)
        }
    }

    private func dot(_ kind: AgendaItem.Kind) -> some View {
        Circle().fill(dotColor(kind)).frame(width: 6, height: 6)
    }

    private func dotColor(_ kind: AgendaItem.Kind) -> Color {
        switch kind {
        case .interview: .cwBordeaux
        case .step: .cwBlue700
        case .event: .cwBlue300
        case .goal: .cwBordeaux.opacity(0.5)
        case .note: Color(red: 0.91, green: 0.78, blue: 0.45)
        }
    }

    private var legend: some View {
        let kinds: [AgendaItem.Kind] = [.interview, .step, .event, .goal, .note]
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(kinds, id: \.self) { k in
                    HStack(spacing: 4) {
                        dot(k)
                        Text(AgendaItem(id: "", date: "", time: nil, kind: k, title: "", detail: nil, done: false).kindName)
                            .font(.caption2).foregroundStyle(Color.cwMuted)
                    }
                }
            }
        }
    }

    // MARK: Jour choisi

    private var dayDetail: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(longDate(home.selected)).font(.headline).foregroundStyle(Color.cwBlue800)
                if home.selected == home.today { Text(tr("今日", "today", "aujourd'hui")).font(.caption.weight(.semibold)).foregroundStyle(Color.cwBordeaux) }
                if let holiday = home.holidays[home.selected] {
                    Text(tr("祝日", "Public holiday", "Jour férié") + " · " + holiday)
                        .font(.caption.weight(.semibold)).foregroundStyle(Color.cwBordeaux)
                        .padding(.horizontal, 8).padding(.vertical, 2)
                        .background(Color.cwBordeaux50, in: Capsule())
                }
            }
            let items = home.items(on: home.selected)
            if home.loaded && items.isEmpty {
                Text(tr("予定はありません", "Nothing planned", "Rien de prévu")).font(.subheadline).foregroundStyle(.secondary)
            }
            ForEach(items) { item in row(item) }
            Divider()
            Picker(tr("種類", "Type", "Type"), selection: $kind) {
                Text(tr("予定", "Event", "Événement")).tag("event")
                Text(tr("目標", "Goal", "Objectif")).tag("goal")
                Text(tr("メモ", "Note", "Note")).tag("note")
            }
            .pickerStyle(.segmented)
            TextField(kind == "event" ? tr("予定（説明会、OB訪問など）", "Event (info session, alumni visit…)", "Événement (présentation, rencontre…)")
                      : kind == "goal" ? tr("目標（ES 3本提出など）", "Goal (submit 3 ES…)", "Objectif (envoyer 3 ES…)") : tr("メモ", "Note", "Note"),
                      text: $title)
                .textFieldStyle(.roundedBorder)
            HStack {
                if kind == "event" { DatePicker(tr("時刻", "Time", "Heure"), selection: $time, displayedComponents: .hourAndMinute) }
                Spacer()
                Button {
                    let t = DateFormatter.hourMinute.string(from: time)
                    Task { if await home.add(kind: kind, title: title, time: t) { title = "" } }
                } label: { Label(tr("追加", "Add", "Ajouter"), systemImage: "plus") }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            if let message = home.message { Text(message).font(.caption).foregroundStyle(.red) }
        }
    }

    private func row(_ item: AgendaItem) -> some View {
        HStack(spacing: 10) {
            dot(item.kind)
            VStack(alignment: .leading, spacing: 1) {
                Text((item.time.map { "\($0) " } ?? "") + item.title + (item.detail.map { " · \($0)" } ?? ""))
                    .font(.subheadline.weight(.semibold)).strikethrough(item.done)
                Text(item.kindName).font(.caption2).foregroundStyle(Color.cwMuted)
            }
            Spacer()
            if item.kind == .interview, !item.done, let app = item.applicationId, let step = item.stepId {
                Button { onPractice(InterviewTarget(applicationId: app, stepId: step)) } label: {
                    Label(tr("練習する", "Practise", "S'entraîner"), systemImage: "mic").font(.caption)
                }
                .buttonStyle(SecondaryButtonStyle())
            }
            if let plan = item.plan {
                Button { Task { await home.toggle(plan) } } label: { Image(systemName: plan.done ? "checkmark.circle.fill" : "checkmark.circle") }
                    .accessibilityLabel(tr("完了", "Done", "Fait"))
                Button(role: .destructive) { Task { await home.delete(plan) } } label: { Image(systemName: "trash") }
                    .accessibilityLabel(tr("削除", "Delete", "Supprimer"))
            }
        }
        .buttonStyle(.borderless)
        .padding(10)
        .background(item.kind == .interview ? Color.cwBordeaux50 : Color.cwBlue50, in: RoundedRectangle(cornerRadius: 10))
    }

    // MARK: Objectifs

    private var goals: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(tr("目標", "Goals", "Objectifs"), systemImage: "flag").font(.headline).foregroundStyle(Color.cwBlue800)
            if home.goals.isEmpty {
                Text(tr("日付を選んで、目標を追加しましょう", "Pick a date to add a goal", "Choisissez une date pour ajouter un objectif"))
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            ForEach(home.goals) { goal in
                HStack {
                    Button { Task { await home.toggle(goal) } } label: { Image(systemName: "checkmark.circle") }
                        .buttonStyle(.borderless)
                        .accessibilityLabel(tr("完了", "Done", "Fait") + ": " + goal.title)
                    VStack(alignment: .leading) {
                        Text(goal.title).font(.subheadline.weight(.semibold))
                        Text(tr("\(longDate(goal.date))まで", "by \(longDate(goal.date))", "avant le \(longDate(goal.date))")).font(.caption2).foregroundStyle(Color.cwMuted)
                    }
                }
                .padding(10).frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.cwBlue50, in: RoundedRectangle(cornerRadius: 10))
            }
        }
    }

    // MARK: Dates

    private var monthTitle: String {
        guard let date = Calendar.current.date(from: home.month) else { return "" }
        let f = DateFormatter()
        f.locale = Locale(identifier: tr("ja_JP", "en_US", "fr_FR"))
        f.setLocalizedDateFormatFromTemplate("yMMMM")
        // « octobre 2026 » → « Octobre 2026 » (en français, le mois n'a pas de majuscule).
        let text = f.string(from: date)
        return text.prefix(1).uppercased() + text.dropFirst()
    }

    private func longDate(_ key: String) -> String {
        guard let date = ISO8601DateFormatter.dayOnly.date(from: key) else { return key }
        let f = DateFormatter()
        f.locale = Locale(identifier: tr("ja_JP", "en_US", "fr_FR"))
        f.setLocalizedDateFormatFromTemplate("MMMdEEE")
        return f.string(from: date)
    }
}

extension DateFormatter {
    /// « 13:00 » pour l'heure d'un événement.
    static let hourMinute: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "HH:mm"
        return f
    }()
}
