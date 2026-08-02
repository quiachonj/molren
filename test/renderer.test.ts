import { describe, it, expect, vi } from "vitest";
import type { RDKitModule, JSMol } from "@rdkit/rdkit";
import { molToSvg, cacheKey } from "../src/renderer";
import type { MolrenSettings } from "../src/settings";

const OPTS = { width: 350, height: 300, addStereoAnnotation: true };

/** Build a fake RDKit module whose get_mol returns a controllable JSMol. */
function fakeRDKit(overrides: Partial<JSMol> & { valid?: boolean } = {}) {
  const { valid = true, ...molOverrides } = overrides;
  const del = vi.fn();
  const set_new_coords = vi.fn(() => true);
  const get_svg_with_highlights = vi.fn(
    (_details: string) => "<svg data-mol></svg>",
  );
  const mol = {
    is_valid: () => valid,
    set_new_coords,
    get_svg_with_highlights,
    delete: del,
    ...molOverrides,
  } as unknown as JSMol;
  const get_mol = vi.fn(() => mol);
  const rdkit = { get_mol } as unknown as RDKitModule;
  return { rdkit, mol, get_mol, del, set_new_coords, get_svg_with_highlights };
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

  it("regenerates CoordGen coordinates for the SMILES", () => {
    const { rdkit, set_new_coords } = fakeRDKit();
    molToSvg(rdkit, "CCO", OPTS);
    expect(set_new_coords).toHaveBeenCalledWith(true);
  });

  it("passes dimensions and stereo flag through the draw options", () => {
    const { rdkit, get_svg_with_highlights } = fakeRDKit();
    molToSvg(rdkit, "CCO", { width: 400, height: 250, addStereoAnnotation: false });
    const details = JSON.parse(get_svg_with_highlights.mock.calls[0][0]);
    expect(details).toMatchObject({
      width: 400,
      height: 250,
      addStereoAnnotation: false,
    });
  });

  it("frees the mol handle even when valid", () => {
    const { rdkit, del } = fakeRDKit();
    molToSvg(rdkit, "CCO", OPTS);
    expect(del).toHaveBeenCalledOnce();
  });

  it("frees the mol handle when rendering throws", () => {
    const { rdkit, del } = fakeRDKit({
      get_svg_with_highlights: () => {
        throw new Error("draw failed");
      },
    });
    const result = molToSvg(rdkit, "CCO", OPTS);
    expect(result).toEqual({ ok: false, error: "draw failed" });
    expect(del).toHaveBeenCalledOnce();
  });

  it("strips the RDKit <?xml?> prolog from the SVG", () => {
    const { rdkit } = fakeRDKit({
      get_svg_with_highlights: () =>
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
  const base: MolrenSettings = { width: 350, height: 300, addStereoAnnotation: true };

  it("varies by dimensions and normalizes whitespace", () => {
    expect(cacheKey(" CCO ", base)).toBe("350x300|s1|CCO");
    expect(cacheKey("CCO", { ...base, width: 100, height: 100 })).toBe(
      "100x100|s1|CCO",
    );
  });

  it("varies by the stereo-annotation flag", () => {
    expect(cacheKey("CCO", { ...base, addStereoAnnotation: false })).toBe(
      "350x300|s0|CCO",
    );
  });
});
