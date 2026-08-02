import { describe, it, expect, vi } from "vitest";
import type { RDKitModule, JSMol } from "@rdkit/rdkit";
import {
  molToSvg,
  rxnToSvg,
  isReaction,
  recolorForTheme,
  cacheKey,
  parseInput,
  detectFormat,
} from "../src/renderer";
import type { MolrenSettings } from "../src/settings";

const OPTS = { width: 350, height: 300, addStereoAnnotation: true };

/**
 * Build a fake RDKit module whose get_mol returns a controllable JSMol.
 * `hasCoords` mirrors RDKit's has_coords() (0 = none, 2 = 2D).
 */
function fakeRDKit(
  overrides: Partial<JSMol> & { valid?: boolean; hasCoords?: number } = {},
) {
  const { valid = true, hasCoords = 0, ...molOverrides } = overrides;
  const del = vi.fn();
  const set_new_coords = vi.fn(() => true);
  const has_coords = vi.fn(() => hasCoords);
  const get_svg_with_highlights = vi.fn(
    (_details: string) => "<svg data-mol></svg>",
  );
  const mol = {
    is_valid: () => valid,
    has_coords,
    set_new_coords,
    get_svg_with_highlights,
    delete: del,
    ...molOverrides,
  } as unknown as JSMol;
  const get_mol = vi.fn(() => mol);
  const rdkit = { get_mol } as unknown as RDKitModule;
  return { rdkit, mol, get_mol, del, set_new_coords, has_coords, get_svg_with_highlights };
}

describe("molToSvg", () => {
  it("renders SVG for a valid SMILES", () => {
    const { rdkit } = fakeRDKit();
    expect(molToSvg(rdkit, "CCO", OPTS)).toEqual({
      ok: true,
      svg: "<svg data-mol></svg>",
    });
  });

  it("rejects empty / whitespace input without touching RDKit", () => {
    const { rdkit, get_mol } = fakeRDKit();
    expect(molToSvg(rdkit, "   ", OPTS).ok).toBe(false);
    expect(get_mol).not.toHaveBeenCalled();
  });

  it("reports invalid input using a one-line preview", () => {
    const { rdkit } = fakeRDKit({ valid: false });
    expect(molToSvg(rdkit, "not-a-molecule", OPTS)).toEqual({
      ok: false,
      error: "invalid structure: not-a-molecule",
    });
  });

  it("treats a null get_mol result as invalid", () => {
    const get_mol = vi.fn(() => null);
    const rdkit = { get_mol } as unknown as RDKitModule;
    expect(molToSvg(rdkit, "X", OPTS).ok).toBe(false);
  });

  it("generates CoordGen coords when the input has none (SMILES)", () => {
    const { rdkit, set_new_coords } = fakeRDKit({ hasCoords: 0 });
    molToSvg(rdkit, "CCO", OPTS);
    expect(set_new_coords).toHaveBeenCalledWith(true);
  });

  it("preserves authored coords when the input already has them (molblock)", () => {
    const { rdkit, set_new_coords } = fakeRDKit({ hasCoords: 2 });
    molToSvg(rdkit, "…molblock…", OPTS);
    expect(set_new_coords).not.toHaveBeenCalled();
  });

  it("passes dimensions and stereo flag through the draw options", () => {
    const { rdkit, get_svg_with_highlights } = fakeRDKit();
    molToSvg(rdkit, "CCO", { width: 400, height: 250, addStereoAnnotation: false });
    const details = JSON.parse(get_svg_with_highlights.mock.calls[0][0]);
    expect(details).toMatchObject({ width: 400, height: 250, addStereoAnnotation: false });
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
    expect(molToSvg(rdkit, "CCO", OPTS)).toEqual({ ok: false, error: "draw failed" });
    expect(del).toHaveBeenCalledOnce();
  });

  it("strips the RDKit <?xml?> prolog from the SVG", () => {
    const { rdkit } = fakeRDKit({
      get_svg_with_highlights: () =>
        "<?xml version='1.0' encoding='iso-8859-1'?>\n<svg>real</svg>",
    });
    expect(molToSvg(rdkit, "CCO", OPTS)).toEqual({ ok: true, svg: "<svg>real</svg>" });
  });
});

describe("isReaction", () => {
  it("is true when the input contains a reaction arrow", () => {
    expect(isReaction("CCO>>CC=O")).toBe(true);
    expect(isReaction("A>B>C")).toBe(true);
  });
  it("is false for ordinary SMILES", () => {
    expect(isReaction("CC(=O)Oc1ccccc1C(=O)O")).toBe(false);
  });
});

describe("rxnToSvg", () => {
  function fakeRxnKit(overrides: { rxn?: unknown; svg?: string } = {}) {
    const del = vi.fn();
    const get_svg_with_highlights = vi.fn(
      (_d: string) => overrides.svg ?? "<svg data-rxn></svg>",
    );
    const rxn =
      overrides.rxn === undefined
        ? { get_svg_with_highlights, delete: del }
        : overrides.rxn;
    const get_rxn = vi.fn(() => rxn);
    const rdkit = { get_rxn } as unknown as RDKitModule;
    return { rdkit, del, get_rxn };
  }

  it("renders SVG for a valid reaction", () => {
    const { rdkit } = fakeRxnKit();
    expect(rxnToSvg(rdkit, "CCO>>CC=O", OPTS)).toEqual({
      ok: true,
      svg: "<svg data-rxn></svg>",
    });
  });

  it("reports an invalid reaction when get_rxn returns null", () => {
    const { rdkit } = fakeRxnKit({ rxn: null });
    expect(rxnToSvg(rdkit, "bad>>", OPTS).ok).toBe(false);
  });

  it("frees the reaction handle", () => {
    const { rdkit, del } = fakeRxnKit();
    rxnToSvg(rdkit, "CCO>>CC=O", OPTS);
    expect(del).toHaveBeenCalledOnce();
  });

  it("strips the xml prolog", () => {
    const { rdkit } = fakeRxnKit({
      svg: "<?xml version='1.0'?>\n<svg>r</svg>",
    });
    expect(rxnToSvg(rdkit, "CCO>>CC=O", OPTS)).toEqual({ ok: true, svg: "<svg>r</svg>" });
  });
});

describe("recolorForTheme", () => {
  it("rewrites black skeleton ink as a CSS variable", () => {
    expect(recolorForTheme("stroke:#000000;")).toBe(
      "stroke:var(--molren-ink, #1a1a1a);",
    );
  });

  it("rewrites O (red) and N (blue) as CSS variables", () => {
    expect(recolorForTheme("fill:#FF0000")).toBe("fill:var(--molren-o, #d93526)");
    expect(recolorForTheme("fill:#0000ff")).toBe("fill:var(--molren-n, #1f6feb)");
  });

  it("leaves the transparent #FFFFFF00 background untouched", () => {
    const bg = "fill:#FFFFFF00;stroke:none";
    expect(recolorForTheme(bg)).toBe(bg);
  });

  it("does not touch black inside an 8-digit hex color", () => {
    expect(recolorForTheme("#00000080")).toBe("#00000080");
  });
});

describe("detectFormat", () => {
  it("detects SMILES", () => {
    expect(detectFormat("CCO")).toBe("smiles");
    expect(detectFormat("CCO Ethanol\nc1ccccc1 Benzene")).toBe("smiles");
  });

  it("detects a molblock via 'M  END' or a version tag", () => {
    const mb = "Aspirin\n     RDKit          2D\n\n  1  0  0  0  0  0\nM  END";
    expect(detectFormat(mb)).toBe("molblock");
    expect(detectFormat("x\n\n\n  0  0  0 V3000\nM  END")).toBe("molblock");
  });

  it("detects SDF via the $$$$ record separator", () => {
    expect(detectFormat("Ethanol\n...\nM  END\n$$$$\nBenzene\n...\nM  END\n$$$$")).toBe("sdf");
  });
});

describe("parseInput — SMILES", () => {
  it("returns one spec per non-empty line", () => {
    expect(parseInput("CCO\nc1ccccc1\n", "smiles")).toEqual([
      { input: "CCO" },
      { input: "c1ccccc1" },
    ]);
  });

  it("captures a multi-word caption after the first whitespace", () => {
    expect(parseInput("CC(=O)O   acetic acid", "smiles")).toEqual([
      { input: "CC(=O)O", caption: "acetic acid" },
    ]);
  });

  it("skips blank lines and # comments", () => {
    expect(parseInput("# heading\n\nCCO first\n# note\nCCC second\n", "smiles")).toEqual([
      { input: "CCO", caption: "first" },
      { input: "CCC", caption: "second" },
    ]);
  });

  it("keeps a trailing CXSMILES |…| extension as part of the structure", () => {
    const cx = "*C(*)CC(*)* |$;;Pol_p;;;star_e$|";
    expect(parseInput(cx, "smiles")).toEqual([{ input: cx }]);
  });

  it("handles CRLF and trailing whitespace", () => {
    expect(parseInput("CCO  \r\nCCC\r\n", "smiles")).toEqual([
      { input: "CCO" },
      { input: "CCC" },
    ]);
  });
});

describe("parseInput — molblock", () => {
  it("returns one spec with the title line as caption", () => {
    const mb = "Aspirin\n  RDKit\n\n  1  0\nM  END\n";
    expect(parseInput(mb, "molblock")).toEqual([
      { input: "Aspirin\n  RDKit\n\n  1  0\nM  END", caption: "Aspirin" },
    ]);
  });

  it("omits the caption when the title line is blank", () => {
    const mb = "\n  RDKit\n\n  1  0\nM  END\n";
    const specs = parseInput(mb, "molblock");
    expect(specs).toHaveLength(1);
    expect(specs[0].caption).toBeUndefined();
  });
});

describe("parseInput — SDF", () => {
  it("splits records on $$$$ and uses each title as its caption", () => {
    const sdf = "Ethanol\n mb1\nM  END\n$$$$\nBenzene\n mb2\nM  END\n$$$$\n";
    expect(parseInput(sdf, "sdf")).toEqual([
      { input: "Ethanol\n mb1\nM  END", caption: "Ethanol" },
      { input: "Benzene\n mb2\nM  END", caption: "Benzene" },
    ]);
  });
});

describe("parseInput — reaction", () => {
  it("parses one reaction per line, like SMILES", () => {
    expect(parseInput("CCO>>CC=O one\nC>>N", "reaction")).toEqual([
      { input: "CCO>>CC=O", caption: "one" },
      { input: "C>>N" },
    ]);
  });
});

describe("parseInput — auto", () => {
  it("routes SMILES to line parsing and molblocks to whole-block parsing", () => {
    expect(parseInput("CCO\nCCC", "auto")).toHaveLength(2);
    const mb = "Aspirin\n  RDKit\n\n  1  0\nM  END\n";
    expect(parseInput(mb, "auto")).toEqual([
      { input: "Aspirin\n  RDKit\n\n  1  0\nM  END", caption: "Aspirin" },
    ]);
  });
});

describe("cacheKey", () => {
  const base: MolrenSettings = { width: 350, height: 300, addStereoAnnotation: true };

  it("varies by dimensions and normalizes whitespace", () => {
    expect(cacheKey(" CCO ", base)).toBe("350x300|s1|CCO");
    expect(cacheKey("CCO", { ...base, width: 100, height: 100 })).toBe("100x100|s1|CCO");
  });

  it("varies by the stereo-annotation flag", () => {
    expect(cacheKey("CCO", { ...base, addStereoAnnotation: false })).toBe("350x300|s0|CCO");
  });
});
