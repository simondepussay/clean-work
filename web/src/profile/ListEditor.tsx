/** Liste éditable (scolarité, expérience, certifications, langues) décrite par ses champs. */
import { PlusIcon } from "../icons";
import { useTr } from "../i18n";

export type Field<T> = {
  key: keyof T & string;
  label: string;
  type?: "text" | "month" | "date" | "select" | "textarea" | "checkbox";
  options?: { value: string; label: string }[];
  /** Pour une liste : texte de l'option vide (« choisir »), qui oblige à faire un choix. */
  placeholder?: string;
  /** Pour un texte : suggestions selon la ligne (par exemple selon la catégorie). */
  suggestions?: (item: T) => string[];
  required?: boolean;
  /** Affiche le champ seulement si la condition est vraie (par exemple langue « その他 »). */
  visible?: (item: T) => boolean;
};

type Props<T> = {
  title: string;
  name: string;
  items: T[];
  fields: Field<T>[];
  empty: T;
  errors: Map<string, string>;
  onChange: (items: T[]) => void;
};

export function ListEditor<T extends Record<string, unknown>>({ title, name, items, fields, empty, errors, onChange }: Props<T>) {
  const tr = useTr();
  const update = (index: number, key: keyof T, value: string | boolean) =>
    onChange(items.map((item, i) => (i === index ? { ...item, [key]: value } : item)));

  return (
    <fieldset className="list">
      <legend>{title}</legend>
      {items.map((item, i) => (
        <div className="row" key={i} role="group" aria-label={`${title} ${i + 1}`}>
          {fields.filter((f) => f.visible?.(item) ?? true).map((f) => {
            const id = `${name}.${i}.${f.key}`;
            const value = (item[f.key] as string | undefined) ?? "";
            const error = errors.get(id);
            return (
              <label key={f.key} className={error ? "invalid" : undefined}>
                <span>{f.label}{f.required && " *"}</span>
                {f.type === "checkbox" ? (
                  <input type="checkbox" checked={Boolean(item[f.key])} onChange={(e) => update(i, f.key, e.target.checked)} />
                ) : f.type === "select" ? (
                  <select value={value} onChange={(e) => update(i, f.key, e.target.value)}>
                    {f.placeholder && <option value="">{f.placeholder}</option>}
                    {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : f.type === "textarea" ? (
                  <textarea value={value} onChange={(e) => update(i, f.key, e.target.value)} rows={2} />
                ) : (
                  <>
                    <input type={f.type ?? "text"} value={value} list={f.suggestions ? `${id}.list` : undefined}
                      onChange={(e) => update(i, f.key, e.target.value)} />
                    {f.suggestions && (
                      <datalist id={`${id}.list`}>
                        {f.suggestions(item).map((s) => <option key={s} value={s} />)}
                      </datalist>
                    )}
                  </>
                )}
                {error && <small role="alert">{error}</small>}
              </label>
            );
          })}
          <button type="button" className="remove" onClick={() => onChange(items.filter((_, j) => j !== i))}>
            {tr({ ja: "削除", en: "Remove", fr: "Retirer" })}
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, { ...empty }])}><PlusIcon size={16} /> {tr({ ja: "追加", en: "Add", fr: "Ajouter" })}</button>
    </fieldset>
  );
}
