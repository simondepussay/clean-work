import { useEffect, useState } from "react";
import { updateApplication, type Application } from "../api";
import { useAuth } from "../auth/auth";
import { LinkIcon } from "../icons";
import { useTr, type T3 } from "../i18n";

/** Contenu de web/public/naitei-guide.json (lu aussi par l'app iOS). */
export type OfferGuide = {
  updated: string;
  intro: T3;
  disclaimer: T3;
  steps: { id: string; title: T3; when: T3; detail: T3; items?: T3[]; links?: { label: T3; url: string }[] }[];
  notes: { title: T3; detail: T3 }[];
};

let cached: Promise<OfferGuide | null> | null = null;
/** Pour les tests : oublier le guide déjà chargé. */
export function resetOfferGuideCache() { cached = null; }

/**
 * 内定後の手続き : le parcours entre l'offre et le premier jour, surtout le changement de statut de
 * résidence (留学 → 技術・人文知識・国際業務). Le contenu est un fichier relu à la main, sans IA : ce sont
 * des règles officielles, et chaque étape renvoie à la page de l'immigration. Les étapes cochées sont
 * gardées dans la candidature.
 */
export function OfferGuidePanel({ application, onChange }: { application: Application; onChange: (app: Application) => void }) {
  const auth = useAuth();
  const tr = useTr();
  const [guide, setGuide] = useState<OfferGuide | null | undefined>(undefined);
  const [done, setDone] = useState<string[]>(application.offerChecklist ?? []);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    cached ??= fetch("/naitei-guide.json").then((r) => (r.ok ? (r.json() as Promise<OfferGuide>) : null)).catch(() => null);
    cached.then(setGuide);
  }, []);

  async function toggle(id: string) {
    const before = done;
    const next = done.includes(id) ? done.filter((x) => x !== id) : [...done, id];
    setDone(next);
    setFailed(false);
    try {
      const token = await auth.getToken();
      const r = token ? await updateApplication(token, application.id, { offerChecklist: next }) : null;
      if (!r?.ok) throw new Error("non enregistré");
      onChange(r.value);
    } catch {
      // La case revient à son état : ce qui est affiché est ce qui est enregistré.
      setDone(before);
      setFailed(true);
    }
  }

  if (guide === undefined) return null;
  if (guide === null) return <p role="alert" className="notice">{tr({ ja: "読み込めませんでした", en: "Could not load", fr: "Chargement impossible" })}</p>;

  const count = guide.steps.filter((s) => done.includes(s.id)).length;
  return (
    <section className="offer-guide" aria-label={tr({ ja: "内定後の手続き", en: "After the offer", fr: "Après l'offre" })}>
      <p>{tr(guide.intro)}</p>
      <p className="muted" role="status">{tr({ ja: `${guide.steps.length}つのうち ${count}つ完了`, en: `${count} of ${guide.steps.length} done`, fr: `${count} sur ${guide.steps.length} faites` })}</p>
      {failed && <p role="alert" className="notice">{tr({ ja: "保存できませんでした", en: "Could not save", fr: "Enregistrement impossible" })}</p>}
      <ol>
        {guide.steps.map((s) => (
          <li key={s.id} className={done.includes(s.id) ? "done" : undefined}>
            <label className="offer-step">
              <input type="checkbox" checked={done.includes(s.id)} onChange={() => toggle(s.id)} />
              <strong>{tr(s.title)}</strong>
              <span className="tag">{tr(s.when)}</span>
            </label>
            <p>{tr(s.detail)}</p>
            {s.items && <ul>{s.items.map((i) => <li key={i.ja}>{tr(i)}</li>)}</ul>}
            {s.links?.map((l) => (
              <a key={l.url + l.label.ja} href={l.url} target="_blank" rel="noreferrer"><LinkIcon size={13} /> {tr(l.label)}</a>
            ))}
          </li>
        ))}
      </ol>
      {guide.notes.map((n) => (
        <details key={n.title.ja}>
          <summary>{tr(n.title)}</summary>
          <p>{tr(n.detail)}</p>
        </details>
      ))}
      <p className="muted offer-disclaimer">{tr(guide.disclaimer)} <span>({guide.updated})</span></p>
    </section>
  );
}
