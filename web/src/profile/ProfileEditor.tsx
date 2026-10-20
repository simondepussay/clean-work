import { useEffect, useState, type FormEvent } from "react";
import { getProfile, saveProfile, type Certification, type Education, type Issue, type Language, type ProfileInput, type Work } from "../api";
import { useAuth } from "../auth/auth";
import { ListEditor, type Field } from "./ListEditor";

const emptyProfile: ProfileInput = { nameKanji: "", nameKana: "", education: [], work: [], certifications: [], languages: [] };

const educationFields: Field<Education>[] = [
  { key: "school", label: "学校名 / School", required: true },
  { key: "faculty", label: "学部・学科 / Faculty" },
  { key: "start", label: "入学 / Start", type: "month", required: true },
  { key: "end", label: "卒業 / End", type: "month" },
  {
    key: "status", label: "状態 / Status", type: "select", options: [
      { value: "enrolled", label: "在学中 / Enrolled" },
      { value: "expected", label: "卒業見込み / Expected" },
      { value: "graduated", label: "卒業 / Graduated" },
      { value: "left", label: "中退 / Left" },
    ],
  },
];
const workFields: Field<Work>[] = [
  { key: "company", label: "会社名 / Company", required: true },
  { key: "role", label: "職種 / Role" },
  { key: "start", label: "入社 / Start", type: "month", required: true },
  { key: "end", label: "退社 / End", type: "month" },
  { key: "description", label: "内容 / Description", type: "textarea" },
];
const certificationFields: Field<Certification>[] = [
  { key: "name", label: "資格名 / Name", required: true },
  { key: "date", label: "取得 / Date", type: "month", required: true },
];
const languageFields: Field<Language>[] = [
  { key: "language", label: "言語 / Language", required: true },
  { key: "level", label: "レベル / Level" },
];

type Status = { kind: "loading" } | { kind: "ready" } | { kind: "saving" } | { kind: "saved" } | { kind: "error" };

/** Formulaire du profil (S05) : base du 履歴書 (S11). */
export function ProfileEditor({ onSaved }: { onSaved?: () => void }) {
  const auth = useAuth();
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

  const errors = new Map(issues.map((i) => [i.path, i.message]));
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

  if (status.kind === "loading") return <p className="muted">…</p>;

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
      <h2>プロフィール / Profile</h2>
      <fieldset>
        <legend>基本情報 / Basic information</legend>
        <div className="grid">
          {text("nameKanji", "氏名 / Name (漢字・カタカナ)", "text", true)}
          {text("nameKana", "ふりがな（ひらがな・カタカナ）/ Reading in kana", "text", true)}
          {text("nameLatin", "ローマ字 / Name (Latin)")}
          {text("birthDate", "生年月日 / Date of birth", "date")}
          {text("email", "メール / Email", "email")}
          {text("phone", "電話 / Phone", "tel")}
        </div>
        {text("address", "住所 / Address")}
      </fieldset>
      <ListEditor title="学歴 / Education" name="education" items={profile.education} fields={educationFields}
        empty={{ school: "", start: "", status: "enrolled" }} errors={errors} onChange={(v) => set("education", v)} />
      <ListEditor title="職歴 / Work experience" name="work" items={profile.work} fields={workFields}
        empty={{ company: "", start: "" }} errors={errors} onChange={(v) => set("work", v)} />
      <ListEditor title="資格 / Certifications" name="certifications" items={profile.certifications} fields={certificationFields}
        empty={{ name: "", date: "" }} errors={errors} onChange={(v) => set("certifications", v)} />
      <ListEditor title="語学 / Languages" name="languages" items={profile.languages} fields={languageFields}
        empty={{ language: "", level: "" }} errors={errors} onChange={(v) => set("languages", v)} />

      <div className="actions">
        <button className="primary" type="submit" disabled={status.kind === "saving"}>保存 / Save</button>
        <span role="status" className="muted">
          {status.kind === "saved" && "保存しました / Saved"}
          {status.kind === "error" && "保存できませんでした / Could not save"}
          {issues.length > 0 && `入力を確認してください（${issues.length}件）/ Please check ${issues.length} field(s)`}
        </span>
      </div>
    </form>
  );
}
