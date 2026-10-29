import { useEffect, useRef } from "react";
import { CloseIcon } from "../icons";
import { useTr } from "../i18n";
import { bookmarkletCode } from "./savedJob";

/**
 * « ブラウザから追加 » : comment enregistrer une offre depuis リクナビ, マイナビ, LinkedIn, Daijob… en un clic.
 *  - le bookmarklet (un favori à glisser dans la barre) : tout de suite, dans tous les navigateurs ;
 *  - l'extension Chrome, quand elle sera publiée sur le Chrome Web Store.
 * Dans les deux cas, la page est lue dans le navigateur de l'utilisateur, et Clean Work s'ouvre avec le formulaire rempli.
 */

export function SaveFromBrowser({ onClose }: { onClose: () => void }) {
  const tr = useTr();
  const link = useRef<HTMLAnchorElement>(null);
  // React refuse les liens « javascript: » dans href : on le pose directement sur l'élément.
  useEffect(() => { link.current?.setAttribute("href", bookmarkletCode(location.origin)); }, []);

  return (
    <section className="card save-from-browser" aria-label={tr({ ja: "ブラウザから追加", en: "Save from your browser", fr: "Ajouter depuis le navigateur" })}>
      <button className="close-x" onClick={onClose} aria-label={tr({ ja: "閉じる", en: "Close", fr: "Fermer" })}><CloseIcon size={18} /></button>
      <h3>{tr({ ja: "求人サイトから一クリックで追加", en: "Save jobs in one click", fr: "Ajouter une offre en un clic" })}</h3>
      <p className="muted">{tr({
        ja: "リクナビ・マイナビ・LinkedIn・Daijob・CareerCross などの求人ページで押すと、企業名・職種・URL・勤務地・締切が入った応募フォームが開きます。確かめて保存するだけです。",
        en: "On a job page (Rikunabi, Mynavi, LinkedIn, Daijob, CareerCross…), one click opens the application form with the company, position, link, location and deadline filled in. Just check and save.",
        fr: "Sur une page d'offre (Rikunabi, Mynavi, LinkedIn, Daijob, CareerCross…), un clic ouvre le formulaire avec l'entreprise, le poste, le lien, le lieu et la date limite. Il suffit de vérifier et d'enregistrer.",
      })}</p>
      <ol className="save-steps">
        <li>
          <strong>{tr({ ja: "このボタンをブックマークバーへドラッグ", en: "Drag this button to your bookmarks bar", fr: "Glissez ce bouton dans la barre de favoris" })}</strong>
          <a ref={link} className="bookmarklet" onClick={(e) => e.preventDefault()} draggable
            title={tr({ ja: "ブックマークバーへドラッグしてください", en: "Drag it to your bookmarks bar", fr: "Glissez-le dans la barre de favoris" })}>＋ Clean Work に追加</a>
        </li>
        <li>{tr({ ja: "求人ページを開いて、ブックマークを押す", en: "Open a job page and click the bookmark", fr: "Ouvrez une offre et cliquez sur le favori" })}</li>
        <li>{tr({ ja: "開いたフォームを確かめて「保存」", en: "Check the form that opens, then Save", fr: "Vérifiez le formulaire, puis « Enregistrer »" })}</li>
      </ol>
      <p className="muted small">{tr({
        ja: "説明の一部を選択してから押すと、その部分がメモに入ります。ページはお使いのブラウザの中で読み取られ、ほかには送られません。",
        en: "Select part of the description first and it goes into the notes. The page is read inside your browser and sent nowhere else.",
        fr: "Sélectionnez une partie de l'offre avant de cliquer : elle ira dans les notes. La page est lue dans votre navigateur et n'est envoyée nulle part ailleurs.",
      })}</p>
      <p className="muted small">{tr({
        ja: "Chrome 拡張機能「Clean Work に追加」は公開準備中です。iPhone では、Safari の共有ボタンから追加できるようになります。",
        en: "The “Clean Work に追加” Chrome extension is coming soon. On iPhone, you'll be able to add jobs from Safari's Share button.",
        fr: "L'extension Chrome « Clean Work に追加 » arrive bientôt. Sur iPhone, vous pourrez ajouter une offre depuis le bouton Partager de Safari.",
      })}</p>
    </section>
  );
}
