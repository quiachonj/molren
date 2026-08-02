import type { RDKitModule } from "@rdkit/rdkit";
import type { RDKitWithRxn, JSReaction } from "./rdkit";

/** Successful render, or a human-readable reason it failed. */
export type RenderResult =
  { ok: true; svg: string } | { ok: false; error: string };

export interface RenderOptions {
  width: number;
  height: number;
  /** Draw R/S and E/Z labels on stereocenters and double bonds. */
  addStereoAnnotation: boolean;
}

/** Bond stroke width passed to RDKit. Kept internal (not user-facing yet). */
const BOND_LINE_WIDTH = 1.2;

/**
 * Pure structure → SVG conversion. Accepts SMILES or a molblock (RDKit's
 * get_mol handles both). Kept free of Obsidian and DOM so it can be unit-tested
 * against a mocked RDKit module. Owns the JSMol lifetime: every handle it
 * creates is delete()'d before returning.
 */
export function molToSvg(
  RDKit: RDKitModule,
  input: string,
  opts: RenderOptions,
): RenderResult {
  const text = input.trim();
  if (!text) {
    return { ok: false, error: "empty input" };
  }

  let mol: ReturnType<RDKitModule["get_mol"]> = null;
  try {
    mol = RDKit.get_mol(text);
    if (!mol || !mol.is_valid()) {
      return { ok: false, error: `invalid structure: ${preview(text)}` };
    }
    // Generate a CoordGen 2D layout only when the input carries none (SMILES).
    // Molblocks/SDF bring authored coordinates, which we must preserve.
    if (!mol.has_coords()) {
      mol.set_new_coords(true);
    }
    return {
      ok: true,
      svg: finishSvg(mol.get_svg_with_highlights(drawDetails(opts))),
    };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  } finally {
    mol?.delete();
  }
}

/**
 * Pure reaction SMILES → SVG conversion (reactants>>products, optionally with
 * agents). Owns the JSReaction lifetime. Mirrors molToSvg's contract.
 */
export function rxnToSvg(
  RDKit: RDKitModule,
  input: string,
  opts: RenderOptions,
): RenderResult {
  const text = input.trim();
  if (!text) {
    return { ok: false, error: "empty reaction" };
  }

  let rxn: JSReaction | null = null;
  try {
    rxn = (RDKit as RDKitWithRxn).get_rxn(text);
    if (!rxn) {
      return { ok: false, error: `invalid reaction: ${preview(text)}` };
    }
    return {
      ok: true,
      svg: finishSvg(rxn.get_svg_with_highlights(drawDetails(opts))),
    };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  } finally {
    rxn?.delete();
  }
}

/** Serializes RDKit MolDrawOptions. Unknown keys are ignored by RDKit. */
function drawDetails(opts: RenderOptions): string {
  return JSON.stringify({
    width: opts.width,
    height: opts.height,
    bondLineWidth: BOND_LINE_WIDTH,
    addStereoAnnotation: opts.addStereoAnnotation,
    // Transparent: the ".molren-container" CSS card supplies the surface, so
    // rounded corners stay clean and the depiction reads in light and dark.
    backgroundColour: [1, 1, 1, 0],
    // Omit rdkit: namespaced metadata so the SVG parses cleanly as image/svg+xml.
    includeMetadata: false,
    padding: 0.08,
  });
}

/** Post-process RDKit's raw SVG: drop the xml prolog, then theme its colors. */
function finishSvg(raw: string): string {
  return recolorForTheme(stripXmlProlog(raw));
}

/**
 * RDKit prefixes its SVG with an `<?xml … ?>` declaration; strip it so the
 * remaining root element is a bare `<svg>` for the DOM/XML parser.
 */
function stripXmlProlog(svg: string): string {
  return svg.replace(/^\s*<\?xml[^>]*\?>\s*/i, "");
}

/**
 * Rewrites RDKit's hardcoded skeleton/heteroatom colors as CSS custom
 * properties. RDKit emits colors inside inline `style='…'`, so `var()` resolves
 * against the properties defined on `.molren-container` in styles.css. This lets
 * one cached, theme-independent SVG adapt live to light/dark — no re-render.
 * The `(?![0-9A-Fa-f]{2})` guard avoids matching inside 8-digit hex like the
 * transparent `#FFFFFF00` background.
 */
export function recolorForTheme(svg: string): string {
  return svg
    .replace(/#000000(?![0-9A-Fa-f]{2})/gi, "var(--molren-ink, #1a1a1a)")
    .replace(/#0000FF(?![0-9A-Fa-f]{2})/gi, "var(--molren-n, #1f6feb)")
    .replace(/#FF0000(?![0-9A-Fa-f]{2})/gi, "var(--molren-o, #d93526)");
}

/** Short one-line preview of an input for error messages. */
function preview(text: string): string {
  const first = text.split(/\r?\n/, 1)[0]?.trim() ?? "";
  return first.length > 60 ? `${first.slice(0, 57)}…` : first;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
