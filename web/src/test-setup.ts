import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Sans `globals: true`, Testing Library ne vide pas la page entre deux tests : on le fait ici.
afterEach(cleanup);
