import { describe, it, expect, vi } from "vitest";
import type { RDKitModule, JSMol } from "@rdkit/rdkit";
import { molToSvg, cacheKey } from "../src/renderer";

const OPTS = { width: 350, height: 300 };

/** Build a fake RDKit module whose get_mol returns a controllable JSMol. */
function fakeRDKit(overrides: Partial<JSMol> & { valid?: boolean } = {}) {
  const { valid = true, ...molOverrides } = overrides;
  const del = vi.fn();
  const mol = {
    is_valid: () => valid,
    get_svg: () => "<svg data-mol></svg>",
    delete: del,
    ...molOverrides,
  } as unknown as JSMol;
  const get_mol = vi.fn(() => mol);
  const rdkit = { get_mol } as unknown as RDKitModule;
  return { rdkit, mol, get_mol, del };
}

describe("molToSvg", () => {
  it("renders SVG for a valid SMILES", () => {
    const { rdkit } = fakeRDKit();
    const result = molToSvg(rdkit, "CCO", OPTS);
    expect(result).toEqual({ ok: true, svg: "<svg data-mol></svg>" });
  });

  it("rejects empty / whitespace input without touching RDKit", () => {
    const { rdkit, get_mol } = fakeRDKit();
    const result = molToSvg(rdkit, "   ", OPTS);
    expect(result.ok).toBe(false);
    expect(get_mol).not.toHaveBeenCalled();
  });

  it("reports invalid SMILES", () => {
    const { rdkit } = fakeRDKit({ valid: false });
    const result = molToSvg(rdkit, "not-a-molecule", OPTS);
    expect(result).toEqual({
      ok: false,
      error: "invalid SMILES: not-a-molecule",
    });
  });

  it("treats a null get_mol result as invalid", () => {
    const get_mol = vi.fn(() => null);
    const rdkit = { get_mol } as unknown as RDKitModule;
    const result = molToSvg(rdkit, "X", OPTS);
    expect(result.ok).toBe(false);
  });

  it("frees the mol handle even when valid", () => {
    const { rdkit, del } = fakeRDKit();
    molToSvg(rdkit, "CCO", OPTS);
    expect(del).toHaveBeenCalledOnce();
  });

  it("frees the mol handle when rendering throws", () => {
    const { rdkit, del } = fakeRDKit({
      get_svg: () => {
        throw new Error("draw failed");
      },
    });
    const result = molToSvg(rdkit, "CCO", OPTS);
    expect(result).toEqual({ ok: false, error: "draw failed" });
    expect(del).toHaveBeenCalledOnce();
  });

  it("strips the RDKit <?xml?> prolog from the SVG", () => {
    const { rdkit } = fakeRDKit({
      get_svg: () =>
        "<?xml version='1.0' encoding='iso-8859-1'?>\n<svg>real</svg>",
    });
    const result = molToSvg(rdkit, "CCO", OPTS);
    expect(result).toEqual({ ok: true, svg: "<svg>real</svg>" });
  });

  it("trims input before parsing", () => {
    const { rdkit, get_mol } = fakeRDKit();
    molToSvg(rdkit, "  CCO\n", OPTS);
    expect(get_mol).toHaveBeenCalledWith("CCO");
  });
});

describe("cacheKey", () => {
  it("varies by dimensions and normalizes whitespace", () => {
    expect(cacheKey(" CCO ", OPTS)).toBe("350x300|CCO");
    expect(cacheKey("CCO", { width: 100, height: 100 })).toBe("100x100|CCO");
  });
});
