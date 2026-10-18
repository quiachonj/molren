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
    // Keep authored coordinates only when they are genuinely 2D. At runtime
    // has_coords() returns a number (0 = none, 2 = 2D, 3 = 3D) although the
    // shipped typings say boolean. SMILES (0) and 3D molfiles (3) get a fresh
    // CoordGen layout; drawing 3D input as-is just projects x/y and can overlap
    // atoms or fold bonds onto each other.
    if (Number(mol.has_coords()) !== 2) {
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

/** Max reaction bond length as a fraction of canvas height (300px → 50px). */
const RXN_BOND_LENGTH_RATIO = 1 / 6;

/** get_rxn options: parse the input as reaction SMILES, not SMARTS. */
const RXN_PARSE_DETAILS = JSON.stringify({ useSmiles: true });

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
    // get_rxn parses reaction SMARTS by default, which turns every bond into a
    // "single or aromatic" query bond drawn gray and dashed. We take reaction
    // SMILES, so say so.
    rxn = (RDKit as RDKitWithRxn).get_rxn(text, RXN_PARSE_DETAILS);
    if (!rxn) {
      return { ok: false, error: `invalid reaction: ${preview(text)}` };
    }
    return {
      ok: true,
      svg: finishSvg(
        rxn.get_svg_with_highlights(
          // RDKit scales each agent to fill the space above the arrow, so a
          // single-atom agent like [H+] was drawn ~3x larger than the other
          // labels and overlapped the arrow. Capping the bond length (it still
          // shrinks to fit large reactions) keeps agents label-sized.
          drawDetails(opts, {
            fixedBondLength: Math.round(opts.height * RXN_BOND_LENGTH_RATIO),
          }),
        ),
      ),
    };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  } finally {
    rxn?.delete();
  }
}

/** Serializes RDKit MolDrawOptions. Unknown keys are ignored by RDKit. */
function drawDetails(
  opts: RenderOptions,
  extra: Record<string, unknown> = {},
): string {
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
    ...extra,
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

/** Below this per-channel value a grayscale color counts as structural "ink". */
const INK_MAX_CHANNEL = 0x40;

/**
 * Rewrites RDKit's hardcoded colors as CSS custom properties. RDKit emits colors
 * inside inline `style='…'`, so `var()` resolves against the properties defined
 * on `.molren-container` in styles.css — one cached, theme-independent SVG then
 * adapts live to light/dark with no re-render.
 *
 * Oxygen (red) and nitrogen (blue) map to dedicated variables. Everything that
 * is dark and (near-)grayscale — bonds, carbons, dummy atoms (#191919), and
 * annotations — is treated as ink; other saturated colors (e.g. CPK sulfur) are
 * left as RDKit drew them. The `(?![0-9A-Fa-f]{2})` guard avoids matching the
 * first six digits of an 8-digit hex such as the transparent `#FFFFFF00` back-
 * ground.
 */
export function recolorForTheme(svg: string): string {
  return svg.replace(/#[0-9A-Fa-f]{6}(?![0-9A-Fa-f]{2})/g, (hex) => {
    const value = hex.toUpperCase();
    if (value === "#FF0000") return "var(--molren-o, #d93526)";
    if (value === "#0000FF") return "var(--molren-n, #1f6feb)";
    const r = parseInt(value.slice(1, 3), 16);
    const g = parseInt(value.slice(3, 5), 16);
    const b = parseInt(value.slice(5, 7), 16);
    if (r === g && g === b && r <= INK_MAX_CHANNEL) {
      return "var(--molren-ink, #1a1a1a)";
    }
    return hex;
  });
}

/** Short one-line preview of an input for error messages. */
function preview(text: string): string {
  const first = text.split(/\r?\n/, 1)[0]?.trim() ?? "";
  return first.length > 60 ? `${first.slice(0, 57)}…` : first;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
