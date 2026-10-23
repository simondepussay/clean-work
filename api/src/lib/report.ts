/**
 * Rapport de la semaine (envoyé chaque lundi, voir .github/workflows/weekly-report.yml) :
 * ce que l'IA a coûté chaque jour des 7 derniers jours, le total du mois et le budget restant.
 * Les autres services (site, API, base de données, surveillance) restent dans leurs offres
 * gratuites ou presque : leur coût réel se lit dans le portail Azure.
 */
import { containers } from "./models";
import type { DocStore } from "./store";
import { GLOBAL, LIMITS } from "./usage";

type MonthDoc = Record<string, number | string> & { id: string; userId: string };

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function weeklyReport(store: DocStore, now = new Date()) {
  const days = Array.from({ length: 7 }, (_, i) => iso(new Date(now.getTime() - (7 - i) * 86400_000)));
  const months = [...new Set([...days.map((d) => d.slice(0, 7)), iso(now).slice(0, 7)])];
  const docs = new Map<string, MonthDoc>();
  for (const m of months) {
    const doc = await store.get<MonthDoc>(containers.usage, GLOBAL, m);
    if (doc) docs.set(m, doc);
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  const daily = days.map((day) => ({ day, costJpy: round(Number(docs.get(day.slice(0, 7))?.[`cost_${day}`] ?? 0)) }));
  const month = iso(now).slice(0, 7);
  const monthCostJpy = round(Number(docs.get(month)?.costJpy ?? 0));
  return {
    month,
    daily,
    weekCostJpy: round(daily.reduce((sum, d) => sum + d.costJpy, 0)),
    monthCostJpy,
    budgetJpy: LIMITS.monthlyBudgetJpy,
    budgetLeftJpy: round(Math.max(0, LIMITS.monthlyBudgetJpy - monthCostJpy)),
  };
}
