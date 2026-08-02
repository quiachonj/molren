/** How a code block's contents should be parsed. */
export type InputFormat = "smiles" | "molblock" | "sdf" | "reaction" | "auto";

/** A resolved (non-auto) input format. */
export type ResolvedFormat = Exclude<InputFormat, "auto">;

/** One entry in a block: molecule text (SMILES or molblock) + optional caption. */
export interface MoleculeSpec {
  input: string;
  caption?: string;
}

/**
 * True when the input is a reaction SMILES. `>` is not a valid SMILES atom/bond
 * character, so its presence unambiguously marks a reaction.
 */
export function isReaction(input: string): boolean {
  return input.includes(">");
}

/**
 * Sniffs the format of a block's contents for the auto-detecting `chem` fence.
 * SDF wins (it contains molblocks + `$$$$`); a lone `M  END` / `V2000|V3000`
 * marks a molblock; everything else is treated as SMILES.
 */
export function detectFormat(source: string): "smiles" | "molblock" | "sdf" {
  if (/\$\$\$\$/.test(source)) return "sdf";
  if (/^M {2}END\s*$/m.test(source) || /\bV[23]000\b/.test(source)) {
    return "molblock";
  }
  return "smiles";
}

/** Resolves `auto` to a concrete format via detection. */
export function resolveFormat(
  source: string,
  format: InputFormat,
): ResolvedFormat {
  return format === "auto" ? detectFormat(source) : format;
}

/** Parses a block's contents into one spec per structure. */
export function parseInput(
  source: string,
  format: InputFormat,
): MoleculeSpec[] {
  switch (resolveFormat(source, format)) {
    case "sdf":
      return parseSdf(source);
    case "molblock":
      return parseMolblock(source);
    case "reaction":
    case "smiles":
    default:
      return parseSmilesLines(source);
  }
}

/** One SMILES per non-empty, non-comment line; caption after first whitespace. */
function parseSmilesLines(source: string): MoleculeSpec[] {
  const specs: MoleculeSpec[] = [];
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const gap = line.search(/\s/);
    if (gap === -1) {
      specs.push({ input: line });
      continue;
    }
    const rest = line.slice(gap + 1).trim();
    // A trailing `|…|` block is a CXSMILES extension, not a caption — the whole
    // line (including the space) is the structure and must be passed to RDKit.
    if (rest.startsWith("|") && rest.endsWith("|")) {
      specs.push({ input: line });
    } else {
      specs.push({
        input: line.slice(0, gap),
        caption: rest.length > 0 ? rest : undefined,
      });
    }
  }
  return specs;
}

/** A single molblock. The molfile title line (line 1) becomes the caption. */
function parseMolblock(source: string): MoleculeSpec[] {
  const input = source.replace(/\s+$/, "");
  if (input.trim().length === 0) return [];
  return [{ input, caption: titleLine(input) }];
}

/** Splits an SDF on `$$$$` into one spec per record; title line → caption. */
function parseSdf(source: string): MoleculeSpec[] {
  const specs: MoleculeSpec[] = [];
  for (const chunk of source.split("$$$$")) {
    // Drop the single leading newline left over from the `$$$$\n` separator,
    // but preserve the rest so the molblock's line structure stays intact.
    const record = chunk.replace(/^\r?\n/, "").replace(/\s+$/, "");
    if (record.trim().length === 0) continue;
    specs.push({ input: record, caption: titleLine(record) });
  }
  return specs;
}

/** The molfile title line (line 1), or undefined if blank. */
function titleLine(molblock: string): string | undefined {
  const first = molblock.split(/\r?\n/, 1)[0]?.trim();
  return first && first.length > 0 ? first : undefined;
}
