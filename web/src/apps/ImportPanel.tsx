import { useMemo, useState, type ChangeEvent } from "react";
import { createApplication, type Application } from "../api";
import { useAuth } from "../auth/auth";
import { CloseIcon } from "../icons";
import { useTr, type T3 } from "../i18n";
import { guessColumns, parseCsv, sameApplication, toApplications, type Target } from "./importCsv";
import { statusLabel } from "./statuses";

const TARGETS: { id: Target; label: T3 }[] = [
  { id: "company", label: { ja: "企業名", en: "Company", fr: "Entreprise" } },
  { id: "position", label: { ja: "職種", en: "Position", fr: "Poste" } },
  { id: "status", label: { ja: "状況", en: "Status", fr: "Statut" } },
  { id: "url", label: { ja: "URL", en: "URL", fr: "URL" } },
  { id: "deadline", label: { ja: "締切", en: "Deadline", fr: "Échéance" } },
  { id: "location", label: { ja: "勤務地", en: "Location", fr: "Lieu" } },
  { id: "notes", label: { ja: "メモ", en: "Notes", fr: "Notes" } },
  { id: "ignore", label: { ja: "使わない", en: "Skip", fr: "Ignorer" } },
];

/**
 * « インポート » : un export CSV de Notion, Huntr, Excel ou Google Sheets → 応募.
 * Le fichier est lu dans le navigateur ; on montre ce qui sera créé avant de le créer, et les doublons sont sautés.
 */
export function ImportPanel({ existing, onImported, onClose }: { existing: Application[]; onImported: (apps: Application[]) => void; onClose: () => void }) {
  const auth = useAuth();
  const tr = useTr();
  const [rows, setRows] = useState<string[][] | null>(null);
  const [columns, setColumns] = useState<Target[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number } | null>(null);
  const [fileError, setFileError] = useState(false);

  async function readFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(false);
    setProgress(null);
    // FileReader plutôt que file.text() : accepté par tous les navigateurs.
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    }).catch(() => "");
    const parsed = parseCsv(text);
    if (parsed.length < 2) { setFileError(true); setRows(null); return; }
    setRows(parsed);
    setColumns(guessColumns(parsed[0]));
  }

  const apps = useMemo(() => (rows ? toApplications(rows.slice(1), columns) : []), [rows, columns]);
  const fresh = apps.filter((a) => !existing.some((x) => sameApplication(x, a)));
  const skipped = apps.length - fresh.length;

  async function importAll() {
    const token = await auth.getToken();
    if (!token) return;
    const created: Application[] = [];
    let failed = 0;
    setProgress({ done: 0, total: fresh.length, failed: 0 });
    for (const app of fresh) {
      const r = await createApplication(token, app).catch(() => null);
      if (r?.ok) created.push(r.value);
      else failed++;
      setProgress({ done: created.length + failed, total: fresh.length, failed });
    }
    onImported(created);
  }

  const finished = progress && progress.done === progress.total;

  return (
    <section className="card import-panel" aria-label={tr({ ja: "インポート", en: "Import", fr: "Importer" })}>
      <button className="close-x" onClick={onClose} aria-label={tr({ ja: "閉じる", en: "Close", fr: "Fermer" })}><CloseIcon size={18} /></button>
      <h3>{tr({ ja: "ほかのツールから移す", en: "Bring your tracker over", fr: "Reprendre votre suivi existant" })}</h3>
      <p className="muted">{tr({
        ja: "Notion・Huntr・Excel・Googleスプレッドシートから書き出したCSVファイルを選んでください。内容を確認してから追加します。",
        en: "Choose a CSV file exported from Notion, Huntr, Excel or Google Sheets. You'll check it before anything is added.",
        fr: "Choisissez un fichier CSV exporté de Notion, Huntr, Excel ou Google Sheets. Vous vérifiez avant tout ajout.",
      })}</p>
      <input type="file" accept=".csv,text/csv,.tsv,text/tab-separated-values" onChange={readFile}
        aria-label={tr({ ja: "CSVファイル", en: "CSV file", fr: "Fichier CSV" })} />
      {fileError && <p role="alert" className="notice">{tr({ ja: "読み込める行がありませんでした。", en: "No rows could be read.", fr: "Aucune ligne lisible." })}</p>}

      {rows && !finished && (
        <>
          <div className="import-columns">
            {rows[0].map((h, i) => (
              <label key={i}>
                <span title={h}>{h || `#${i + 1}`}</span>
                <select value={columns[i]} aria-label={`${h} →`}
                  onChange={(e) => setColumns(columns.map((c, j) => (j === i ? (e.target.value as Target) : c === e.target.value && e.target.value !== "ignore" ? "ignore" : c)))}>
                  {TARGETS.map((t) => <option key={t.id} value={t.id}>{tr(t.label)}</option>)}
                </select>
              </label>
            ))}
          </div>
          {!columns.includes("company") ? (
            <p role="alert" className="notice">{tr({ ja: "「企業名」にする列を選んでください。", en: "Choose which column is the company.", fr: "Choisissez la colonne de l'entreprise." })}</p>
          ) : (
            <>
              <table className="import-preview">
                <thead><tr><th>{tr(TARGETS[0].label)}</th><th>{tr(TARGETS[1].label)}</th><th>{tr(TARGETS[2].label)}</th></tr></thead>
                <tbody>
                  {fresh.slice(0, 5).map((a, i) => <tr key={i}><td>{a.company}</td><td>{a.position ?? ""}</td><td>{statusLabel(a.status, tr.lang)}</td></tr>)}
                </tbody>
              </table>
              <p className="muted small">
                {tr({ ja: `${fresh.length}件を追加します`, en: `${fresh.length} to add`, fr: `${fresh.length} à ajouter` })}
                {fresh.length > 5 && tr({ ja: "（最初の5件を表示）", en: " (first 5 shown)", fr: " (5 premières affichées)" })}
                {skipped > 0 && tr({ ja: `・すでにある${skipped}件はスキップ`, en: ` · ${skipped} already in Clean Work, skipped`, fr: ` · ${skipped} déjà présente(s), ignorée(s)` })}
              </p>
              <button className="primary" disabled={fresh.length === 0 || !!progress} onClick={importAll}>
                {progress
                  ? tr({ ja: `追加中… ${progress.done}/${progress.total}`, en: `Adding… ${progress.done}/${progress.total}`, fr: `Ajout… ${progress.done}/${progress.total}` })
                  : tr({ ja: `${fresh.length}件を追加`, en: `Add ${fresh.length}`, fr: `Ajouter ${fresh.length}` })}
              </button>
            </>
          )}
        </>
      )}

      {finished && (
        <p role="status" className="import-done">
          {tr({ ja: `${progress.done - progress.failed}件を追加しました。`, en: `${progress.done - progress.failed} added.`, fr: `${progress.done - progress.failed} ajoutée(s).` })}
          {progress.failed > 0 && tr({ ja: ` ${progress.failed}件は追加できませんでした。`, en: ` ${progress.failed} could not be added.`, fr: ` ${progress.failed} n'ont pas pu être ajoutée(s).` })}
        </p>
      )}
    </section>
  );
}
