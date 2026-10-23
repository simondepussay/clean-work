import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import { clearApiCache } from "./api";
import { setHelpLanguage } from "./es/guide";

// Sans `globals: true`, Testing Library ne vide pas la page entre deux tests : on le fait ici.
afterEach(cleanup);
// Le cache des lectures de l'API ne doit pas passer d'un test à l'autre.
afterEach(() => clearApiCache());

// Les tests regardent l'interface en japonais (la langue principale de l'app) ; ceux qui
// vérifient une autre langue la choisissent eux-mêmes (setHelpLanguage).
beforeEach(() => setHelpLanguage("ja"));

// jsdom ne sait pas faire défiler la page : on ignore scrollTo dans les tests.
window.scrollTo = () => {};
