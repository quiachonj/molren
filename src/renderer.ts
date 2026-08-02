import type { RDKitModule } from "@rdkit/rdkit";
import type { RDKitLoader } from "./rdkit";
import type { MolrenSettings } from "./settings";
import {
  type InputFormat,
  type MoleculeSpec,
  isReaction,
  parseInput,
  resolveFormat,
} from "./parse";
import { molToSvg, rxnToSvg } from "./svg";

/** Reactions span reactants → products, so they get a wider canvas. */
const REACTION_WIDTH_FACTOR = 2;

/** Upper bound on cached SVGs, so a large vault can't grow the cache forever. */
const MAX_CACHE_ENTRIES = 512;

/**
 * Bridges the pure renderers to Obsidian: loads RDKit, caches SVG by
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

    // Resolve the format up front: reactions are only possible in the
    // line-based (SMILES/reaction) paths, never inside a molblock/SDF.
    const fmt = resolveFormat(source, format);
    const lineBased = fmt === "smiles" || fmt === "reaction";

    const specs = parseInput(source, fmt);
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

    const isRxn = (spec: MoleculeSpec) => lineBased && isReaction(spec.input);
    const hasReaction = specs.some(isRxn);
    const root = this.createRoot(el, specs.length, hasReaction, settings);

    for (const spec of specs) {
      const cell = root.createDiv({ cls: "molren-cell" });
      this.renderInto(cell, RDKit, spec, settings, isRxn(spec));
    }
  }

  /** Chooses the layout: stacked rows for reactions, else a grid or single card. */
  private createRoot(
    el: HTMLElement,
    count: number,
    hasReaction: boolean,
    settings: MolrenSettings,
  ): HTMLElement {
    // Reactions are wide, so any block containing one stacks full-width rows
    // instead of using the molecule grid.
    if (hasReaction) return el.createDiv({ cls: "molren-stack" });
    if (count === 1) return el.createDiv({ cls: "molren-single" });

    const grid = el.createDiv({ cls: "molren-grid" });
    // Column width is dynamic (from settings), so pass it as a CSS variable
    // rather than an inline grid-template rule; styles.css consumes it.
    grid.style.setProperty("--molren-col-width", `${settings.width}px`);
    return grid;
  }

  private renderInto(
    cell: HTMLElement,
    RDKit: RDKitModule,
    spec: MoleculeSpec,
    settings: MolrenSettings,
    reaction: boolean,
  ): void {
    const key = cacheKey(spec.input, settings);
    let svg = this.cacheGet(key);
    if (svg === undefined) {
      const result = reaction
        ? rxnToSvg(RDKit, spec.input, {
            width: settings.width * REACTION_WIDTH_FACTOR,
            height: settings.height,
            addStereoAnnotation: settings.addStereoAnnotation,
          })
        : molToSvg(RDKit, spec.input, {
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
      this.cacheSet(key, svg);
    }

    const container = cell.createDiv({ cls: "molren-container" });
    this.mountSvg(container, svg);
    if (spec.caption) this.mountCaption(cell, spec.caption);
  }

  clearCache(): void {
    this.cache.clear();
  }

  /** LRU read: bump the key's recency on a hit. */
  private cacheGet(key: string): string | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  /** LRU write: evict the least-recently-used entry past the cap. */
  private cacheSet(key: string, value: string): void {
    this.cache.set(key, value);
    if (this.cache.size > MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
  }

  /**
   * Parses the trusted, locally-generated SVG string into DOM nodes and appends
   * them — avoids innerHTML per Obsidian's guidelines. On a parse failure it
   * shows an inline error instead of injecting anything.
   */
  private mountSvg(container: HTMLElement, svg: string): void {
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    const root = doc.documentElement;
    if (
      doc.querySelector("parsererror") ||
      root.tagName.toLowerCase() !== "svg"
    ) {
      this.mountError(container, "could not render structure");
      return;
    }
    container.appendChild(container.ownerDocument.importNode(root, true));
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

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
