import { App, PluginSettingTab, Setting } from "obsidian";
import type MolrenPlugin from "./main";

export interface MolrenSettings {
  /** Rendered SVG width in pixels. */
  width: number;
  /** Rendered SVG height in pixels. */
  height: number;
  /** Draw R/S and E/Z labels on stereocenters and double bonds. */
  addStereoAnnotation: boolean;
}

export const DEFAULT_SETTINGS: MolrenSettings = {
  width: 350,
  height: 300,
  addStereoAnnotation: true,
};

const MIN_DIM = 100;
const MAX_DIM = 1200;

export class MolrenSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: MolrenPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Image width")
      .setDesc(
        `Width of rendered structures, in pixels (${MIN_DIM}–${MAX_DIM}).`,
      )
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.width))
          .onChange(async (value) => {
            this.plugin.settings.width = clampDim(
              value,
              DEFAULT_SETTINGS.width,
            );
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Image height")
      .setDesc(
        `Height of rendered structures, in pixels (${MIN_DIM}–${MAX_DIM}).`,
      )
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.height))
          .onChange(async (value) => {
            this.plugin.settings.height = clampDim(
              value,
              DEFAULT_SETTINGS.height,
            );
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Stereo annotations")
      .setDesc("Label stereocenters (R/S) and double-bond geometry (E/Z).")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.addStereoAnnotation)
          .onChange(async (value) => {
            this.plugin.settings.addStereoAnnotation = value;
            await this.plugin.saveSettings();
          }),
      );
  }
}

function clampDim(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(MAX_DIM, Math.max(MIN_DIM, n));
}
