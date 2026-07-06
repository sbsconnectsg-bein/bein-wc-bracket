/**
 * Pulls FIFA World Cup 2026 fixtures from football-data.org and writes
 * data/bracket-data.json as a pre-built bracket TREE (not just flat lists
 * per round), because the 2026 knockout bracket path is fixed in advance —
 * FIFA locks in exactly which Round-of-16 winner meets which other winner,
 * all the way to the Final, as soon as the group stage ends. We hardcode
 * that known topology here so the page can show correctly-grouped matchups
 * even before later rounds are actually played (as "TBD" placeholders).
 *
 * Requires an env var API_FOOTBALL_KEY (set as a GitHub Actions secret)
 * holding your football-data.org token.
 */

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.API_FOOTBALL_KEY;
const COMPETITION_CODE = 'WC';
const BASE_URL = 'https://api.football-data.org/v4';

const STAGE_MAP = [
  { key: 'round_16', match: (s) => /LAST_16|ROUND_OF_16/i.test(s) },
  { key: 'quarter_finals', match: (s) => /QUARTER/i.test(s) },
  { key: 'semi_finals', match: (s) => /SEMI/i.test(s) },
  { key: 'third_place', match: (s) => /THIRD/i.test(s) },
  { key: 'final', match: (s) => /^FINAL$/i.test(s.trim()) },
];

// Which pair of Round-of-16 slots (0-indexed, in kickoff order = FIFA match
// numbers 89-96 in order) feeds each of the 4 Quarter-final slots.
// Quadrants are ordered so that quadrants[0]+[1] feed Semi-final 1, and
// quadrants[2]+[3] feed Semi-final 2 — matching FIFA's official bracket.
const QUADRANT_R16_PAIRS = [
  [0, 1], // -> QF slot A (feeds SF1)
  [4, 5], // -> QF slot B (feeds SF1)
  [2, 3], // -> QF slot C (feeds SF2)
  [6, 7], // -> QF slot D (feeds SF2)
];

async function fetchMatches() {
  const url = `${BASE_URL}/competitions/${COMPETITION_CODE}/matches`;
  const res = await fetch(url, { headers: { 'X-Auth-Token': API_KEY } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`football-data.org request failed: HTTP ${res.status} ${body}`);
  }
  const json = await res.json();
  return json.matches || [];
}

function teamCode(team) {
  if (!team) return null;
  if (team.tla) return team.tla;
  return (team.name || '').slice(0, 3).toUpperCase() || null;
}

function mapMatch(match) {
  const fullTime = match.score && match.score.fullTime ? match.score.fullTime : {};
  return {
    id: String(match.id),
    kickoff: match.utcDate || null,
    status: match.status,
    home: { name: match.homeTeam.name || 'TBD', code: teamCode(match.homeTeam), score: fullTime.home ?? null },
    away: { name: match.awayTeam.name || 'TBD', code: teamCode(match.awayTeam), score: fullTime.away ?? null },
  };
}

function placeholderMatch(nameA, nameB) {
  return {
    id: null,
    kickoff: null,
    status: 'SCHEDULED',
    home: { name: nameA || 'TBD', code: nameA ? nameA.slice(0, 3).toUpperCase() : null, score: null },
    away: { name: nameB || 'TBD', code: nameB ? nameB.slice(0, 3).toUpperCase() : null, score: null },
  };
}

function getWinnerName(m) {
  if (!m || m.status !== 'FINISHED') return null;
  if (m.home.score === null || m.away.score === null || m.home.score === m.away.score) return null;
  return m.home.score > m.away.score ? m.home.name : m.away.name;
}

function getLoserName(m) {
  if (!m || m.status !== 'FINISHED') return null;
  if (m.home.score === null || m.away.score === null || m.home.score === m.away.score) return null;
  return m.home.score > m.away.score ? m.away.name : m.home.name;
}

// Finds a real fixture from `pool` whose two teams match nameA/nameB (in
// either order). Falls back to a TBD placeholder if not found yet or if
// the team names aren't known yet.
function resolveMatch(pool, nameA, nameB) {
  if (nameA && nameB) {
    const found = pool.find((raw) => {
      const h = raw.homeTeam.name, a = raw.awayTeam.name;
      return (h === nameA && a === nameB) || (h === nameB && a === nameA);
    });
    if (found) return mapMatch(found);
  }
  return placeholderMatch(nameA, nameB);
}

async function main() {
  if (!API_KEY) {
    throw new Error('Missing API_FOOTBALL_KEY environment variable (should hold your football-data.org token).');
  }

  const allMatches = await main_fetchAndBucket();
  const { round16Raw, quarterRaw, semiRaw, thirdRaw, finalRaw } = allMatches;

  // Sort R16 by kickoff time ascending -> matches FIFA's official match order (89-96).
  const round16 = round16Raw
    .slice()
    .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))
    .map(mapMatch);

  if (round16.length !== 8) {
    console.warn(`Expected 8 Round-of-16 matches, found ${round16.length}. Bracket topology may be off until all 8 exist.`);
  }

  const quadrants = QUADRANT_R16_PAIRS.map(([i, j]) => {
    const matchA = round16[i] || placeholderMatch(null, null);
    const matchB = round16[j] || placeholderMatch(null, null);
    const winnerA = getWinnerName(matchA);
    const winnerB = getWinnerName(matchB);
    const qf = resolveMatch(quarterRaw, winnerA, winnerB);
    return { r16: [matchA, matchB], qf };
  });

  const sf1 = resolveMatch(semiRaw, getWinnerName(quadrants[0].qf), getWinnerName(quadrants[1].qf));
  const sf2 = resolveMatch(semiRaw, getWinnerName(quadrants[2].qf), getWinnerName(quadrants[3].qf));

  const final = resolveMatch(finalRaw, getWinnerName(sf1), getWinnerName(sf2));
  const thirdPlace = resolveMatch(thirdRaw, getLoserName(sf1), getLoserName(sf2));

  const output = {
    updated_at: new Date().toISOString(),
    tournament: 'FIFA World Cup 2026',
    quadrants,
    semis: [sf1, sf2],
    final,
    third_place: thirdPlace,
  };

  const outPath = path.join(__dirname, '..', 'data', 'bracket-data.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`Wrote ${outPath}. R16 matches found: ${round16.length}/8.`);
}

async function main_fetchAndBucket() {
  const matches = await fetchMatches();
  const buckets = { round16Raw: [], quarterRaw: [], semiRaw: [], thirdRaw: [], finalRaw: [] };
  const keyToBucket = {
    round_16: 'round16Raw',
    quarter_finals: 'quarterRaw',
    semi_finals: 'semiRaw',
    third_place: 'thirdRaw',
    final: 'finalRaw',
  };
  for (const match of matches) {
    const stage = match.stage || '';
    const bucket = STAGE_MAP.find((r) => r.match(stage));
    if (bucket) {
      buckets[keyToBucket[bucket.key]].push(match);
    }
  }
  return buckets;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
