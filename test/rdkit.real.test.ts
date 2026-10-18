import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import type { RDKitModule } from "@rdkit/rdkit";
import { molToSvg } from "../src/svg";

/**
 * Smoke tests against the REAL RDKit wasm (no fakes). They guard behavior the
 * mocked tests cannot, e.g. what has_coords() actually returns at runtime.
 * Loading the wasm takes ~150 ms, so they run as part of `npm test`.
 */
const OPTS = { width: 350, height: 300, addStereoAnnotation: true };

/** Fixed-width V2000 molblock for a 3-atom chain; `atom3` is the last atom's x/y/z columns. */
function chain(dim: "2D" | "3D", atom3: string): string {
  return [
    "chain",
    `     RDKit          ${dim}`,
    "",
    "  3  2  0  0  0  0  0  0  0  0999 V2000",
    "   -0.7500    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
    "    0.7500    0.2000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0",
    `${atom3} O   0  0  0  0  0  0  0  0  0  0  0  0`,
    "  1  2  1  0",
    "  2  3  1  0",
    "M  END",
  ].join("\n");
}

// Atom 3 sits directly above atom 1 in x/y: drawn as-is, bond 2 folds back
// over bond 1. A fresh CoordGen layout draws a normal zigzag.
const MOLBLOCK_3D = chain("3D", "   -0.7500    0.0000    1.8000");
const MOLBLOCK_2D = chain("2D", "    1.3000   -0.6000    0.0000");

let rdkit: RDKitModule;

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const init = require("@rdkit/rdkit") as (o: {
    wasmBinary: Uint8Array;
  }) => Promise<RDKitModule>;
  const wasm = require.resolve("@rdkit/rdkit/dist/RDKit_minimal.wasm");
  rdkit = await init({ wasmBinary: readFileSync(wasm) });
}, 30_000);

function hasCoords(input: string): unknown {
  const mol = rdkit.get_mol(input);
  try {
    return mol?.has_coords();
  } finally {
    mol?.delete();
  }
}

/** Bond path data (`d='M x,y L x,y'`) in drawing order. */
function bondPaths(svg: string): string[] {
  return [...svg.matchAll(/class='bond-\d+[^']*'[^>]*d='([^']*)'/g)].map(
    (m) => m[1],
  );
}

describe("real RDKit", () => {
  it("has_coords() returns 0 / 2 / 3 for SMILES / 2D / 3D", () => {
    expect(hasCoords("CCO")).toBe(0);
    expect(hasCoords(MOLBLOCK_2D)).toBe(2);
    expect(hasCoords(MOLBLOCK_3D)).toBe(3);
  });

  it("renders SMILES to a valid SVG", () => {
    const res = molToSvg(rdkit, "CCO", OPTS);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.svg).toMatch(/^<svg/);
  });

  it("keeps authored 2D coordinates (a 2D molblock is not re-laid-out)", () => {
    const res = molToSvg(rdkit, MOLBLOCK_2D, OPTS);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const smiles = molToSvg(rdkit, "CCO", OPTS);
    expect(smiles.ok && bondPaths(res.svg)).not.toEqual(
      smiles.ok && bondPaths(smiles.svg),
    );
  });

  it("lays out a 3D molblock afresh (same drawing as CoordGen), not its x/y projection", () => {
    const res3d = molToSvg(rdkit, MOLBLOCK_3D, OPTS);
    const resSmiles = molToSvg(rdkit, "CCO", OPTS);
    expect(res3d.ok && resSmiles.ok).toBe(true);
    if (!res3d.ok || !resSmiles.ok) return;
    expect(res3d.svg).toMatch(/^<svg/);
    expect(bondPaths(res3d.svg).length).toBeGreaterThan(0);
    expect(bondPaths(res3d.svg)).toEqual(bondPaths(resSmiles.svg));
  });
});
