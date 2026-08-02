import type { RDKitModule } from "@rdkit/rdkit";
// The RDKit wasm is inlined into the bundle as a *gzipped* base64 string by the
// esbuild plugin (see esbuild.config.mjs). At load we base64-decode then gunzip
// it — keeping main.js ~3 MB instead of ~9.4 MB.
import rdkitWasmGzipBase64 from "@rdkit/rdkit/dist/RDKit_minimal.wasm";

/** Decode a base64 string to bytes using the platform's atob (Electron/Node). */
function decodeBase64(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Gunzip bytes via DecompressionStream (a web standard available in Electron). */
async function gunzip(
  gzipped: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([gzipped])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * The shipped @rdkit/rdkit type definitions omit the reaction API, so we declare
 * the small surface Molren uses. A JSReaction handle MUST be delete()'d.
 */
export interface JSReaction {
  get_svg_with_highlights(details: string): string;
  delete(): void;
}

/** RDKitModule augmented with the (untyped) reaction entry point. */
export interface RDKitWithRxn extends RDKitModule {
  get_rxn(input: string, details?: string): JSReaction | null;
}

/**
 * The shipped @rdkit/rdkit type definitions declare only interfaces and a
 * `Window.initRDKitModule` global — not the CommonJS default export that the JS
 * glue actually provides, and their loader options omit emscripten's
 * `wasmBinary`. So we pull the loader in ourselves with an accurate signature.
 */
type RDKitInit = (options?: {
  locateFile?: () => string;
  /** Pre-fetched wasm bytes; when set, emscripten skips its own fetch. */
  wasmBinary?: ArrayBuffer | Uint8Array;
}) => Promise<RDKitModule>;

// eslint-disable-next-line @typescript-eslint/no-require-imports -- @rdkit/rdkit ships CJS with no typed default export; require() yields the loader fn
const initRDKitModule = require("@rdkit/rdkit") as RDKitInit;

/**
 * Lazily initializes RDKit's wasm module exactly once.
 *
 * The ~7 MB `RDKit_minimal.wasm` is inlined into `main.js` and handed to
 * emscripten via `wasmBinary`. This is required for community-store and BRAT
 * installs, which only download `main.js`/`manifest.json`/`styles.css` — not
 * extra release assets — so the wasm cannot be shipped as a separate file.
 */
export class RDKitLoader {
  private modulePromise: Promise<RDKitModule> | null = null;

  /** Returns the initialized RDKit module, initializing on first call. */
  load(): Promise<RDKitModule> {
    if (!this.modulePromise) {
      this.modulePromise = this.init().catch((err: unknown) => {
        // Reset so a later render can retry instead of caching the failure.
        this.modulePromise = null;
        throw err;
      });
    }
    return this.modulePromise;
  }

  private async init(): Promise<RDKitModule> {
    const wasmBinary = await gunzip(decodeBase64(rdkitWasmGzipBase64));
    return initRDKitModule({ wasmBinary });
  }
}
