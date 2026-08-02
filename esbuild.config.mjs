import esbuild from "esbuild";
import process from "process";
import fs from "fs";
import zlib from "zlib";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";

const banner = `/*
Molren — Obsidian plugin. This is a generated file. Do not edit.
Source: https://github.com/quiachonj/molren
*/`;

/**
 * Inline RDKit's wasm — but gzipped — as a base64 string in main.js. Raw base64
 * of the ~7 MB wasm would bloat main.js to ~9.4 MB; gzip brings it to ~3 MB.
 * rdkit.ts decompresses it at load with DecompressionStream. Inlining (vs a
 * separate file) is required because community-store/BRAT installs only fetch
 * main.js/manifest.json/styles.css.
 */
const gzipRdkitWasm = {
  name: "gzip-rdkit-wasm",
  setup(build) {
    build.onLoad({ filter: /RDKit_minimal\.wasm$/ }, async (args) => {
      const raw = await fs.promises.readFile(args.path);
      const gz = zlib.gzipSync(raw, { level: 9 });
      return { contents: gz.toString("base64"), loader: "text" };
    });
  },
};

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
  plugins: [gzipRdkitWasm],
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
