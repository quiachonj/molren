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

/** One entry in a block: molecule text (SMILES or molblock) + optional caption. */
export interface MoleculeSpec {
  input: string;
  caption?: string;
}

/** How a code block's contents should be parsed. */
export type InputFormat = "smiles" | "molblock" | "sdf" | "auto";

/** Bond stroke width passed to RDKit. Kept internal (not user-facing yet). */
const BOND_LINE_WIDTH = 1.2;

/**
 * Sniffs the format of a block's contents for the auto-detecting `chem` fence.
 * SDF wins (it contains molblocks + `$$$$`); a lone `M  END` / `V2000|V3000`
 * marks a molblock; everything else is treated as SMILES.
 */
export function detectFormat(source: string): "smiles" | "molblock" | "sdf" {
  if (/\$\$\$\$/.test(source)) return "sdf";
  if (/^M {2}END\s*$/m.test(source) || /\bV[23]000\b/.test(source)) {
    return "molblock";
  }
  return "smiles";
}

/** Parses a block's contents into one spec per structure. */
export function parseInput(source: string, format: InputFormat): MoleculeSpec[] {
  const fmt = format === "auto" ? detectFormat(source) : format;
  switch (fmt) {
    case "sdf":
      return parseSdf(source);
    case "molblock":
      return parseMolblock(source);
    case "smiles":
    default:
      return parseSmilesLines(source);
  }
}

/** One SMILES per non-empty, non-comment line; caption after first whitespace. */
function parseSmilesLines(source: string): MoleculeSpec[] {
  const specs: MoleculeSpec[] = [];
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const gap = line.search(/\s/);
    if (gap === -1) {
      specs.push({ input: line });
      continue;
    }
    const rest = line.slice(gap + 1).trim();
    // A trailing `|…|` block is a CXSMILES extension, not a caption — the whole
    // line (including the space) is the structure and must be passed to RDKit.
    if (rest.startsWith("|") && rest.endsWith("|")) {
      specs.push({ input: line });
    } else {
      specs.push({
        input: line.slice(0, gap),
        caption: rest.length > 0 ? rest : undefined,
      });
    }
  }
  return specs;
}

/** A single molblock. The molfile title line (line 1) becomes the caption. */
function parseMolblock(source: string): MoleculeSpec[] {
  const input = source.replace(/\s+$/, "");
  if (input.trim().length === 0) return [];
  return [{ input, caption: titleLine(input) }];
}

/** Splits an SDF on `$$$$` into one spec per record; title line → caption. */
function parseSdf(source: string): MoleculeSpec[] {
  const specs: MoleculeSpec[] = [];
  for (const chunk of source.split("$$$$")) {
    // Drop the single leading newline left over from the `$$$$\n` separator,
    // but preserve the rest so the molblock's line structure stays intact.
    const record = chunk.replace(/^\r?\n/, "").replace(/\s+$/, "");
    if (record.trim().length === 0) continue;
    specs.push({ input: record, caption: titleLine(record) });
  }
  return specs;
}

/** The molfile title line (line 1), or undefined if blank. */
function titleLine(molblock: string): string | undefined {
  const first = molblock.split(/\r?\n/, 1)[0]?.trim();
  return first && first.length > 0 ? first : undefined;
}

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
    format: InputFormat,
  ): Promise<void> {
    el.empty();

    const specs = parseInput(source, format);
    if (specs.length === 0) {
      this.mountError(el, "empty block");
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
    const key = cacheKey(spec.input, settings);
    let svg = this.cache.get(key);
    if (svg === undefined) {
      const result = molToSvg(RDKit, spec.input, {
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

export function cacheKey(input: string, settings: MolrenSettings): string {
  const stereo = settings.addStereoAnnotation ? "s1" : "s0";
  return `${settings.width}x${settings.height}|${stereo}|${input.trim()}`;
}

/** Short one-line preview of an input for error messages. */
function preview(text: string): string {
  const first = text.split(/\r?\n/, 1)[0]?.trim() ?? "";
  return first.length > 60 ? `${first.slice(0, 57)}…` : first;
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
