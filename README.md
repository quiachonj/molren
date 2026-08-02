# Molren

**Turn plain-text chemistry into pictures, right inside your notes.** Write a SMILES string (or a molfile, SDF, or reaction) in a code block and Molren draws the 2D structure inline — powered by [RDKit.js](https://www.rdkit.org/), running entirely on your machine.

````markdown
```smiles
CC(=O)Oc1ccccc1C(=O)O
```
````

→ renders aspirin as a clean, theme-aware structure.

## What it's for

Molren is for anyone who keeps chemistry in Obsidian — students, chemists, researchers, teachers — and wants their notes to _show_ the molecules, not just spell them out.

- **Plain text in, picture out.** Your structures stay as searchable, version-controllable text; the drawing is generated on the fly.
- **Private and offline.** RDKit runs locally in WebAssembly. Nothing is uploaded, no internet needed, no accounts.
- **Fits your vault.** Structures use crisp SVG and recolor themselves for light and dark themes.

If you can write a SMILES string, you can use Molren. If you can't yet, see [Where to get SMILES](#where-to-get-smiles).

## Quick start

1. Install and enable Molren (see [Installation](#installation)).
2. In any note, add a fenced code block with the language `smiles`:

   ````markdown
   ```smiles
   CCO
   ```
   ````

3. Switch to Reading or Live Preview — you'll see ethanol drawn inline.

That's the whole idea. Everything below is just more of it.

## Usage

Molren reads **fenced code blocks** and draws what's inside. The fence's language tag tells Molren what kind of input it is.

### One molecule

Put a single SMILES string in a `smiles` block:

````markdown
```smiles
Cn1cnc2c1c(=O)n(C)c(=O)n2C
```
````

### Several molecules (a grid)

Put **one SMILES per line** — Molren lays them out in a responsive grid:

````markdown
```smiles
CCO
CC(=O)O
c1ccccc1
```
````

Add a **caption** by typing a label after the structure (anything after the first space):

````markdown
```smiles
CCO Ethanol
CC(=O)O Acetic acid
c1ccccc1 Benzene
```
````

Lines starting with `#` are ignored, so you can annotate your blocks:

````markdown
```smiles
# Common solvents
CCO Ethanol
CC(C)=O Acetone
```
````

### Stereochemistry

Stereo bonds and **R/S** and **E/Z** labels are drawn automatically:

````markdown
```smiles
C[C@H](N)C(=O)O L-alanine
```
````

(Toggle the labels off in settings if you prefer them hidden.)

### Molfiles and SDF

If you have a molfile (with its own drawn coordinates), use a `mol` block — Molren keeps the layout exactly as authored:

````markdown
```mol
  (paste the full molblock here, ending in "M  END")
```
````

For a multi-record **SDF**, use an `sdf` block — each record becomes its own card, using its title line as the caption:

````markdown
```sdf
  (paste SDF records separated by $$$$)
```
````

### Reactions

Use a `rxn` block for reaction SMILES (`reactants>>products`, or `reactants>agents>products`). Reactions render as wide, full-width rows:

````markdown
```rxn
CC(=O)O>[H+]>CC(=O)OCC Fischer esterification
```
````

### Not sure which fence? Use `chem`

A `chem` block **auto-detects** whether its contents are SMILES, a molfile, SDF, or a reaction, and renders accordingly. Handy when pasting mixed content:

````markdown
```chem
CC(=O)Oc1ccccc1C(=O)O Aspirin
```
````

### Fences at a glance

| Use this fence | When your input is…                      | You get…                       |
| -------------- | ---------------------------------------- | ------------------------------ |
| `smiles`       | one or more SMILES (one per line)        | a single card or a grid        |
| `mol`          | a single molfile / molblock              | one card, coordinates kept     |
| `sdf`          | an SDF file (records split by `$$$$`)    | a grid, one card per record    |
| `rxn`          | reaction SMILES (with `>>`)              | full-width reaction rows       |
| `chem`         | any of the above — let Molren figure out | the right result for the input |

> [!TIP]
> In `smiles` and `rxn` blocks, text after the first space becomes a caption, `#` lines are comments, and a trailing CXSMILES `|…|` extension is kept as part of the structure.

### Settings

**Settings → Community plugins → Molren:**

- **Image width / height** — the size each structure is drawn at (also sets the grid column width).
- **Stereo annotations** — show or hide R/S and E/Z labels.

### When something looks wrong

If Molren can't read your input, that block shows a small inline error (for example, `⚠ Molren: invalid SMILES: …`) instead of failing silently. Fix the offending line and it re-renders. In a multi-line block, one bad line won't stop the others from drawing.

### Where to get SMILES

New to SMILES? You can copy the "Canonical SMILES" from a compound's page on **PubChem** or **Wikipedia**, or draw a structure in a free editor (e.g. Ketcher) and export SMILES. Paste it into a `smiles` block and you're done.

## Installation

Until Molren is in the community plugin browser, install it manually:

1. Get `main.js`, `manifest.json`, `styles.css`, and `RDKit_minimal.wasm` (from a release, or by building — see [Development](#development)).
2. Copy all four into `<your-vault>/.obsidian/plugins/molren/`.
3. Reload Obsidian and enable **Molren** under **Settings → Community plugins**.

> [!IMPORTANT]
> `RDKit_minimal.wasm` (~7 MB) must sit next to `main.js` in the plugin folder — Molren reads it at runtime and hands the bytes to RDKit. If it's missing, blocks show a load error.

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

How it fits together:

- **Format → parse → render.** `parse.ts` turns block text into a list of structures (one molecule/reaction each, with optional captions). `svg.ts` converts each to an SVG string. `renderer.ts` decides the layout (single card, grid, or reaction stack), caches results, and mounts them.
- **Coordinates.** SMILES carry none, so Molren generates a CoordGen 2D layout; molfiles/SDF bring their own, which are preserved (decided per structure via RDKit's `has_coords()`).
- **Theming.** RDKit bakes fixed colors into the SVG; Molren rewrites the dark "ink" and the O/N colors as CSS variables so one cached SVG adapts to light/dark live, with no re-render.
- **wasm delivery.** The RDKit `.wasm` is shipped beside the plugin and read through the vault adapter rather than fetched — the reliable path inside the Obsidian/Electron sandbox.

## Roadmap

- [x] High-quality depictions (CoordGen + draw options)
- [x] Multiple structures per block (grid)
- [x] molfile / SDF input
- [x] Reaction rendering
- [x] Theme-aware (dark mode) coloring
- [ ] Interactive structure editor (evaluating Ketcher vs Kekule.js)
- [ ] Optional 3D view (Mol\* / 3Dmol.js) for macromolecules

## License

[MIT](LICENSE). RDKit.js is distributed under the BSD-3-Clause license.
