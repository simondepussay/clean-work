import SwiftUI

/// Fiche officielle de l'entreprise (gBizINFO, 経済産業省) dans le formulaire d'une candidature :
/// on la retrouve par son nom, on la relie, puis on voit ses labels d'État et les chiffres du lieu de travail.
/// La section disparaît si le service n'est pas configuré ou ne répond pas.
struct CompanyFactsSection: View {
    let api: APIClient
    let company: String
    @Binding var corporateNumber: String?
    @Binding var location: String?
    @State private var matches: [CompanyMatch]?
    @State private var facts: CompanyFacts?
    @State private var busy = false
    @State private var unavailable = false

    var body: some View {
        if !(unavailable && corporateNumber == nil) {
            Section {
                if corporateNumber == nil { finder } else { card }
            } header: {
                Text(tr("企業データ", "Company data", "Données de l'entreprise"))
            } footer: {
                Text(tr("出典：gBizINFO（経済産業省）", "Source: gBizINFO (METI)", "Source : gBizINFO (ministère japonais de l'Économie)"))
            }
            .task(id: corporateNumber) { await loadFacts() }
        }
    }

    @ViewBuilder private var finder: some View {
        if let matches {
            if matches.isEmpty {
                Text(tr("見つかりませんでした。正式な社名で試してください", "Not found. Try the full legal name", "Introuvable. Essayez la raison sociale complète"))
                    .font(.callout).foregroundStyle(.secondary)
            } else {
                ForEach(matches) { m in
                    Button {
                        corporateNumber = m.corporateNumber
                        location = m.location
                        self.matches = nil
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Label(m.name, systemImage: "building.2").font(.subheadline.weight(.semibold)).foregroundStyle(Color.cwBlue800)
                            if let loc = m.location { Text(loc).font(.caption).foregroundStyle(.secondary) }
                        }
                    }
                }
            }
        } else {
            Button {
                Task { await search() }
            } label: {
                HStack {
                    Label(tr("公式データで企業を探す", "Find the official company data", "Trouver les données officielles"), systemImage: "magnifyingglass")
                    if busy { Spacer(); ArcLoader(size: 20) }
                }
            }
            .disabled(busy || company.trimmingCharacters(in: .whitespaces).count < 2)
        }
    }

    @ViewBuilder private var card: some View {
        if let facts {
            VStack(alignment: .leading, spacing: 4) {
                Label(facts.name, systemImage: "building.2").font(.headline).foregroundStyle(Color.cwBlue800)
                let meta = [facts.location,
                            facts.employees.map { tr("従業員 \($0)人", "\($0) employees", "\($0) salariés") },
                            facts.founded.map { tr("\($0)年創業", "founded \($0)", "fondée en \($0)") }].compactMap { $0 }
                if !meta.isEmpty { Text(meta.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary) }
            }
            let labels = facts.labels.filter { $0.meaning != nil }
            if labels.isEmpty {
                Text(tr("国の認定（くるみん・えるぼし等）はまだ登録されていません", "No government labels (Kurumin, Eruboshi…) on record", "Aucun label de l'État (くるみん, えるぼし…) enregistré"))
                    .font(.callout).foregroundStyle(.secondary)
            }
            ForEach(labels, id: \.title) { label in
                HStack(spacing: 10) {
                    Image(systemName: "checkmark.shield").foregroundStyle(Color.cwBordeaux)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(label.title).font(.subheadline.weight(.semibold)).foregroundStyle(Color.cwBordeaux)
                        if let meaning = label.meaning { Text(meaning).font(.caption).foregroundStyle(Color.cwBlue800) }
                    }
                }
                .listRowBackground(Color.cwBordeaux50)
            }
            if let w = facts.workplace {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 8)], spacing: 8) {
                    stat(w.overtimeHours, tr("月平均残業", "Overtime / month", "Heures sup. / mois")) { tr("\($0)時間", "\($0) h", "\($0) h") }
                    stat(w.averageYears, tr("平均勤続年数", "Average tenure", "Ancienneté moyenne")) { tr("\($0)年", "\($0) yrs", "\($0) ans") }
                    stat(w.averageAge, tr("平均年齢", "Average age", "Âge moyen")) { tr("\($0)歳", "\($0)", "\($0) ans") }
                    stat(w.femaleManagersPct, tr("女性管理職", "Women managers", "Femmes managers")) { "\($0)%" }
                    stat(w.paternityLeavePct, tr("男性の育休取得", "Paternity leave taken", "Congé paternité pris")) { "\($0)%" }
                }
                .padding(.vertical, 4)
            }
            if let url = URL(string: "https://info.gbiz.go.jp/hojin/ichiran?hojinBango=\(facts.corporateNumber)") {
                Link(tr("gBizINFOで詳しく見る", "More on gBizINFO", "Plus de détails sur gBizINFO"), destination: url)
            }
        } else if busy {
            ArcLoader(size: 24)
        } else {
            Text(tr("企業データを読み込めませんでした", "Could not load the company data", "Impossible de charger les données de l'entreprise"))
                .font(.callout).foregroundStyle(.secondary)
        }
        Button(tr("リンクを外す", "Unlink", "Retirer le lien"), role: .destructive) {
            corporateNumber = nil
            location = nil
            facts = nil
        }
    }

    @ViewBuilder private func stat(_ value: Double?, _ label: String, _ format: (String) -> String) -> some View {
        if let value {
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.caption2).foregroundStyle(Color.cwMuted)
                Text(format(value.formatted(.number.precision(.fractionLength(0...1))))).font(.headline).foregroundStyle(Color.cwBlue800)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(8)
            .background(Color.cwBlue50, in: RoundedRectangle(cornerRadius: 10))
        }
    }

    private func search() async {
        busy = true
        defer { busy = false }
        if let found = await api.searchCompanies(company) { matches = found } else { unavailable = true }
    }

    private func loadFacts() async {
        guard let number = corporateNumber else { facts = nil; return }
        busy = true
        defer { busy = false }
        facts = await api.companyFacts(number)
    }
}
