import type { RDKitModule } from "@rdkit/rdkit";
import type { RDKitLoader } from "./rdkit";
import type { MolrenSettings } from "./settings";

/** Successful render, or a human-readable reason it failed. */
export type RenderResult =
  | { ok: true; svg: string }
  | { ok: false; error: string };

export interface RenderOptions {
  width: number;
  height: number;
  /** Draw R/S and E/Z labels on stereocenters and double bonds. */
  addStereoAnnotation: boolean;
}

/** One entry in a block: a SMILES string with an optional caption. */
export interface MoleculeSpec {
  smiles: string;
  caption?: string;
}

/** Bond stroke width passed to RDKit. Kept internal (not user-facing yet). */
const BOND_LINE_WIDTH = 1.2;

/**
 * Parses a `smiles` block into one spec per non-empty, non-comment line. The
 * first whitespace-delimited token is the SMILES; anything after it is a
 * caption. Lines starting with `#` are treated as comments.
 */
export function parseBlock(source: string): MoleculeSpec[] {
  const specs: MoleculeSpec[] = [];
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const gap = line.search(/\s/);
    if (gap === -1) {
      specs.push({ smiles: line });
      continue;
    }
    const rest = line.slice(gap + 1).trim();
    // A trailing `|…|` block is a CXSMILES extension, not a caption — the whole
    // line (including the space) is the structure and must be passed to RDKit.
    if (rest.startsWith("|") && rest.endsWith("|")) {
      specs.push({ smiles: line });
    } else {
      specs.push({
        smiles: line.slice(0, gap),
        caption: rest.length > 0 ? rest : undefined,
      });
    }
  }
  return specs;
}

/**
 * Pure SMILES → SVG conversion. Kept free of Obsidian and DOM so it can be
 * unit-tested against a mocked RDKit module. Owns the JSMol lifetime: every
 * handle it creates is delete()'d before returning.
 */
export function molToSvg(
  RDKit: RDKitModule,
  smiles: string,
  opts: RenderOptions,
): RenderResult {
  const input = smiles.trim();
  if (!input) {
    return { ok: false, error: "empty SMILES" };
  }

  let mol: ReturnType<RDKitModule["get_mol"]> = null;
  try {
    mol = RDKit.get_mol(input);
    if (!mol || !mol.is_valid()) {
      return { ok: false, error: `invalid SMILES: ${input}` };
    }
    // SMILES carry no coordinates; generate a fresh CoordGen 2D layout.
    // (When molblock/SDF input lands, guard this so authored coords survive.)
    mol.set_new_coords(true);
    const svg = stripXmlProlog(mol.get_svg_with_highlights(drawDetails(opts)));
    return { ok: true, svg };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  } finally {
    mol?.delete();
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
    padding: 0.08,
  });
}

/**
 * Bridges the pure renderer to Obsidian: loads RDKit, caches SVG by
 * input+options, and mounts a single structure or a responsive grid of them
 * (each with an optional caption and per-cell error handling).
 */
export class MoleculeRenderer {
  private readonly cache = new Map<string, string>();

  constructor(private readonly loader: RDKitLoader) {}

  async render(
    source: string,
    el: HTMLElement,
    settings: MolrenSettings,
  ): Promise<void> {
    el.empty();

    const specs = parseBlock(source);
    if (specs.length === 0) {
      this.mountError(el, "empty SMILES block");
      return;
    }

    let RDKit: RDKitModule;
    try {
      RDKit = await this.loader.load();
    } catch (err) {
      this.mountError(el, `failed to load RDKit — ${messageOf(err)}`);
      return;
    }

    const multiple = specs.length > 1;
    const root = el.createDiv({
      cls: multiple ? "molren-grid" : "molren-single",
    });
    if (multiple) {
      // Responsive: columns fit as many cards of the chosen width as possible.
      root.style.gridTemplateColumns = `repeat(auto-fill, minmax(${settings.width}px, 1fr))`;
    }

    for (const spec of specs) {
      const cell = root.createDiv({ cls: "molren-cell" });
      this.renderInto(cell, RDKit, spec, settings);
    }
  }

  private renderInto(
    cell: HTMLElement,
    RDKit: RDKitModule,
    spec: MoleculeSpec,
    settings: MolrenSettings,
  ): void {
    const key = cacheKey(spec.smiles, settings);
    let svg = this.cache.get(key);
    if (svg === undefined) {
      const result = molToSvg(RDKit, spec.smiles, {
        width: settings.width,
        height: settings.height,
        addStereoAnnotation: settings.addStereoAnnotation,
      });
      if (!result.ok) {
        this.mountError(cell, result.error);
        if (spec.caption) this.mountCaption(cell, spec.caption);
        return;
      }
      svg = result.svg;
      this.cache.set(key, svg);
    }

    const container = cell.createDiv({ cls: "molren-container" });
    // Trusted content: SVG is generated locally by RDKit from the note's text.
    container.innerHTML = svg;
    if (spec.caption) this.mountCaption(cell, spec.caption);
  }

  clearCache(): void {
    this.cache.clear();
  }

  private mountCaption(parent: HTMLElement, text: string): void {
    parent.createDiv({ cls: "molren-caption", text });
  }

  private mountError(parent: HTMLElement, message: string): void {
    const box = parent.createDiv({ cls: "molren-error" });
    box.createSpan({ cls: "molren-error-icon", text: "⚠" });
    box.createSpan({ text: ` Molren: ${message}` });
  }
}

export function cacheKey(smiles: string, settings: MolrenSettings): string {
  const stereo = settings.addStereoAnnotation ? "s1" : "s0";
  return `${settings.width}x${settings.height}|${stereo}|${smiles.trim()}`;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * RDKit prefixes its SVG with an `<?xml … ?>` declaration. When assigned via
 * innerHTML the HTML parser turns that into a stray comment node, so strip it.
 */
function stripXmlProlog(svg: string): string {
  return svg.replace(/^\s*<\?xml[^>]*\?>\s*/i, "");
}
