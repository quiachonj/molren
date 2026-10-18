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

/** Parses typed text to an int clamped to [MIN_DIM, MAX_DIM]; else `fallback`. */
export function clampDim(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(MAX_DIM, Math.max(MIN_DIM, n));
}

/** A stored dimension: must be a finite number; clamped and rounded. */
function sanitizeDim(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_DIM, Math.max(MIN_DIM, Math.round(value)));
}

/**
 * Builds valid settings from untrusted persisted data (data.json). Any field
 * with the wrong type or a non-finite number falls back to its default;
 * dimensions are clamped to the same range as the settings tab.
 */
export function sanitizeSettings(raw: unknown): MolrenSettings {
  const src: Record<string, unknown> =
    typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    width: sanitizeDim(src.width, DEFAULT_SETTINGS.width),
    height: sanitizeDim(src.height, DEFAULT_SETTINGS.height),
    addStereoAnnotation:
      typeof src.addStereoAnnotation === "boolean"
        ? src.addStereoAnnotation
        : DEFAULT_SETTINGS.addStereoAnnotation,
  };
}

export class MolrenSettingTab extends PluginSettingTab {
  private pendingCommits: Array<() => Promise<void>> = [];

  constructor(
    app: App,
    private readonly plugin: MolrenPlugin,
  ) {
    super(app, plugin);
  }

  /**
   * Numeric text field that commits on the input's `change` event (blur or
   * Enter), not per keystroke: intermediate values like "3" and "35" while
   * typing "350" are never clamped or saved. The clamped result is written back
   * into the field. `hide()` flushes a still-focused edit.
   */
  private addDimSetting(
    containerEl: HTMLElement,
    name: string,
    desc: string,
    key: "width" | "height",
  ): void {
    new Setting(containerEl)
      .setName(name)
      .setDesc(`${desc}, in pixels (${MIN_DIM}–${MAX_DIM}).`)
      .addText((text) => {
        text.setValue(String(this.plugin.settings[key]));
        const commit = async () => {
          const next = clampDim(text.inputEl.value, DEFAULT_SETTINGS[key]);
          text.setValue(String(next));
          if (next === this.plugin.settings[key]) return;
          this.plugin.settings[key] = next;
          await this.plugin.saveSettings();
        };
        text.inputEl.addEventListener("change", () => void commit());
        this.pendingCommits.push(commit);
      });
  }

  /** Commits any edit whose input hasn't fired `change` yet. */
  hide(): void {
    const commits = this.pendingCommits;
    this.pendingCommits = [];
    for (const commit of commits) void commit();
  }

  display(): void {
    this.pendingCommits = [];
    const { containerEl } = this;
    containerEl.empty();

    this.addDimSetting(
      containerEl,
      "Image width",
      "Width of rendered structures",
      "width",
    );
    this.addDimSetting(
      containerEl,
      "Image height",
      "Height of rendered structures",
      "height",
    );

    new Setting(containerEl)
      .setName("Stereo annotations")
      .setDesc("Label stereocenters (R/S) and double-bond geometry (E/Z).")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.addStereoAnnotation)
          .onChange(async (value) => {
            // Toggles commit immediately: one click is one complete edit.
            this.plugin.settings.addStereoAnnotation = value;
            await this.plugin.saveSettings();
          }),
      );
  }
}
