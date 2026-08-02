import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";

const banner = `/*
Molren — Obsidian plugin. This is a generated file. Do not edit.
Source: https://github.com/quiachonj/molren
*/`;

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
  // Inline RDKit's wasm as a base64 string embedded in main.js (decoded at load
  // via atob). Required because community-store/BRAT installs only fetch
  // main.js/manifest.json/styles.css, not extra release assets.
  loader: { ".wasm": "base64" },
  banner: { js: banner },
});

if (prod) {
  await context.rebuild();
  await context.dispose();
  process.exit(0);
} else {
  await context.watch();
  console.log("Watching for changes…");
}
