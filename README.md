# Molren

Render 2D chemical structures and reactions from SMILES (and molfiles) directly in your Obsidian notes, powered by [RDKit.js](https://www.rdkit.org/).

Write a fenced block and Molren draws the structure inline:

````markdown
```smiles
OC1=CC=C(CC2N(CCC3=CC(OC)=C(C(OC4=CC5=C(C=C4OC)CCN(C)C5C6)=C23)OC)C)C=C1OC7=CC=C6C=C7
```
````

## Features

- **SMILES → 2D structure**, rendered as crisp SVG with CoordGen layouts.
- **Theme-aware colors** — skeleton and heteroatoms adapt to light/dark live, no re-render.
- **Multiple formats** — SMILES, molfile/molblock, SDF, and reactions, plus an auto-detecting fence.
- **Grids** — one structure per line renders a responsive grid, with optional captions.
- **Stereo annotations** — R/S and E/Z labels (toggleable).
- **Local & offline** — RDKit runs entirely in WebAssembly; nothing leaves your vault.
- **Inline errors** — invalid input shows a readable message instead of a blank box.
- **Render caching** — each unique structure is drawn once and reused (bounded LRU).

## Fences

| Fence    | Input                            | Coordinates | Layout            |
| -------- | -------------------------------- | ----------- | ----------------- |
| `smiles` | one SMILES per line              | generated   | grid              |
| `mol`    | a single molblock                | preserved   | single card       |
| `sdf`    | records split on `$$$$`          | preserved   | grid (one/record) |
| `rxn`    | one reaction SMILES per line     | generated   | full-width stack  |
| `chem`   | any of the above (auto-detected) | per content | per content       |

Within line-based fences, text after the first whitespace becomes a caption,
`#` lines are comments, and a trailing CXSMILES `|…|` extension is preserved.

### Examples

````markdown
```smiles
CCO Ethanol
CC(=O)O Acetic acid
```

```rxn
CC(=O)O>[H+]>CC(=O)OCC Fischer esterification
```
````

Adjust image dimensions and stereo annotations in **Settings → Community plugins → Molren**.

## Installation (manual, pre-release)

1. Build or download `main.js`, `manifest.json`, `styles.css`, and `RDKit_minimal.wasm`.
2. Copy them into `<your-vault>/.obsidian/plugins/molren/`.
3. Reload Obsidian and enable **Molren** under Community plugins.

> [!IMPORTANT]
> `RDKit_minimal.wasm` (~7 MB) must sit next to `main.js` in the plugin folder — Molren reads it at runtime through the vault adapter and hands the bytes to RDKit. If it's missing, blocks render a load error.

## Development

```bash
npm install      # installs deps and pulls in the RDKit wasm
npm run dev      # esbuild watch → main.js (+ copies the wasm)
npm test         # vitest
npm run lint     # eslint (incl. Obsidian plugin rules)
npm run format   # prettier --write
npm run build    # type-check + production bundle
npm run check    # format:check + lint + test + build (what CI runs)
```

To develop against a real vault, symlink `molren/` into a test vault's
`.obsidian/plugins/`, then reload Obsidian (Ctrl+R) after each build.

### Architecture

| File              | Responsibility                                                         |
| ----------------- | ---------------------------------------------------------------------- |
| `src/main.ts`     | Plugin entry — registers the `smiles`/`mol`/`sdf`/`rxn`/`chem` fences. |
| `src/parse.ts`    | Format detection and parsing block text into structure specs.          |
| `src/svg.ts`      | Pure RDKit → SVG conversion (molecules + reactions) and theming.       |
| `src/renderer.ts` | Obsidian/DOM bridge: layout, caching, and mounting.                    |
| `src/rdkit.ts`    | Lazy, one-time RDKit wasm init (reads the wasm via the vault adapter). |
| `src/settings.ts` | Settings tab (dimensions, stereo annotations).                         |

The chemistry core is RDKit.js compiled to WebAssembly; the wasm blob is shipped
alongside the plugin rather than fetched, which is the reliable path inside the
Obsidian/Electron sandbox.

## Roadmap

- [x] High-quality depictions (CoordGen + draw options)
- [x] Multiple structures per block (grid)
- [x] molblock / SDF input
- [x] Reaction rendering
- [x] Theme-aware (dark mode) coloring
- [ ] Interactive structure editor (evaluating Ketcher vs Kekule.js)
- [ ] Optional 3D view (Mol\* / 3Dmol.js) for macromolecules

## License

[MIT](LICENSE). RDKit.js is distributed under the BSD-3-Clause license.
