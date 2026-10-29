import { useEffect, useRef, useState } from "react";
import { Loader } from "../Loader";
import { getCalendarLink, resetCalendarLink } from "../api";
import { useAuth } from "../auth/auth";
import { useTr } from "../i18n";
import { CalendarIcon, CheckIcon, DocIcon } from "../icons";

/**
 * « Ajouter au calendrier » : un abonnement (le calendrier relit le lien tout seul, les
 * changements suivent) vers Google, Apple ou Outlook ; ou le lien à copier pour un autre
 * calendrier ; ou un fichier .ics ponctuel.
 */
export function CalendarMenu({ onDownload, canDownload = false }: { onDownload?: () => void; canDownload?: boolean }) {
  const auth = useAuth();
  const tr = useTr();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || url) return;
    auth.getToken()
      .then((t) => (t ? getCalendarLink(t, tr.lang) : null))
      .then((r) => (r?.ok ? setUrl(r.value.url) : setFailed(true)))
      .catch(() => setFailed(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const webcal = url?.replace(/^https:/, "webcal:");
  const targets = url && webcal ? [
    { name: "Google カレンダー", label: tr({ ja: "Google カレンダー", en: "Google Calendar", fr: "Google Agenda" }),
      href: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}` },
    { name: "Apple", label: tr({ ja: "Apple カレンダー（Mac・iPhone）", en: "Apple Calendar (Mac, iPhone)", fr: "Calendrier Apple (Mac, iPhone)" }), href: webcal },
    { name: "Outlook", label: "Outlook",
      href: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(url)}&name=${encodeURIComponent("Clean Work")}` },
  ] : [];

  async function reset() {
    if (!window.confirm(tr({
      ja: "新しいリンクを作成しますか？今のリンクは使えなくなり、カレンダーにもう一度追加する必要があります。",
      en: "Create a new link? The current link will stop working and you will need to add the calendar again.",
      fr: "Créer un nouveau lien ? Le lien actuel ne marchera plus et il faudra rajouter le calendrier.",
    }))) return;
    try {
      const t = await auth.getToken();
      const r = t ? await resetCalendarLink(t, tr.lang) : null;
      if (r?.ok) setUrl(r.value.url); else setFailed(true);
    } catch {
      setFailed(true);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* presse-papiers refusé : le lien reste affiché, on peut le sélectionner */ }
  }

  return (
    <div className="calendar-menu" ref={root}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <CalendarIcon size={16} /> {tr({ ja: "カレンダーに追加", en: "Add to calendar", fr: "Ajouter au calendrier" })}
      </button>
      {open && (
        <div className="menu wide" role="menu" aria-label={tr({ ja: "カレンダーに追加", en: "Add to calendar", fr: "Ajouter au calendrier" })}>
          <p className="menu-title">{tr({ ja: "カレンダーで購読（自動で更新）", en: "Subscribe (updates automatically)", fr: "S'abonner (mise à jour automatique)" })}</p>
          {!url && !failed && <Loader size={26} />}
          {failed && <p className="menu-note">{tr({ ja: "リンクを作成できませんでした", en: "Could not create the link", fr: "Impossible de créer le lien" })}</p>}
          {targets.map((t) => (
            <a key={t.name} role="menuitem" className="menu-link" href={t.href} target={t.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
              {t.label}
            </a>
          ))}
          {url && (
            <>
              <p className="menu-title">{tr({ ja: "その他のカレンダー", en: "Other calendar", fr: "Autre calendrier" })}</p>
              <div className="copy-row">
                <input readOnly value={url} aria-label={tr({ ja: "購読用リンク", en: "Subscription link", fr: "Lien d'abonnement" })} onFocus={(e) => e.target.select()} />
                <button type="button" onClick={copy}>{copied ? <><CheckIcon size={14} /> {tr({ ja: "コピー済み", en: "Copied", fr: "Copié" })}</> : tr({ ja: "コピー", en: "Copy", fr: "Copier" })}</button>
              </div>
            </>
          )}
          {onDownload && (
            <button type="button" role="menuitem" className="menu-link" onClick={() => { onDownload(); setOpen(false); }} disabled={!canDownload}>
              <DocIcon size={15} /> {tr({ ja: ".ics ファイルをダウンロード（一度だけ）", en: "Download an .ics file (one-off)", fr: "Télécharger un fichier .ics (ponctuel)" })}
            </button>
          )}
          <p className="menu-note">{tr({
            ja: "このリンクは自分専用です。リンクを知っている人は予定を見られるので、共有しないでください。",
            en: "This link is private: anyone who has it can see your schedule, so don't share it.",
            fr: "Ce lien est personnel : toute personne qui l'a peut voir votre agenda, ne le partagez pas.",
          })}</p>
          {url && (
            <button type="button" role="menuitem" className="menu-link" onClick={reset}>
              {tr({ ja: "リンクを作り直す（今のリンクは無効に）", en: "Create a new link (the current one stops working)", fr: "Créer un nouveau lien (l'actuel ne marchera plus)" })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
