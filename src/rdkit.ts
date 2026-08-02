import { App, PluginManifest, normalizePath } from "obsidian";
import type { RDKitModule } from "@rdkit/rdkit";

/**
 * The shipped @rdkit/rdkit type definitions declare only interfaces and a
 * `Window.initRDKitModule` global — not the CommonJS default export that the JS
 * glue actually provides, and their loader options omit emscripten's
 * `wasmBinary`. So we pull the loader in ourselves with an accurate signature.
 */
type RDKitInit = (options?: {
  locateFile?: () => string;
  /** Pre-fetched wasm bytes; when set, emscripten skips its own fetch. */
  wasmBinary?: ArrayBuffer;
}) => Promise<RDKitModule>;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const initRDKitModule = require("@rdkit/rdkit") as RDKitInit;

/**
 * Lazily initializes RDKit's wasm module exactly once.
 *
 * Strategy (see technical discovery): the ~7 MB `RDKit_minimal.wasm` is shipped
 * alongside the plugin. Rather than let emscripten fetch it — file:// / app://
 * fetches are unreliable in the Obsidian/Electron sandbox — we read the bytes
 * through the vault adapter and hand them to initRDKitModule via `wasmBinary`.
 */
export class RDKitLoader {
  private modulePromise: Promise<RDKitModule> | null = null;

  constructor(
    private readonly app: App,
    private readonly manifest: PluginManifest,
  ) {}

  /** Returns the initialized RDKit module, initializing on first call. */
  load(): Promise<RDKitModule> {
    if (!this.modulePromise) {
      this.modulePromise = this.init().catch((err) => {
        // Reset so a later render can retry instead of caching the failure.
        this.modulePromise = null;
        throw err;
      });
    }
    return this.modulePromise;
  }

  private async init(): Promise<RDKitModule> {
    const wasmBinary = await this.readWasm();
    return initRDKitModule({ wasmBinary });
  }

  private async readWasm(): Promise<ArrayBuffer> {
    const dir = this.manifest.dir;
    if (!dir) {
      throw new Error("could not resolve the plugin directory");
    }
    const wasmPath = normalizePath(`${dir}/RDKit_minimal.wasm`);
    if (!(await this.app.vault.adapter.exists(wasmPath))) {
      throw new Error(`RDKit_minimal.wasm not found at ${wasmPath}`);
    }
    return this.app.vault.adapter.readBinary(wasmPath);
  }
}
