import { MarkdownView, Plugin } from "obsidian";
import { MolrenSettings, MolrenSettingTab, sanitizeSettings } from "./settings";
import { RDKitLoader } from "./rdkit";
import { MoleculeRenderer } from "./renderer";
import type { InputFormat } from "./parse";

export default class MolrenPlugin extends Plugin {
  settings!: MolrenSettings;
  private loader!: RDKitLoader;
  private renderer!: MoleculeRenderer;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.loader = new RDKitLoader();
    this.renderer = new MoleculeRenderer(this.loader);

    this.addSettingTab(new MolrenSettingTab(this.app, this));

    // Fenced code blocks → 2D structures. Dedicated fences state their format
    // (and so how coordinates are handled); `chem` auto-detects.
    const fences: Record<string, InputFormat> = {
      smiles: "smiles",
      mol: "molblock",
      sdf: "sdf",
      rxn: "reaction",
      chem: "auto",
    };
    for (const [lang, format] of Object.entries(fences)) {
      this.registerMarkdownCodeBlockProcessor(lang, async (source, el) => {
        await this.renderer.render(source, el, this.settings, format);
      });
    }
  }

  onunload(): void {
    this.renderer?.clearCache();
  }

  async loadSettings(): Promise<void> {
    this.settings = sanitizeSettings(await this.loadData());
  }

  /** Persists settings, then refreshes open notes so they reflect the change. */
  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.rerenderOpenNotes();
  }

  /**
   * Reading view: `MarkdownPreviewView.rerender(true)` re-runs the code block
   * processors. Live Preview widgets aren't covered by that, so
   * `Workspace.updateOptions()` is also called to reconfigure the editors.
   * The SVG cache key already includes width, height and stereo flag, so
   * changed settings can never hit a stale entry.
   */
  private rerenderOpenNotes(): void {
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView)
        leaf.view.previewMode.rerender(true);
    });
    this.app.workspace.updateOptions();
  }
}
