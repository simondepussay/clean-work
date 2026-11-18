import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { cardImageUrl, cardMatches, deleteCard, listCards, updateCard, type BusinessCard, type BusinessCardInput } from "../api";
import { useAuth } from "../auth/auth";
import { CloseIcon, MailIcon, PhoneIcon, SearchIcon, TrashIcon } from "../icons";
import { useTr } from "../i18n";
import { Loader } from "../Loader";

/** Lien vers l'app iPhone : la bêta (TestFlight) tant que l'app n'est pas sur l'App Store. */
const BETA_HASH = "#beta";

type Field = Exclude<keyof BusinessCardInput, "applicationId" | "rawText">;

/** La photo d'une carte, chargée à la demande (elle n'est pas dans la liste, pour que la liste reste légère). */
function CardPhoto({ id, alt, className }: { id: string; alt: string; className: string }) {
  const auth = useAuth();
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    let alive = true;
    auth.getToken().then((t) => (t ? cardImageUrl(t, id) : null)).then((u) => {
      url = u;
      if (alive) setSrc(u);
      else if (u) URL.revokeObjectURL(u);
    });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une photo par carte
  }, [id]);
  return src ? <img className={className} src={src} alt={alt} /> : <div className={`${className} placeholder`} aria-hidden="true" />;
}

/**
 * Onglet « 名刺 » de 書類 : les cartes de visite scannées avec l'iPhone.
 * Sur le web, on les retrouve par mots-clés, on les relit et on complète les notes ; le scan se fait dans l'app.
 */
export function CardsPanel() {
  const auth = useAuth();
  const tr = useTr();
  const [cards, setCards] = useState<BusinessCard[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    auth.getToken().then((t) => (t ? listCards(t) : null))
      .then((r) => { if (alive) { if (r?.ok) setCards(r.value); else setError(true); } })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une fois à l'ouverture
  }, []);

  const shown = useMemo(() => (cards ?? []).filter((c) => cardMatches(c, query)), [cards, query]);
  const current = cards?.find((c) => c.id === openId) ?? null;

  if (error) return <p className="muted">{tr({ ja: "名刺を読み込めませんでした。", en: "Could not load your business cards.", fr: "Impossible de charger vos cartes de visite." })}</p>;
  if (!cards) return <Loader />;

  if (cards.length === 0) {
    return (
      <section className="card cards-empty">
        <div className="cards-empty-art" aria-hidden="true"><span>名刺</span></div>
        <h2>{tr({ ja: "名刺はまだありません", en: "No business cards yet", fr: "Pas encore de carte de visite" })}</h2>
        <p className="muted">{tr({
          ja: "説明会やOB訪問でもらった名刺は、iPhone アプリで撮影するだけで登録できます。名前や会社名は自動で読み取られ、ここからキーワードで探せます。",
          en: "Business cards from info sessions or OB visits can be added by scanning them with the iPhone app. Names and companies are read automatically, and you can search them here.",
          fr: "Les cartes reçues en 説明会 ou en OB訪問 s'ajoutent en les scannant avec l'app iPhone. Le nom et l'entreprise sont lus automatiquement, et vous les retrouvez ici par mots-clés.",
        })}</p>
        <a className="button primary" href={BETA_HASH}>{tr({ ja: "iPhone アプリ（ベータ版）を入手", en: "Get the iPhone app (beta)", fr: "Obtenir l'app iPhone (bêta)" })}</a>
      </section>
    );
  }

  return (
    <section className="cards-panel">
      <div className="cards-head">
        <h2>{tr({ ja: "名刺", en: "Business cards", fr: "Cartes de visite" })} <span>{cards.length}</span></h2>
        <label className="es-search cards-search">
          <SearchIcon size={18} aria-hidden="true" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={tr({ ja: "名前・会社・メモで検索", en: "Search name, company, notes…", fr: "Chercher : nom, entreprise, notes…" })}
            aria-label={tr({ ja: "名刺を検索", en: "Search business cards", fr: "Chercher une carte" })} />
        </label>
      </div>
      <p className="muted small">{tr({ ja: "名刺の追加は iPhone アプリで撮影してください。", en: "To add a card, scan it with the iPhone app.", fr: "Pour ajouter une carte, scannez-la avec l'app iPhone." })}</p>
      {shown.length === 0 && <p className="muted">{tr({ ja: "見つかりませんでした。", en: "No card matches.", fr: "Aucune carte ne correspond." })}</p>}
      <ul className="cards-grid">
        {shown.map((c) => (
          <li key={c.id}>
            <button className="card-tile" onClick={() => setOpenId(c.id)}>
              {c.hasImage ? <CardPhoto id={c.id} alt="" className="card-thumb" /> : <div className="card-thumb placeholder" aria-hidden="true">名刺</div>}
              <span className="card-name">{c.name || c.company || "—"}</span>
              <span className="card-company">{[c.company, c.title].filter(Boolean).join(" · ")}</span>
              {c.notes && <span className="card-notes">{c.notes}</span>}
            </button>
          </li>
        ))}
      </ul>
      {current && (
        <CardDetail key={current.id} card={current}
          onClose={() => setOpenId(null)}
          onSaved={(c) => setCards((all) => all?.map((x) => (x.id === c.id ? c : x)) ?? all)}
          onDeleted={(id) => { setOpenId(null); setCards((all) => all?.filter((x) => x.id !== id) ?? all); }} />
      )}
    </section>
  );
}

/** La fiche d'une carte : la photo, les infos (modifiables) et les notes. */
function CardDetail({ card, onClose, onSaved, onDeleted }: {
  card: BusinessCard; onClose: () => void; onSaved: (c: BusinessCard) => void; onDeleted: (id: string) => void;
}) {
  const auth = useAuth();
  const tr = useTr();
  const [form, setForm] = useState<Record<Field, string>>(() => ({
    name: card.name ?? "", nameKana: card.nameKana ?? "", company: card.company ?? "", department: card.department ?? "",
    title: card.title ?? "", email: card.email ?? "", phone: card.phone ?? "", mobile: card.mobile ?? "", address: card.address ?? "",
    website: card.website ?? "", metAt: card.metAt ?? "", metOn: card.metOn ?? "", notes: card.notes ?? "",
  }));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [issues, setIssues] = useState<Record<string, string>>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const labels: Record<Field, string> = {
    name: tr({ ja: "氏名", en: "Name", fr: "Nom" }),
    nameKana: tr({ ja: "ふりがな", en: "Reading (kana)", fr: "Lecture (kana)" }),
    company: tr({ ja: "会社名", en: "Company", fr: "Entreprise" }),
    department: tr({ ja: "部署", en: "Department", fr: "Service" }),
    title: tr({ ja: "役職", en: "Title", fr: "Poste" }),
    email: tr({ ja: "メール", en: "Email", fr: "E-mail" }),
    phone: tr({ ja: "電話", en: "Phone", fr: "Téléphone" }),
    mobile: tr({ ja: "携帯", en: "Mobile", fr: "Portable" }),
    address: tr({ ja: "住所", en: "Address", fr: "Adresse" }),
    website: tr({ ja: "Webサイト", en: "Website", fr: "Site web" }),
    metAt: tr({ ja: "会った場所", en: "Where we met", fr: "Rencontré à" }),
    metOn: tr({ ja: "会った日", en: "Date met", fr: "Date de la rencontre" }),
    notes: tr({ ja: "メモ", en: "Notes", fr: "Notes" }),
  };

  async function save() {
    setState("saving");
    const token = await auth.getToken();
    if (!token) return setState("error");
    // Un champ vidé part en null : le serveur l'efface.
    const input: BusinessCardInput = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() ? v.trim() : null]));
    try {
      const r = await updateCard(token, card.id, input);
      if (!r.ok) {
        setIssues(Object.fromEntries(r.issues.map((i) => [i.path, i.message])));
        return setState("error");
      }
      setIssues({});
      onSaved(r.value!);
      setState("saved");
    } catch {
      setState("error");
    }
  }

  async function remove() {
    if (!window.confirm(tr({ ja: "この名刺を削除しますか？", en: "Delete this business card?", fr: "Supprimer cette carte de visite ?" }))) return;
    const token = await auth.getToken();
    if (!token) return;
    try {
      const r = await deleteCard(token, card.id);
      if (r.ok) onDeleted(card.id);
    } catch {
      setState("error");
    }
  }

  const input = (f: Field, type = "text") => (
    <label key={f}>
      <span>{labels[f]}</span>
      <input type={type} value={form[f]} onChange={(e) => { setForm({ ...form, [f]: e.target.value }); setState("idle"); }} />
      {issues[f] && <small role="alert">{issues[f]}</small>}
    </label>
  );

  // Rendue à la racine de la page : la feuille de l'onglet ne doit pas la faire passer sous les intercalaires.
  return createPortal(
    <div className="card-detail-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card card-detail" role="dialog" aria-modal="true" aria-label={card.name || card.company || labels.name}>
        <button className="round-button card-detail-close" onClick={onClose} aria-label={tr({ ja: "閉じる", en: "Close", fr: "Fermer" })}><CloseIcon size={20} /></button>
        {card.hasImage && <CardPhoto id={card.id} alt={tr({ ja: "名刺の写真", en: "Photo of the card", fr: "Photo de la carte" })} className="card-photo" />}
        <div className="card-quick">
          {card.email && <a href={`mailto:${card.email}`}><MailIcon size={18} aria-hidden="true" /> {card.email}</a>}
          {(card.phone || card.mobile) && <a href={`tel:${(card.mobile || card.phone)!.replace(/[^\d+]/g, "")}`}><PhoneIcon size={18} aria-hidden="true" /> {card.mobile || card.phone}</a>}
        </div>
        <div className="card-form">
          {input("name")}{input("nameKana")}{input("company")}{input("department")}{input("title")}
          {input("email", "email")}{input("phone", "tel")}{input("mobile", "tel")}{input("address")}{input("website", "url")}
          {input("metAt")}{input("metOn", "date")}
          <label className="wide">
            <span>{labels.notes}</span>
            <textarea rows={5} value={form.notes} onChange={(e) => { setForm({ ...form, notes: e.target.value }); setState("idle"); }}
              placeholder={tr({ ja: "話した内容、お礼メールを送ったか、次にすること…", en: "What you talked about, thank-you email sent, next step…", fr: "Ce dont vous avez parlé, mail de remerciement envoyé, prochaine étape…" })} />
          </label>
        </div>
        <div className="actions">
          <button className="primary" onClick={save} disabled={state === "saving"}>{tr({ ja: "保存", en: "Save", fr: "Enregistrer" })}</button>
          {state === "saved" && <span className="muted" role="status">{tr({ ja: "保存しました", en: "Saved", fr: "Enregistré" })}</span>}
          {state === "error" && <span className="muted" role="alert">{tr({ ja: "保存できませんでした", en: "Could not save", fr: "Impossible d'enregistrer" })}</span>}
          <button className="danger card-delete" onClick={remove}><TrashIcon size={16} aria-hidden="true" /> {tr({ ja: "削除", en: "Delete", fr: "Supprimer" })}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
