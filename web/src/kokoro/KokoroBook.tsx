import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { JournalEntry } from "../api";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "../icons";
import { formatDay, type Tr } from "../i18n";

/** Durée d'une page qui tourne (identique à l'animation CSS « .leaf »). */
const TURN_MS = 650;

const wide = () => window.matchMedia?.("(min-width: 760px)").matches ?? true;
const calm = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * 日記を読む : le journal comme un livre. Deux pages côte à côte sur grand écran, une sur téléphone ;
 * on tourne les pages (flèches, clavier ←/→, glisser du doigt), de la plus ancienne à la plus récente.
 * Le livre s'ouvre sur les dernières pages.
 *
 * Une page qui tourne est une feuille à deux faces (recto : la page quittée, verso : la suivante)
 * qui pivote autour de la reliure ; dessous, les pages d'après sont déjà en place.
 */
export function JournalBook({ entries, tr, onClose }: { entries: JournalEntry[]; tr: Tr; onClose: () => void }) {
  const pages = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const last = pages.length - 1;
  const [two, setTwo] = useState(wide);
  const step = two ? 2 : 1;
  // Index de la première page visible ; sur deux pages, les doubles pages commencent aux index pairs.
  const [at, setAt] = useState(() => (wide() ? last - (last % 2) : last));
  const [turn, setTurn] = useState<null | "next" | "prev">(null);
  const close = useRef<HTMLButtonElement>(null);
  const touch = useRef<number | null>(null);

  const canNext = at + step <= last;
  const canPrev = at > 0;

  function go(dir: "next" | "prev") {
    if (turn || (dir === "next" ? !canNext : !canPrev)) return;
    const target = dir === "next" ? at + step : Math.max(0, at - step);
    if (calm()) return setAt(target);
    setTurn(dir);
    setTimeout(() => { setAt(target); setTurn(null); }, TURN_MS);
  }

  useEffect(() => {
    close.current?.focus();
    const media = window.matchMedia?.("(min-width: 760px)");
    const onMedia = () => {
      setTwo(media!.matches);
      setAt((a) => (media!.matches ? a - (a % 2) : a));
    };
    media?.addEventListener?.("change", onMedia);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { media?.removeEventListener?.("change", onMedia); document.body.style.overflow = prevOverflow; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go("next");
      if (e.key === "ArrowLeft") go("prev");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const page = (i: number) => {
    const e = pages[i];
    if (!e) return <div className="book-sheet empty" aria-hidden="true" />;
    return (
      <article className="book-sheet" aria-label={formatDay(e.date, tr.lang)}>
        <p className="book-date">{formatDay(e.date, tr.lang)}</p>
        <p className="book-text">{e.text}</p>
        <span className="book-folio" aria-hidden="true">{i + 1}</span>
      </article>
    );
  };

  const shown = two ? [at, at + 1].filter((i) => i <= last) : [at];
  const position = `${shown.map((i) => i + 1).join("–")} / ${pages.length}`;

  return createPortal(
    <div className="book-overlay" role="dialog" aria-modal="true" aria-label={tr({ ja: "日記を読む", en: "Read the journal", fr: "Feuilleter le journal" })}>
      <button ref={close} className="calm-close" onClick={onClose} aria-label={tr({ ja: "閉じる", en: "Close", fr: "Fermer" })}><CloseIcon /></button>
      <div className={`book${two ? "" : " single"}`}
        onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touch.current === null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          touch.current = null;
          if (Math.abs(dx) > 40) go(dx < 0 ? "next" : "prev");
        }}>
        {two ? (
          <>
            <div className="book-page left">{page(turn === "prev" ? at - 2 : at)}</div>
            <div className="book-page right">{page(turn === "next" ? at + 3 : at + 1)}</div>
            {turn === "next" && <div className="leaf next" aria-hidden="true"><div className="face">{page(at + 1)}</div><div className="face back">{page(at + 2)}</div></div>}
            {turn === "prev" && <div className="leaf prev" aria-hidden="true"><div className="face">{page(at)}</div><div className="face back">{page(at - 1)}</div></div>}
          </>
        ) : (
          <>
            <div className="book-page">{page(turn === "next" ? at + 1 : at)}</div>
            {turn === "next" && <div className="leaf next" aria-hidden="true"><div className="face">{page(at)}</div><div className="face back"><div className="book-sheet empty" /></div></div>}
            {turn === "prev" && <div className="leaf prev-single" aria-hidden="true"><div className="face">{page(at - 1)}</div><div className="face back"><div className="book-sheet empty" /></div></div>}
          </>
        )}
      </div>
      <div className="book-nav">
        <button className="icon-button" onClick={() => go("prev")} disabled={!canPrev} aria-label={tr({ ja: "前のページ", en: "Previous page", fr: "Page précédente" })}><ChevronLeftIcon /></button>
        <span aria-live="polite">{position}</span>
        <button className="icon-button" onClick={() => go("next")} disabled={!canNext} aria-label={tr({ ja: "次のページ", en: "Next page", fr: "Page suivante" })}><ChevronRightIcon /></button>
      </div>
    </div>,
    document.body,
  );
}
