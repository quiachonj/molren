import esbuild from "esbuild";
import process from "process";
import fs from "fs";
import path from "path";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";

const banner = `/*
Molren — Obsidian plugin. This is a generated file. Do not edit.
Source: https://github.com/quiachonj/molren
*/`;

/**
 * RDKit ships an emscripten .wasm blob separately from its JS glue. We bundle
 * the glue into main.js (below) but must ship the .wasm alongside the plugin so
 * it can be read at runtime and passed to initRDKitModule({ wasmBinary }).
 */
function copyWasm() {
  const src = path.resolve("node_modules/@rdkit/rdkit/dist/RDKit_minimal.wasm");
  const dest = path.resolve("RDKit_minimal.wasm");
  if (!fs.existsSync(src)) {
    throw new Error(`Could not find RDKit wasm at ${src}. Run "npm install" first.`);
  }
  fs.copyFileSync(src, dest);
  console.log(`Copied RDKit_minimal.wasm (${(fs.statSync(dest).size / 1e6).toFixed(1)} MB)`);
}

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2020",
  platform: "browser",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  banner: { js: banner },
});

copyWasm();

if (prod) {
  await context.rebuild();
  await context.dispose();
  process.exit(0);
} else {
  await context.watch();
  console.log("Watching for changes…");
}
