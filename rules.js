/**
 * MLTC Handicap rules engine
 * Ported from "handicap.calculator 5-004" (Google Sheet, front/lookup/scale tabs)
 * plus the tie-break logic confirmed in tie_break_Sue_v004.xlsx.
 *
 * A handicap is written as e.g. "O15.3", "R0.3", "Scratch".
 *   - Letter: O = Owe (stronger player), R = Receive (weaker player)
 *   - Tens: 0, 15, 30, 40, 50, 60, 70 — how many "games" of head start/deficit
 *   - Spot digit (.0-.5, currently only .0 and .3 are actually assigned):
 *     alternates an extra +/-1 step on specific games in the 6-game rolling cycle
 */

// ---- Core scale --------------------------------------------------------

// Tens values in rank order. Index = "step" used throughout.
const TENS_ORDER = [0, 15, 30, 40, 50, 60, 70];

// Game-score label for each step, -6..+6 (from the `scale` tab).
// Index 6 + step gives the label.
const SCORE_LABELS = ['-70', '-60', '-50', '-40', '-30', '-15', '0', '15', '30', '40', '50', '60', '70'];

// Which of the 6 rolling games get an extra +/-1, per spot digit.
// Transcribed directly from the `lookup` tab's per-game flag columns.
// Only spot 0 and 3 are in active use, but the full table is kept for fidelity.
const OWE_GAME_FLAGS = {
  0: [],
  1: [5],
  2: [3, 5],
  3: [1, 3, 5],
  4: [1, 3, 5, 6],
  5: [1, 3, 4, 5, 6],
};
const RECEIVE_GAME_FLAGS = {
  0: [],
  1: [2],
  2: [2, 4],
  3: [2, 4, 6],
  4: [1, 2, 4, 6],
  5: [1, 2, 3, 4, 6],
};

// ---- Parsing -------------------------------------------------------------

/**
 * Parse a handicap string into its parts.
 * @param {string} raw e.g. "O15.3", "R0.3", "Scratch", "O0.0"
 */
function parseHandicap(raw) {
  const str = String(raw).trim();
  if (/^scratch$/i.test(str) || /^O?0\.0(\s+Scratch)?$/i.test(str)) {
    return { side: 'S', tens: 0, spot: 0, label: 'Scratch' };
  }
  const m = str.match(/^([OR])\s*(\d+)(?:\.(\d))?$/i);
  if (!m) throw new Error(`Unrecognised handicap: "${raw}"`);
  const side = m[1].toUpperCase();
  const tens = parseInt(m[2], 10);
  const spot = m[3] ? parseInt(m[3], 10) : 0;
  if (!TENS_ORDER.includes(tens)) throw new Error(`Unknown tens value ${tens} in "${raw}"`);
  if (side === 'O' && tens === 0 && spot === 0) return { side: 'S', tens: 0, spot: 0, label: 'Scratch' };
  return { side, tens, spot, label: `${side}${tens}${spot ? '.' + spot : '.0'}` };
}

/** Signed step for the tens portion only (ignores spot). O = negative, R = positive. */
function tensStep(h) {
  const rank = TENS_ORDER.indexOf(h.tens);
  return h.side === 'O' ? -rank : h.side === 'R' ? rank : 0;
}

/**
 * "Distance from scratch" rank, replicating the row order of the original
 * lookup table (strongest Owe at the top, Scratch in the middle, weakest
 * Receive at the bottom), extended symmetrically for tens beyond the
 * official 60/40 range so netting comparisons stay consistent.
 */
function scratchDistance(h) {
  if (h.side === 'S') return 0;
  const rank = TENS_ORDER.indexOf(h.tens); // 0..6
  // Each tens block spans 6 rows (spot 0-5). A higher spot digit means more
  // games get the extra +/-1 adjustment, so it's always FARTHER from scratch
  // than the same tens with a lower spot — true for both Owe and Receive.
  return rank * 6 + h.spot + 1; // +1 so it's always > 0 (Scratch is 0)
}

// ---- Game scoring (best-of-3 tie-break sets) ------------------------------

/**
 * Compute the 6-game rolling starting-score pattern for two players.
 * Returns an array of 6 { p1: '-30', p2: '15', ... } score labels.
 */
function computeGameScores(raw1, raw2) {
  const h1 = parseHandicap(raw1);
  const h2 = parseHandicap(raw2);

  const flagsFor = (h, game) => {
    if (h.side === 'S') return 0;
    const table = h.side === 'O' ? OWE_GAME_FLAGS : RECEIVE_GAME_FLAGS;
    const flagged = table[h.spot] || [];
    if (!flagged.includes(game)) return 0;
    return h.side === 'O' ? -1 : 1;
  };

  const totals1 = [];
  const totals2 = [];
  for (let g = 1; g <= 6; g++) {
    totals1.push(tensStep(h1) + flagsFor(h1, g));
    totals2.push(tensStep(h2) + flagsFor(h2, g));
  }

  const sameSide = h1.side !== 'S' && h2.side !== 'S' && h1.side === h2.side;

  let adj1 = totals1;
  let adj2 = totals2;

  if (sameSide) {
    const nearer = scratchDistance(h1) <= scratchDistance(h2) ? 1 : 2;
    if (nearer === 1) {
      adj1 = totals1.map(() => 0);
      adj2 = totals2.map((v, i) => v - totals1[i]);
    } else {
      adj2 = totals2.map(() => 0);
      adj1 = totals1.map((v, i) => v - totals2[i]);
    }
  }

  const toLabel = (step) => {
    const clamped = Math.max(-6, Math.min(6, step));
    return SCORE_LABELS[clamped + 6];
  };

  const games = [];
  for (let i = 0; i < 6; i++) {
    games.push({ game: i + 1, p1: toLabel(adj1[i]), p2: toLabel(adj2[i]) });
  }
  return { p1: h1.label, p2: h2.label, games };
}

// ---- Tie-break scoring -----------------------------------------------------

/** Base tie-break points for a single handicap, before any netting. */
function tieBreakBasePoints(h) {
  if (h.side === 'S') return 0;
  const rank = TENS_ORDER.indexOf(h.tens);
  let points = rank * 2;
  if (h.spot === 3) points += 1; // "each .3 counts as one point"
  return h.side === 'O' ? -points : points;
}

/**
 * Compute tie-break starting points for two players.
 * Netting rule: only applies when both players are the same side
 * (both Owe or both Receive) — same as game scoring. Opposite-sided
 * pairs and anything involving Scratch get no adjustment.
 */
function computeTieBreak(raw1, raw2) {
  const h1 = parseHandicap(raw1);
  const h2 = parseHandicap(raw2);

  const p1raw = tieBreakBasePoints(h1);
  const p2raw = tieBreakBasePoints(h2);

  const sameSide = h1.side !== 'S' && h2.side !== 'S' && h1.side === h2.side;

  if (!sameSide) {
    return { p1: h1.label, p2: h2.label, points1: p1raw, points2: p2raw, netted: false };
  }

  const nearer = scratchDistance(h1) <= scratchDistance(h2) ? 1 : 2;
  if (nearer === 1) {
    return { p1: h1.label, p2: h2.label, points1: 0, points2: p2raw - p1raw, netted: true };
  }
  return { p1: h1.label, p2: h2.label, points1: p1raw - p2raw, points2: 0, netted: true };
}

// ---- Valid handicap list (currently in use at the club) -------------------

// Full range: O70 down to R30, with .0 and .3 variants, EXCEPT O70.3 and
// R30.3 (not assigned). Ordered strongest Owe -> Scratch -> weakest Receive.
const VALID_HANDICAPS = [
  'O70.0',
  'O60.3', 'O60.0',
  'O50.3', 'O50.0',
  'O40.3', 'O40.0',
  'O30.3', 'O30.0',
  'O15.3', 'O15.0',
  'O0.3',
  'Scratch',
  'R0.3',
  'R15.0', 'R15.3',
  'R30.0',
];

// ---- Exports ---------------------------------------------------------------

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseHandicap, computeGameScores, computeTieBreak, TENS_ORDER, VALID_HANDICAPS };
}
