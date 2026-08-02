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

/** Bond stroke width passed to RDKit. Kept internal (not user-facing yet). */
const BOND_LINE_WIDTH = 1.2;

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
 * input+options, and mounts the result (or an inline error) into the block.
 */
export class MoleculeRenderer {
  private readonly cache = new Map<string, string>();

  constructor(private readonly loader: RDKitLoader) {}

  async render(
    source: string,
    el: HTMLElement,
    settings: MolrenSettings,
  ): Promise<void> {
    const smiles = source.trim();
    if (!smiles) {
      this.mountError(el, "empty SMILES block");
      return;
    }

    const key = cacheKey(smiles, settings);
    const cached = this.cache.get(key);
    if (cached) {
      this.mountSvg(el, cached);
      return;
    }

    let RDKit: RDKitModule;
    try {
      RDKit = await this.loader.load();
    } catch (err) {
      this.mountError(el, `failed to load RDKit — ${messageOf(err)}`);
      return;
    }

    const result = molToSvg(RDKit, smiles, {
      width: settings.width,
      height: settings.height,
      addStereoAnnotation: settings.addStereoAnnotation,
    });

    if (!result.ok) {
      this.mountError(el, result.error);
      return;
    }

    this.cache.set(key, result.svg);
    this.mountSvg(el, result.svg);
  }

  clearCache(): void {
    this.cache.clear();
  }

  private mountSvg(el: HTMLElement, svg: string): void {
    el.empty();
    const container = el.createDiv({ cls: "molren-container" });
    // Trusted content: SVG is generated locally by RDKit from the note's text.
    container.innerHTML = svg;
  }

  private mountError(el: HTMLElement, message: string): void {
    el.empty();
    const box = el.createDiv({ cls: "molren-error" });
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
