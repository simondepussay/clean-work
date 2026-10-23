import { useEffect, useState, type FormEvent } from "react";
import { Loader } from "../Loader";
import { getProfile, saveProfile, type CvImport, type Certification, type Education, type Issue, type Language, type ProfileInput, type Work } from "../api";
import { useAuth } from "../auth/auth";
import { apiMessage, useTr } from "../i18n";
import { certificationCategories, certificationSuggestions, languages, levels, options } from "./choices";
import { CvImportPanel } from "./CvImportPanel";
import { ListEditor, type Field } from "./ListEditor";

const emptyProfile: ProfileInput = { nameKanji: "", nameKana: "", education: [], work: [], certifications: [], languages: [] };

type Status = { kind: "loading" } | { kind: "ready" } | { kind: "saving" } | { kind: "saved" } | { kind: "error" } | { kind: "imported" };

/** Formulaire du profil (S05) : base du 履歴書 (S11). */
export function ProfileEditor({ onSaved }: { onSaved?: () => void }) {
  const auth = useAuth();
  const tr = useTr();
  const lang = tr.lang;
  const choose = tr({ ja: "選択", en: "Choose", fr: "Choisir" });
  const educationFields: Field<Education>[] = [
    { key: "school", label: tr({ ja: "学校名", en: "School", fr: "Établissement" }), required: true },
    { key: "faculty", label: tr({ ja: "学部・学科", en: "Faculty", fr: "Faculté / filière" }) },
    { key: "start", label: tr({ ja: "入学", en: "Start", fr: "Entrée" }), type: "month", required: true },
    { key: "end", label: tr({ ja: "卒業・卒業予定", en: "End (or expected)", fr: "Fin (ou prévue)" }), type: "month" },
    {
      key: "status", label: tr({ ja: "状態", en: "Status", fr: "Statut" }), type: "select", options: [
        { value: "enrolled", label: tr({ ja: "在学中", en: "Enrolled", fr: "En cours" }) },
        { value: "expected", label: tr({ ja: "卒業見込み", en: "Expected to graduate", fr: "Diplôme prévu" }) },
        { value: "graduated", label: tr({ ja: "卒業", en: "Graduated", fr: "Diplômé" }) },
        { value: "completed", label: tr({ ja: "修了（日本語学校・留学）", en: "Completed (language school, exchange)", fr: "Terminé (école de langue, échange)" }) },
        { value: "left", label: tr({ ja: "中退", en: "Left", fr: "Abandon" }) },
      ],
    },
  ];
  const workFields: Field<Work>[] = [
    { key: "company", label: tr({ ja: "会社名", en: "Company", fr: "Entreprise" }), required: true },
    { key: "role", label: tr({ ja: "職種", en: "Role", fr: "Poste" }) },
    { key: "start", label: tr({ ja: "入社", en: "Start", fr: "Début" }), type: "month", required: true },
    { key: "end", label: tr({ ja: "退社", en: "End", fr: "Fin" }), type: "month" },
    { key: "description", label: tr({ ja: "内容", en: "Description", fr: "Description" }), type: "textarea" },
  ];
  const certificationFields: Field<Certification>[] = [
    { key: "category", label: tr({ ja: "分類", en: "Category", fr: "Catégorie" }), type: "select", options: options(certificationCategories, lang), placeholder: choose, required: true },
    { key: "name", label: tr({ ja: "資格名", en: "Name", fr: "Intitulé" }), required: true, suggestions: (c) => certificationSuggestions[c.category] ?? [] },
    { key: "date", label: tr({ ja: "取得", en: "Date", fr: "Date d'obtention" }), type: "month", required: true },
  ];
  const languageFields: Field<Language>[] = [
    { key: "language", label: tr({ ja: "言語", en: "Language", fr: "Langue" }), type: "select", options: options(languages, lang), placeholder: choose, required: true },
    { key: "languageOther", label: tr({ ja: "どの言語？", en: "Which language?", fr: "Quelle langue ?" }), required: true, visible: (l) => l.language === "other" },
    { key: "level", label: tr({ ja: "レベル", en: "Level", fr: "Niveau" }), type: "select", options: options(levels, lang), placeholder: choose, required: true },
  ];
  const [profile, setProfile] = useState<ProfileInput>(emptyProfile);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    auth.getToken()
      .then((token) => (token ? getProfile(token) : null))
      .then((p) => {
        setProfile({ ...emptyProfile, ...p });
        setStatus({ kind: "ready" });
      })
      .catch(() => setStatus({ kind: "error" }));
    // Chargé une fois, à l'ouverture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const errors = new Map(issues.map((i) => [i.path, apiMessage(i.message, lang)]));
  const set = <K extends keyof ProfileInput>(key: K, value: ProfileInput[K]) => {
    setProfile((p) => ({ ...p, [key]: value }));
    if (status.kind === "saved") setStatus({ kind: "ready" });
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus({ kind: "saving" });
    try {
      const token = await auth.getToken();
      if (!token) throw new Error("pas de jeton");
      const result = await saveProfile(token, profile);
      if (result.ok) {
        setIssues([]);
        setStatus({ kind: "saved" });
        onSaved?.();
      } else {
        setIssues(result.issues);
        setStatus({ kind: "ready" });
      }
    } catch {
      setStatus({ kind: "error" });
    }
  }

  /**
   * Un CV importé remplit le formulaire : les champs vides seulement (rien de ce qui est déjà saisi
   * n'est écrasé) et les lignes qui manquent. Les mois devinés sont signalés sous leur champ.
   */
  function applyCv(cv: CvImport) {
    const { check, education, work, certifications, languages, ...basics } = cv;
    const p = { ...profile };
    for (const [k, v] of Object.entries(basics) as [keyof typeof basics, string][]) {
      if (v && !p[k]) (p as Record<string, unknown>)[k] = v;
    }
    const same = (a: string | undefined, b: string | undefined) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
    const offset = { education: p.education.length, work: p.work.length, certifications: p.certifications.length, languages: p.languages.length };
    const newEducation = education.filter((e) => !p.education.some((x) => same(x.school, e.school)));
    const newWork = work.filter((w) => !p.work.some((x) => same(x.company, w.company)));
    const newCertifications = certifications.filter((c) => !p.certifications.some((x) => same(x.name, c.name)));
    const newLanguages = languages.filter((l) => !p.languages.some((x) => x.language === l.language));
    p.education = [...p.education, ...newEducation];
    p.work = [...p.work, ...newWork];
    p.certifications = [...p.certifications, ...newCertifications];
    p.languages = [...p.languages, ...newLanguages];
    setProfile(p);
    setStatus({ kind: "imported" });
    // « education.1.start » dans la réponse → l'index de la ligne dans le formulaire.
    const kept: Record<string, object[]> = { education: newEducation, work: newWork, certifications: newCertifications, languages: newLanguages };
    const source: Record<string, object[]> = { education, work, certifications, languages };
    setIssues(check.flatMap((path) => {
      const [list, i, field] = path.split(".");
      const row = source[list]?.[Number(i)];
      const index = row ? kept[list].indexOf(row) : -1;
      return index < 0 ? [] : [{ path: `${list}.${offset[list as keyof typeof offset] + index}.${field}`,
        message: "月を確認してください（CVに書いていませんでした） / Check the month (it wasn't in the CV)" }];
    }));
  }

  if (status.kind === "loading") return <Loader />;

  const text = (key: "nameKanji" | "nameKana" | "nameLatin" | "birthDate" | "email" | "phone" | "address", label: string,
    type = "text", required = false) => (
    <label className={errors.has(key) ? "invalid" : undefined}>
      <span>{label}{required && " *"}</span>
      <input type={type} value={profile[key] ?? ""} onChange={(e) => set(key, e.target.value)} />
      {errors.has(key) && <small role="alert">{errors.get(key)}</small>}
    </label>
  );

  return (
    <form className="profile" onSubmit={submit} noValidate>
      <div className="profile-head">
        <h2>{tr({ ja: "プロフィール", en: "Profile", fr: "Profil" })}</h2>
        <CvImportPanel onImported={applyCv} />
      </div>
      {status.kind === "imported" && (
        <p role="status" className="notice">{tr({
          ja: "CVの内容を入力しました。確認してから「保存」を押してください。",
          en: "Your CV has been filled in. Check it, then press Save.",
          fr: "Le contenu du CV a été rempli. Vérifiez-le, puis enregistrez.",
        })}</p>
      )}
      <fieldset>
        <legend>{tr({ ja: "基本情報", en: "Basic information", fr: "Informations de base" })}</legend>
        <div className="grid">
          {text("nameKanji", tr({ ja: "氏名（漢字・カタカナ）", en: "Name (kanji or katakana)", fr: "Nom (kanji ou katakana)" }), "text", true)}
          {text("nameKana", tr({ ja: "ふりがな（ひらがな・カタカナ）", en: "Reading in kana", fr: "Lecture en kana" }), "text", true)}
          {text("nameLatin", tr({ ja: "ローマ字", en: "Name (Latin letters)", fr: "Nom (alphabet latin)" }))}
          {text("birthDate", tr({ ja: "生年月日", en: "Date of birth", fr: "Date de naissance" }), "date")}
          {text("email", tr({ ja: "メール", en: "Email", fr: "E-mail" }), "email")}
          {text("phone", tr({ ja: "電話", en: "Phone", fr: "Téléphone" }), "tel")}
        </div>
        {text("address", tr({ ja: "住所", en: "Address", fr: "Adresse" }))}
      </fieldset>
      <ListEditor title={tr({ ja: "学歴", en: "Education", fr: "Formation" })} name="education" items={profile.education} fields={educationFields}
        empty={{ school: "", start: "", status: "enrolled" }} errors={errors} onChange={(v) => set("education", v)} />
      <ListEditor title={tr({ ja: "職歴", en: "Work experience", fr: "Expérience professionnelle" })} name="work" items={profile.work} fields={workFields}
        empty={{ company: "", start: "" }} errors={errors} onChange={(v) => set("work", v)} />
      <ListEditor title={tr({ ja: "資格", en: "Certifications", fr: "Certifications" })} name="certifications" items={profile.certifications} fields={certificationFields}
        empty={{ category: "", name: "", date: "" }} errors={errors} onChange={(v) => set("certifications", v)} />
      <ListEditor title={tr({ ja: "語学", en: "Languages", fr: "Langues" })} name="languages" items={profile.languages} fields={languageFields}
        empty={{ language: "", level: "" }} errors={errors} onChange={(v) => set("languages", v)} />

      <div className="actions">
        <button className="primary" type="submit" disabled={status.kind === "saving"}>{tr({ ja: "保存", en: "Save", fr: "Enregistrer" })}</button>
        <span role="status" className="muted">
          {status.kind === "saved" && tr({ ja: "保存しました", en: "Saved", fr: "Enregistré" })}
          {status.kind === "error" && tr({ ja: "保存できませんでした", en: "Could not save", fr: "Enregistrement impossible" })}
          {issues.length > 0 && tr({ ja: `入力を確認してください（${issues.length}件）`, en: `Please check ${issues.length} field(s)`, fr: `Vérifiez ${issues.length} champ(s)` })}
        </span>
      </div>
    </form>
  );
}
