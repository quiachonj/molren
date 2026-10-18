// The `gzip-rdkit-wasm` plugin in esbuild.config.mjs loads an imported .wasm as
// text: the file gzipped and then base64-encoded. rdkit.ts decodes it itself
// (atob, then DecompressionStream) to inline RDKit's wasm into main.js without
// depending on a bleeding-edge decode API.
declare module "*.wasm" {
  const base64: string;
  export default base64;
}
