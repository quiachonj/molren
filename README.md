# Molren

**Turn plain-text chemistry into pictures, right inside your notes.** Write a SMILES string (or a molfile, SDF, or reaction) in a code block and Molren draws the 2D structure inline — powered by [RDKit.js](https://www.rdkit.org/), running entirely on your machine.

**Website:** [molren.amberlogica.com](https://molren.amberlogica.com) · **Support:** [☕ Buy me a coffee](https://buymeacoffee.com/joshquiachon)

Molren is for anyone who keeps chemistry in Obsidian — students, chemists, researchers, teachers — and wants their notes to _show_ the molecules, not just spell them out. Your structures stay as searchable, version-controllable text; the drawing is generated on the fly, offline, with nothing uploaded.

<!-- TODO: add a real screenshot at docs/screenshot.png (a note with a rendered structure, ideally in dark mode). -->

![Molren rendering a structure inline in an Obsidian note](docs/screenshot.png)

## Install

> [!NOTE]
> Molren isn't in the community plugin store yet.

**Option A — BRAT (recommended for updates).** Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin, then _Add beta plugin_ with `quiachonj/molren`.

**Option B — Manual.** Download `main.js`, `manifest.json`, `styles.css`, and `RDKit_minimal.wasm` from a release, copy all four into `<your-vault>/.obsidian/plugins/molren/`, then reload Obsidian.

**Option C — From source.** See [Development](#development).

Then enable **Molren** under **Settings → Community plugins**.

<!-- Once published: Settings → Community plugins → Browse → search "Molren" → Install → Enable. -->

> [!IMPORTANT]
> `RDKit_minimal.wasm` (~7 MB) must sit next to `main.js` in the plugin folder — Molren reads it at runtime and hands the bytes to RDKit. If it's missing, blocks show a load error. Molren is desktop-only and requires Obsidian 1.4.0+.

## Usage

Molren reads **fenced code blocks** and draws what's inside. The fence's language tag tells Molren what kind of input it is.

1. In any note, add a code block tagged `smiles` with one structure:

   ````markdown
   ```smiles
   CCO
   ```
   ````

2. Switch to Reading or Live Preview — Molren draws ethanol inline.
3. Edit the SMILES and the picture updates. That's the whole idea; everything below is more of it.

### Several molecules (a grid)

Put **one SMILES per line** for a responsive grid, and add a **caption** after the first space:

````markdown
```smiles
CCO Ethanol
CC(=O)O Acetic acid
c1ccccc1 Benzene
```
````

Lines starting with `#` are comments, so you can annotate a block:

````markdown
```smiles
# Common solvents
CCO Ethanol
CC(C)=O Acetone
```
````

### Stereochemistry

Stereo bonds and **R/S** / **E/Z** labels are drawn automatically (toggle in Settings):

````markdown
```smiles
C[C@H](N)C(=O)O L-alanine
```
````

### Molfiles and SDF

Use a `mol` block for a single molfile — Molren keeps its authored coordinates. Use an `sdf` block for multi-record SDF — each record becomes a card, using its title line as the caption:

````markdown
```mol
  (paste the full molblock here, ending in "M  END")
```

```sdf
  (paste SDF records separated by $$$$)
```
````

### Reactions

Use a `rxn` block for reaction SMILES (`reactants>>products`, optionally `reactants>agents>products`). Reactions render as wide, full-width rows:

````markdown
```rxn
CC(=O)O>[H+]>CC(=O)OCC Fischer esterification
```
````

### Not sure which fence? Use `chem`

A `chem` block **auto-detects** whether its contents are SMILES, a molfile, SDF, or a reaction — handy when pasting mixed content.

### Fences at a glance

| Use this fence | When your input is…                   | You get…                       |
| -------------- | ------------------------------------- | ------------------------------ |
| `smiles`       | one or more SMILES (one per line)     | a single card or a grid        |
| `mol`          | a single molfile / molblock           | one card, coordinates kept     |
| `sdf`          | an SDF file (records split by `$$$$`) | a grid, one card per record    |
| `rxn`          | reaction SMILES (with `>>`)           | full-width reaction rows       |
| `chem`         | any of the above — auto-detected      | the right result for the input |

> [!NOTE]
> In `smiles` and `rxn` blocks, text after the first space becomes a caption, `#` lines are comments, and a trailing CXSMILES `|…|` extension is kept as part of the structure. If a line can't be read, that block shows a small inline error (e.g. `⚠ Molren: invalid SMILES: …`) — one bad line won't stop the others.

New to SMILES? Copy the "Canonical SMILES" from a compound's **PubChem** or **Wikipedia** page, or draw a structure in a free editor (e.g. Ketcher) and export SMILES.

## Settings

**Settings → Community plugins → Molren:**

| Setting            | What it does                                                  | Default |
| ------------------ | ------------------------------------------------------------- | ------- |
| Image width        | Width each structure is drawn at (also the grid column width) | 350     |
| Image height       | Height each structure is drawn at                             | 300     |
| Stereo annotations | Show or hide R/S and E/Z labels                               | On      |

## Features

- **Multiple input formats** — SMILES, molfile/molblock, SDF, and reactions, plus an auto-detecting `chem` fence.
- **Grids with captions** — one structure per line, laid out responsively.
- **Stereochemistry** — R/S and E/Z annotations, toggleable.
- **Theme-aware** — structures recolor for light/dark themes live, no re-render.
- **High-quality depictions** — CoordGen layouts with tuned draw options.
- **Local & offline** — RDKit runs in WebAssembly; nothing leaves your vault.
- **Robust** — inline errors instead of blank boxes, and cached rendering.

---

## Architecture

```
fence (smiles│mol│sdf│rxn│chem)
      │
      ▼
 parse.ts  →  detect format, split into structure specs (+ captions)
      │
      ▼
  svg.ts   →  RDKit → SVG (molecules + reactions), theme recolor
      │
      ▼
renderer.ts →  layout (single│grid│reaction stack), cache, mount
```

| File              | Responsibility                                                         |
| ----------------- | ---------------------------------------------------------------------- |
| `src/main.ts`     | Plugin entry — registers the `smiles`/`mol`/`sdf`/`rxn`/`chem` fences. |
| `src/parse.ts`    | Format detection and parsing block text into structure specs.          |
| `src/svg.ts`      | Pure RDKit → SVG conversion (molecules + reactions) and theming.       |
| `src/renderer.ts` | Obsidian/DOM bridge: layout, caching, and mounting.                    |
| `src/rdkit.ts`    | Lazy, one-time RDKit wasm init (reads the wasm via the vault adapter). |
| `src/settings.ts` | Settings tab (dimensions, stereo annotations).                         |

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

## Implementation notes

> [!IMPORTANT]
> Molren is desktop-only (`isDesktopOnly: true`) and targets `minAppVersion` 1.4.0, so it uses the classic settings-tab API rather than the declarative one from 1.13.

1. **wasm delivery.** The RDKit `.wasm` is shipped beside the plugin and read through the vault adapter, then passed to `initRDKitModule({ wasmBinary })` — `file://`/`app://` fetches are unreliable in the Obsidian/Electron sandbox.
2. **Coordinates.** SMILES carry none, so Molren generates a CoordGen 2D layout; molfiles/SDF bring their own, which are preserved. The choice is made per structure via RDKit's `has_coords()`, not by fence.
3. **Theming.** RDKit bakes fixed colors into the SVG. Molren rewrites any dark near-grayscale "ink" (bonds, carbons, dummy atoms drawn as `#191919`, annotations) plus O/N as CSS variables, so one cached SVG adapts to light/dark live.
4. **SVG insertion.** Parsed via `DOMParser` + `importNode` (not `innerHTML`) per Obsidian's guidelines.
5. **RDKit types.** The shipped `@rdkit/rdkit` types omit the reaction API and the CJS default export, so both are declared locally in `src/rdkit.ts`.

## Roadmap

- [x] High-quality depictions (CoordGen + draw options)
- [x] Multiple structures per block (grid)
- [x] molfile / SDF input
- [x] Reaction rendering
- [x] Theme-aware (dark mode) coloring
- [ ] Interactive structure editor (evaluating Ketcher vs Kekule.js)
- [ ] Optional 3D view (Mol\* / 3Dmol.js) for macromolecules

## Support

- ☕ [Buy me a coffee](https://buymeacoffee.com/joshquiachon)
- 🌐 [molren.amberlogica.com](https://molren.amberlogica.com)

## License

[MIT](LICENSE). RDKit.js is distributed under the BSD-3-Clause license.
