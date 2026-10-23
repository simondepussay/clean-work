import { useTr } from "./i18n";

/**
 * Animation d'attente : un arc aux couleurs de Clean Work (du bleu vers le bordeaux) qui tourne,
 * comme une vague qui fait le tour. Annoncée aux lecteurs d'écran par « chargement ».
 */
export function Loader({ size = 40, inline = false }: { size?: number; inline?: boolean }) {
  const tr = useTr();
  return (
    <span className={inline ? "loader inline" : "loader"} role="status" aria-label={tr({ ja: "読み込み中", en: "Loading", fr: "Chargement" })}>
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
        <defs>
          <linearGradient id="loader-arc" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--blue-300)" />
            <stop offset=".55" stopColor="var(--blue-700)" />
            <stop offset="1" stopColor="var(--bordeaux)" />
          </linearGradient>
        </defs>
        <circle cx="24" cy="24" r="19" fill="none" stroke="var(--blue-100)" strokeWidth="5" />
        <circle className="loader-arc" cx="24" cy="24" r="19" fill="none" stroke="url(#loader-arc)" strokeWidth="5" strokeLinecap="round" />
      </svg>
    </span>
  );
}
