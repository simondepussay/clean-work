import { useEffect, useState, type FormEvent } from "react";
import { API_BASE, createAgentKey, listAgentKeys, revokeAgentKey, type AgentKey, type AgentScope } from "../api";
import { useAuth } from "../auth/auth";
import { ChevronRightIcon } from "../icons";
import { useTr } from "../i18n";

/** Adresse du serveur MCP, à donner à l'agent IA. */
export const mcpUrl = () => `${API_BASE || window.location.origin}/api/mcp`;

/** La commande à coller dans un terminal pour relier Claude Code (avec la clé, ou un exemple sans). */
/** L'adresse avec la clé dedans, pour les apps qui n'acceptent qu'une URL (ChatGPT, Claude). */
export const keyUrl = (key: string) => `${mcpUrl()}/${key}`;

export const claudeCommand = (key = "cwk_…") =>
  `claude mcp add --transport http clean-work ${mcpUrl()} --header "Authorization: Bearer ${key}"`;

type Copied = "key" | "url" | "command" | "keyurl" | null;

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
  const [copied, setCopied] = useState<Copied>(null);
  /** Repliée par défaut : la plupart des gens n'en ont pas besoin. */
  const [open, setOpen] = useState(false);
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

  const copy = async (what: Copied, value: string) => {
    await navigator.clipboard?.writeText(value).catch(() => undefined);
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  };
  const date = (iso: string) => new Date(iso).toLocaleDateString(tr.lang === "ja" ? "ja-JP" : tr.lang === "fr" ? "fr-FR" : "en-US");

  return (
    <details className="card agent-keys" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        <span className="agent-keys-title">
          <h2 id="agent-keys-title">{tr({ ja: "AIエージェント", en: "AI agents", fr: "Agents IA" })}</h2>
          {!open && <small className="muted">{keys && keys.length > 0
            ? tr({ ja: `キー ${keys.length}個`, en: `${keys.length} key${keys.length > 1 ? "s" : ""}`, fr: `${keys.length} clé${keys.length > 1 ? "s" : ""}` })
            : tr({ ja: "Claude や ChatGPT とつなぐ", en: "Connect Claude or ChatGPT", fr: "Relier Claude ou ChatGPT" })}</small>}
        </span>
        <ChevronRightIcon size={20} className="agent-keys-chevron" aria-hidden="true" />
      </summary>
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
          <AgentSetup secret={fresh} copied={copied} copy={copy} />
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
      {!fresh && <p className="muted agent-hint">{tr({
        ja: "キーを作ると、ChatGPT・Claude・Claude Code へのつなぎ方が表示されます。",
        en: "When you create a key, you'll see how to connect it to ChatGPT, Claude or Claude Code.",
        fr: "En créant une clé, vous verrez comment la relier à ChatGPT, Claude ou Claude Code.",
      })}</p>}
      {error && <p className="notice" role="alert">{error}</p>}
    </details>
  );
}

type AgentApp = "chatgpt" | "claude" | "claudeCode" | "other";
const APPS: { id: AgentApp; label: string }[] = [
  { id: "chatgpt", label: "ChatGPT" },
  { id: "claude", label: "Claude" },
  { id: "claudeCode", label: "Claude Code" },
  { id: "other", label: "…" },
];

/** Après la création d'une clé : comment la relier, selon l'app de l'utilisateur (un onglet par app). */
function AgentSetup({ secret, copied, copy }: { secret: string; copied: Copied; copy: (what: Copied, value: string) => void }) {
  const tr = useTr();
  const [app, setApp] = useState<AgentApp>("chatgpt");
  const copyLabel = (what: Copied, label: string) => (copied === what ? tr({ ja: "コピーしました", en: "Copied", fr: "Copié" }) : label);
  const urlRow = (
    <div className="agent-url"><code className="agent-command">{keyUrl(secret)}</code>
      <button type="button" className="primary" onClick={() => copy("keyurl", keyUrl(secret))}>{copyLabel("keyurl", tr({ ja: "URLをコピー", en: "Copy URL", fr: "Copier l'adresse" }))}</button>
    </div>
  );
  const urlWarning = <p className="muted">{tr({ ja: "このURLにはキーが入っています。人に見せないでください。", en: "This URL contains your key: keep it private.", fr: "Cette adresse contient votre clé : gardez-la secrète." })}</p>;

  return (
    <div className="agent-setup">
      <p className="agent-label">{tr({ ja: "どのAIで使いますか？", en: "Which AI do you use?", fr: "Avec quelle IA ?" })}</p>
      <div className="agent-tabs" role="tablist">
        {APPS.map((a) => (
          <button key={a.id} type="button" role="tab" aria-selected={app === a.id} className={app === a.id ? "current" : ""} onClick={() => setApp(a.id)}>
            {a.id === "other" ? tr({ ja: "その他", en: "Other", fr: "Autre" }) : a.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {app === "chatgpt" && <>
          <ol className="agent-steps">
            <li>{tr({ ja: "ChatGPT の「設定」→「アプリとコネクタ」→「詳細設定」で「開発者モード」をオンにします。", en: "In ChatGPT, open Settings → Apps & Connectors → Advanced settings and turn on Developer mode.", fr: "Dans ChatGPT, ouvrez Paramètres → Applications et connecteurs → Paramètres avancés, et activez le mode développeur." })}</li>
            <li>{tr({ ja: "「作成」を押し、名前は「Clean Work」、MCPサーバーのURLに下のURLを貼り、認証は「なし」を選びます。", en: "Click Create, name it “Clean Work”, paste the URL below as the MCP server URL, and choose “No authentication”.", fr: "Cliquez sur Créer, nommez-le « Clean Work », collez l'adresse ci-dessous comme URL du serveur MCP et choisissez « Aucune authentification »." })}</li>
            <li>{tr({ ja: "チャットで Clean Work を選んで、「今週の予定は？」などと頼みます。", en: "In a chat, pick Clean Work and ask, for example, “What do I have this week?”.", fr: "Dans une conversation, choisissez Clean Work et demandez par exemple « Qu'est-ce que j'ai cette semaine ? »." })}</li>
          </ol>
          {urlRow}
          <p className="muted">{tr({ ja: "開発者モードは、ChatGPT の有料プランで使えます。メニューの名前は変わることがあります。", en: "Developer mode is available on paid ChatGPT plans. Menu names may change.", fr: "Le mode développeur est disponible avec les offres payantes de ChatGPT. Les noms des menus peuvent changer." })}</p>
          {urlWarning}
        </>}

        {app === "claude" && <>
          <ol className="agent-steps">
            <li>{tr({ ja: "Claude（Web・デスクトップ）の「設定」→「コネクタ」→「カスタムコネクタを追加」を開きます。", en: "In Claude (web or desktop), open Settings → Connectors → Add custom connector.", fr: "Dans Claude (web ou bureau), ouvrez Paramètres → Connecteurs → Ajouter un connecteur personnalisé." })}</li>
            <li>{tr({ ja: "名前は「Clean Work」、URLに下のURLを貼って追加します。", en: "Name it “Clean Work”, paste the URL below and add it.", fr: "Nommez-le « Clean Work », collez l'adresse ci-dessous et ajoutez-le." })}</li>
            <li>{tr({ ja: "チャットのツールで Clean Work をオンにして、頼みます。", en: "Turn Clean Work on in the chat's tools, then ask.", fr: "Activez Clean Work dans les outils de la conversation, puis demandez." })}</li>
          </ol>
          {urlRow}
          {urlWarning}
        </>}

        {app === "claudeCode" && <>
          <p className="agent-steps-intro">{tr({ ja: "このコマンドをターミナルに貼りつけるだけです。", en: "Just paste this command into a terminal.", fr: "Collez simplement cette commande dans un terminal." })}</p>
          <div className="agent-url"><code className="agent-command">{claudeCommand(secret)}</code>
            <button type="button" className="primary" onClick={() => copy("command", claudeCommand(secret))}>{copyLabel("command", tr({ ja: "コマンドをコピー", en: "Copy command", fr: "Copier la commande" }))}</button>
          </div>
        </>}

        {app === "other" && <>
          <p className="agent-steps-intro">{tr({
            ja: "MCPに対応したエージェントなら使えます。サーバーのURLを入れ、ヘッダー「Authorization: Bearer キー」を追加します。ヘッダーを追加できない場合は、キー入りのURLを使ってください。",
            en: "Any MCP-compatible agent works. Add the server URL with the header “Authorization: Bearer <key>”. If it can't add headers, use the URL with the key in it.",
            fr: "Tout agent compatible MCP fonctionne. Ajoutez l'adresse du serveur avec l'en-tête « Authorization: Bearer <clé> ». S'il ne permet pas d'en-tête, utilisez l'adresse qui contient la clé.",
          })}</p>
          {urlRow}
          {urlWarning}
        </>}
      </div>
    </div>
  );
}
