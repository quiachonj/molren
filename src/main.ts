import { Plugin } from "obsidian";
import {
  DEFAULT_SETTINGS,
  MolrenSettings,
  MolrenSettingTab,
} from "./settings";
import { RDKitLoader } from "./rdkit";
import { MoleculeRenderer, type InputFormat } from "./renderer";

export default class MolrenPlugin extends Plugin {
  settings!: MolrenSettings;
  private loader!: RDKitLoader;
  private renderer!: MoleculeRenderer;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.loader = new RDKitLoader(this.app, this.manifest);
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
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
