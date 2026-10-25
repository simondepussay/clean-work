import { Component, type ReactNode } from "react";
import { reloadOnce } from "./reloadOnNewVersion";

type Props = { children: ReactNode; message: string; action: string };

/**
 * Filet de sécurité autour des onglets : si l'un d'eux ne peut pas s'afficher (fichier d'une ancienne
 * version, réseau coupé…), on recharge une fois, sinon on montre un message et un bouton — jamais un écran blanc.
 */
export class PageErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[Clean Work] onglet impossible à afficher", error);
    if (/dynamically imported module|Importing a module script failed|Failed to fetch/i.test(String(error))) reloadOnce();
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="card page-error" role="alert">
        <p>{this.props.message}</p>
        <button className="primary" onClick={() => window.location.reload()}>{this.props.action}</button>
      </section>
    );
  }
}
