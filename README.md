# Molren

Render 2D chemical structures from SMILES directly in your Obsidian notes, powered by [RDKit.js](https://www.rdkit.org/).

Write a fenced `smiles` block and Molren draws the molecule inline:

````markdown
```smiles
OC1=CC=C(CC2N(CCC3=CC(OC)=C(C(OC4=CC5=C(C=C4OC)CCN(C)C5C6)=C23)OC)C)C=C1OC7=CC=C6C=C7
```
````

## Features

- **SMILES → 2D structure** rendered as crisp, theme-friendly SVG.
- **Local & offline** — RDKit runs entirely in WebAssembly; nothing leaves your vault.
- **Inline errors** — invalid SMILES show a readable message instead of a blank box.
- **Render caching** — each unique structure is drawn once and reused on re-render/scroll.

Planned: molblock/SDF input, multi-structure grids, and an interactive editor (see [Roadmap](#roadmap)).

## Usage

Put a SMILES string inside a `smiles` code block:

````markdown
```smiles
CC(=O)Oc1ccccc1C(=O)O
```
````

Adjust the default image dimensions in **Settings → Community plugins → Molren**.

## Installation (manual, pre-release)

1. Build or download `main.js`, `manifest.json`, `styles.css`, and `RDKit_minimal.wasm`.
2. Copy them into `<your-vault>/.obsidian/plugins/molren/`.
3. Reload Obsidian and enable **Molren** under Community plugins.

> [!IMPORTANT]
> `RDKit_minimal.wasm` (~8 MB) must sit next to `main.js` in the plugin folder — Molren reads it at runtime through the vault adapter and hands the bytes to RDKit. If it's missing, blocks render a load error.

## Development

```bash
npm install      # installs deps and pulls in the RDKit wasm
npm run dev      # esbuild watch → main.js (+ copies the wasm)
npm test         # vitest
npm run build    # type-check + production bundle
```

To develop against a real vault, point the output at a test vault's plugin folder
(e.g. symlink `molren/` into `TestVault/.obsidian/plugins/`), or copy `main.js`,
`manifest.json`, `styles.css`, and `RDKit_minimal.wasm` after each build.

### Architecture

| File | Responsibility |
| --- | --- |
| `src/main.ts` | Plugin entry — registers the `smiles` code-block processor. |
| `src/rdkit.ts` | Lazy, one-time RDKit wasm init (reads the wasm via the vault adapter). |
| `src/renderer.ts` | Pure `molToSvg` conversion + caching + DOM mounting. |
| `src/settings.ts` | Settings tab (image dimensions). |

The chemistry core is RDKit.js compiled to WebAssembly; the wasm blob is shipped
alongside the plugin rather than fetched, which is the reliable path inside the
Obsidian/Electron sandbox.

## Roadmap

- [ ] molblock / SDF input
- [ ] Multiple structures per block (grid)
- [ ] Dark-mode-aware bond coloring via RDKit draw options
- [ ] Interactive structure editor (evaluating Ketcher vs Kekule.js)
- [ ] Optional 3D view (Mol\* / 3Dmol.js) for macromolecules

## License

[MIT](LICENSE). RDKit.js is distributed under the BSD-3-Clause license.
