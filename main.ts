// A working token-radar-01 entry (Node 22, standard library only).
//
// The program reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>), scores every
// pre-token protocol with the model in lib/model.ts, writes the ranked board to /output/board.json, and
// copies this repository's dashboard/ and screenshots/ to /output. Last, it writes /output/dossier.json,
// the summary the judge reads, with the vendored make.fun library.
//
// The dashboard is a static page, no framework and no network: dashboard/index.html, dashboard/app.css
// and dashboard/app.js read /output/data.js, which this program writes from the same board. A starting
// point, not a winner: it covers the watchlist, states the model and gives every protocol a farm plan.
// Change the model, the page or the plan; keep the gate's shape.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, learnComparables, parseSnapshot, recomputeCheck, summariseBoard } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** A dollar figure in the short form the summary line uses: $556.9M, $1.2B, $842K. */
function fmtUsd(n: number): string {
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

// The gate refuses a board whose rows share an implied value only when all of them do; a ranking
// needs every row's value distinct, so check that here as well, before anything is written.
const impliedSeen = new Set<number>();
for (const row of board) {
  if (impliedSeen.has(row.implied_value_usd)) {
    process.stderr.write(`token radar: two rows share implied value $${row.implied_value_usd}: the board ranks nothing between them\n`);
    process.exit(1);
  }
  impliedSeen.add(row.implied_value_usd);
}

// The board checked against the model a second time, from the snapshot's own figures: a mismatch
// means the board on disk is not the model the code describes, and the entry must not ship.
const mismatch = recomputeCheck(board, snapshot);
if (mismatch !== null) {
  process.stderr.write(`token radar: recompute mismatch on ${mismatch.slug}: board $${mismatch.board_value}, model $${mismatch.recomputed_value}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** One CSV cell: quoted when it holds a comma, a quote or a newline. */
function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// The board's summary, for the judge to read without recomputing: coverage, value concentration
// and the per-category split, all computed from the board's own rows.
const learned = learnComparables(snapshot);
const summary = summariseBoard(board, snapshot, learned);
writeFileSync(join(out, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);

// The comparables as a plain table: one line per category, the peers the median comes from.
const compLines = ['category,live_peers,median_mcap_tvl'];
for (const c of radar.comparables) compLines.push(`${csvCell(c.category)},${c.peers},${c.median_multiple}`);
writeFileSync(join(out, 'comparables.csv'), `${compLines.join('\n')}\n`);

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// Screenshots are PNGs under the size cap: check the magic bytes and the size of each one.
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
for (const name of shots) {
  const bytes = readFileSync(join(out, 'screenshots', name));
  if (bytes.length > SCREENSHOT_CAPS.max_bytes) {
    process.stderr.write(`token radar: screenshots/${name} is ${bytes.length} bytes, over the ${SCREENSHOT_CAPS.max_bytes} cap\n`);
    process.exit(1);
  }
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_MAGIC)) {
    process.stderr.write(`token radar: screenshots/${name} is not a PNG image\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside) under model ${radar.model_version} (${radar.comparables.length} category comparables)\n` +
    `token radar: ${summary.categories.length} categories, ${summary.chains.length} chains, total implied ${fmtUsd(summary.total_implied_usd)}, median ${fmtUsd(summary.median_implied_usd)}, top 10 ${fmtUsd(summary.top10_implied_usd)}\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'summary.json')}, ${join(out, 'comparables.csv')}, ${join(out, 'dashboard')} (3 files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
