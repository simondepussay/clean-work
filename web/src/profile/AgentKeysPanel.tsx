import { useEffect, useState, type FormEvent } from "react";
import { API_BASE, createAgentKey, listAgentKeys, revokeAgentKey, type AgentKey, type AgentScope } from "../api";
import { useAuth } from "../auth/auth";
import { useTr } from "../i18n";

/** Adresse du serveur MCP, à donner à l'agent IA. */
export const mcpUrl = () => `${API_BASE || window.location.origin}/api/mcp`;

/**
 * Page du compte : relier son agent IA (Claude, ChatGPT…) à Clean Work par une clé.
 * La clé n'est montrée qu'une fois ; on peut en avoir 5, et les révoquer d'un geste.
 */
export function AgentKeysPanel() {
  const auth = useAuth();
  const tr = useTr();
  const [keys, setKeys] = useState<AgentKey[] | null>(null);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<AgentScope>("write");
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState<"key" | "url" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const token = await auth.getToken();
    const res = token ? await listAgentKeys(token).catch(() => null) : null;
    setKeys(res?.ok ? res.value : []);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const token = await auth.getToken();
    const res = token ? await createAgentKey(token, name.trim(), scope) : null;
    setBusy(false);
    if (res?.ok) {
      setFresh(res.key);
      setName("");
      await load();
    } else {
      setError(res && !res.ok && res.error === "too_many"
        ? tr({ ja: "キーは5つまでです。使っていないキーを削除してください。", en: "You can have up to 5 keys. Revoke one you no longer use.", fr: "5 clés au maximum. Révoquez une clé que vous n'utilisez plus." })
        : tr({ ja: "キーを作れませんでした。もう一度お試しください。", en: "Couldn't create the key. Please try again.", fr: "Impossible de créer la clé. Réessayez." }));
    }
  }

  async function revoke(k: AgentKey) {
    if (!window.confirm(tr({ ja: `「${k.name}」のキーを削除しますか？このキーを使っているエージェントは、すぐに使えなくなります。`, en: `Revoke “${k.name}”? Agents using this key lose access immediately.`, fr: `Révoquer « ${k.name} » ? Les agents qui l'utilisent perdent l'accès tout de suite.` }))) return;
    const token = await auth.getToken();
    if (token && (await revokeAgentKey(token, k.id))) await load();
  }

  const copy = async (what: "key" | "url", value: string) => {
    await navigator.clipboard?.writeText(value).catch(() => undefined);
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  };
  const date = (iso: string) => new Date(iso).toLocaleDateString(tr.lang === "ja" ? "ja-JP" : tr.lang === "fr" ? "fr-FR" : "en-US");

  return (
    <section className="card agent-keys" aria-labelledby="agent-keys-title">
      <h2 id="agent-keys-title">{tr({ ja: "AIエージェント", en: "AI agents", fr: "Agents IA" })}</h2>
      <p className="muted">{tr({
        ja: "Claude や ChatGPT などのAIエージェントに、応募の追加や予定の登録を任せられます。こころと日記には触れず、何も削除できません。",
        en: "Let an AI agent such as Claude or ChatGPT add applications or calendar items for you. It never touches Kokoro or your journal, and can't delete anything.",
        fr: "Confiez à un agent IA comme Claude ou ChatGPT l'ajout de candidatures ou d'événements. Il ne touche jamais à こころ ni au journal, et ne peut rien supprimer.",
      })} <a href={tr.lang === "ja" ? "/faq.html#agents" : "/faq.html?lang=en#agents-en"} target="_blank" rel="noopener">{tr({ ja: "くわしく", en: "Learn more", fr: "En savoir plus" })}</a></p>

      <div className="agent-url">
        <span className="muted">{tr({ ja: "MCPサーバーのURL", en: "MCP server URL", fr: "Adresse du serveur MCP" })}</span>
        <code>{mcpUrl()}</code>
        <button type="button" onClick={() => copy("url", mcpUrl())}>{copied === "url" ? tr({ ja: "コピーしました", en: "Copied", fr: "Copié" }) : tr({ ja: "コピー", en: "Copy", fr: "Copier" })}</button>
      </div>

      {fresh && (
        <div className="agent-fresh" role="status">
          <strong>{tr({ ja: "新しいキー（この画面でしか表示されません）", en: "Your new key (shown only once)", fr: "Votre nouvelle clé (affichée une seule fois)" })}</strong>
          <div className="agent-url"><code>{fresh}</code>
            <button type="button" onClick={() => copy("key", fresh)}>{copied === "key" ? tr({ ja: "コピーしました", en: "Copied", fr: "Copié" }) : tr({ ja: "コピー", en: "Copy", fr: "Copier" })}</button>
          </div>
          <p className="muted">{tr({
            ja: "エージェントの設定で「Authorization: Bearer キー」として使ってください。パスワードと同じように、人に見せないでください。",
            en: "Use it in your agent's settings as “Authorization: Bearer <key>”. Keep it private, like a password.",
            fr: "À utiliser dans les réglages de l'agent : « Authorization: Bearer <clé> ». Gardez-la secrète, comme un mot de passe.",
          })}</p>
          <button type="button" onClick={() => setFresh(null)}>{tr({ ja: "保存しました", en: "I've saved it", fr: "Je l'ai notée" })}</button>
        </div>
      )}

      {keys && keys.length > 0 && (
        <ul className="agent-list">
          {keys.map((k) => (
            <li key={k.id}>
              <div>
                <strong>{k.name}</strong>
                <span className={`agent-scope ${k.scope}`}>{k.scope === "write" ? tr({ ja: "読む・書く", en: "Read & write", fr: "Lecture et écriture" }) : tr({ ja: "読むだけ", en: "Read only", fr: "Lecture seule" })}</span>
                <small className="muted">{tr({ ja: `作成 ${date(k.createdAt)}`, en: `Created ${date(k.createdAt)}`, fr: `Créée le ${date(k.createdAt)}` })}
                  {" · "}{k.lastUsedAt ? tr({ ja: `最終使用 ${date(k.lastUsedAt)}`, en: `Last used ${date(k.lastUsedAt)}`, fr: `Utilisée le ${date(k.lastUsedAt)}` }) : tr({ ja: "未使用", en: "Never used", fr: "Jamais utilisée" })}</small>
              </div>
              <button type="button" className="danger" onClick={() => revoke(k)}>{tr({ ja: "削除", en: "Revoke", fr: "Révoquer" })}</button>
            </li>
          ))}
        </ul>
      )}

      <form className="agent-new" onSubmit={create}>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40}
          placeholder={tr({ ja: "キーの名前（例：Claude）", en: "Key name (e.g. Claude)", fr: "Nom de la clé (ex. Claude)" })}
          aria-label={tr({ ja: "キーの名前", en: "Key name", fr: "Nom de la clé" })} />
        <select value={scope} onChange={(e) => setScope(e.target.value as AgentScope)} aria-label={tr({ ja: "できること", en: "Access", fr: "Accès" })}>
          <option value="write">{tr({ ja: "読む・書く", en: "Read & write", fr: "Lecture et écriture" })}</option>
          <option value="read">{tr({ ja: "読むだけ", en: "Read only", fr: "Lecture seule" })}</option>
        </select>
        <button className="primary" disabled={busy || !name.trim()}>{tr({ ja: "キーを作る", en: "Create a key", fr: "Créer une clé" })}</button>
      </form>
      {error && <p className="notice" role="alert">{error}</p>}
    </section>
  );
}
