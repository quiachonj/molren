// esbuild's "base64" loader turns an imported file into a base64 string embedded
// in the bundle. We decode it ourselves (portable atob) to inline RDKit's wasm
// into main.js without depending on a bleeding-edge decode API.
declare module "*.wasm" {
  const base64: string;
  export default base64;
}
