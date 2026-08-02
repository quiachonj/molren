/**
 * Minimal stand-in for the `obsidian` module during unit tests. The real module
 * is only available inside the Obsidian runtime, so we declare just the exports
 * our code imports. Extend as tests need more of the API.
 */

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}

export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class App {}
export interface PluginManifest {
  id: string;
  dir?: string;
}
