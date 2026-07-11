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

// FIFA fixes the venue and kickoff time for every knockout SLOT (match
// number) months in advance — it's the TEAMS in that slot that are unknown,
// not the schedule. football-data.org only creates a fixture record (with a
// kickoff time) once both teams are confirmed, so until then we'd otherwise
// show "Date TBC" even though the real date has been public since the
// Round of 32 draw. This table fills that gap. Source: FIFA's official
// match schedule, cross-checked against NBC Sports/ESPN reporting (July 2026).
const FIXED_KICKOFFS = {
  97: '2026-07-09T20:00:00Z',  // QF1 - Boston/Foxborough, 4:00pm ET
  98: '2026-07-10T19:00:00Z',  // QF2 - Los Angeles/Inglewood, 3:00pm ET
  99: '2026-07-11T21:00:00Z',  // QF3 - Miami, 5:00pm ET
  100: '2026-07-12T01:00:00Z', // QF4 - Kansas City, 9:00pm ET (Jul 11) -> crosses to Jul 12 UTC
  101: '2026-07-14T19:00:00Z', // SF1 - Dallas/Arlington, 3:00pm ET
  102: '2026-07-15T19:00:00Z', // SF2 - Atlanta, 3:00pm ET
  103: '2026-07-18T21:00:00Z', // 3rd place - Miami, 5:00pm ET
  104: '2026-07-19T19:00:00Z', // Final - East Rutherford, 3:00pm ET
};

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

// Golden Boot / top scorers. If this endpoint isn't available on the
// current plan or the request fails for any reason, we degrade gracefully
// (return an empty list) rather than let it break the whole bracket update.
async function fetchTopScorers(limit = 3) {
  try {
    const url = `${BASE_URL}/competitions/${COMPETITION_CODE}/scorers?limit=${limit}`;
    const res = await fetch(url, { headers: { 'X-Auth-Token': API_KEY } });
    if (!res.ok) {
      console.warn(`Scorers request failed: HTTP ${res.status}. Skipping top scorers section.`);
      return [];
    }
    const json = await res.json();
    return (json.scorers || []).map((s) => ({
      name: s.player?.lastName || lastNameFallback(s.player?.name) || 'Unknown',
      team: s.team?.shortName || s.team?.name || '',
      teamCode: s.team?.tla || null,
      goals: s.goals ?? 0,
    }));
  } catch (err) {
    console.warn('Scorers request threw an error. Skipping top scorers section.', err.message);
    return [];
  }
}

// football-data.org's Person resource usually includes a separate lastName
// field, which we prefer. This is only a fallback for the rare case where
// only a combined "name" string is available — takes the final word, which
// is right for the vast majority of players (won't be perfect for every
// multi-word surname, but that's an acceptable trade-off for a display label).
function lastNameFallback(fullName) {
  if (!fullName) return null;
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1];
}

function teamCode(team) {
  if (!team) return null;
  if (team.tla) return team.tla;
  return (team.name || '').slice(0, 3).toUpperCase() || null;
}

// Manual corrections, keyed by football-data.org's own fixture id — a last
// resort for when their API gets stuck with incomplete/wrong data for a
// specific match (as happened with Switzerland's real 4-3 shootout win over
// Colombia showing as a stuck, tied 3-3 with no winner for an extended
// period). Only use this when you've confirmed the real result yourself and
// the API genuinely isn't correcting itself after a reasonable wait — remove
// the entry once the API catches up, so we go back to trusting it directly.
const MANUAL_OVERRIDES = {
  '537382': { penalties: { home: 4, away: 3 }, winner: 'HOME_TEAM' }, // SUI 4-3 COL, Round of 16 Match 96
};

function mapMatch(match, matchNumber) {
  const score = match.score || {};
  const fullTime = score.fullTime || {};
  const regularTime = score.regularTime || {};
  const extraTime = score.extraTime || {};
  let penalties = score.penalties && (score.penalties.home !== null || score.penalties.away !== null)
    ? { home: score.penalties.home, away: score.penalties.away }
    : null;

  // football-data.org occasionally marks a match FINISHED with the shootout
  // penalty count populated slightly before its own `winner` field catches
  // up (a brief backend lag right after a shootout ends) — so if `winner`
  // is missing but the penalty count is present and not tied, derive it
  // ourselves rather than waiting for the next refresh to show a result.
  let winner = score.winner || null;
  if (!winner && penalties && penalties.home !== null && penalties.away !== null && penalties.home !== penalties.away) {
    winner = penalties.home > penalties.away ? 'HOME_TEAM' : 'AWAY_TEAM';
  }

  const override = MANUAL_OVERRIDES[String(match.id)];
  if (override) {
    if (override.penalties) penalties = override.penalties;
    if (override.winner) winner = override.winner;
  }

  // football-data.org's `fullTime` field folds penalty-shootout kicks into
  // the goal count (e.g. a match actually drawn 1-1 shows fullTime 7-6 after
  // a 6-5 shootout) — not how football scores are conventionally displayed.
  // For a penalty-shootout match we show the real goals (regular + extra
  // time only) and let the separate "Pens" note carry the shootout result.
  let goalsHome = fullTime.home;
  let goalsAway = fullTime.away;
  if (score.duration === 'PENALTY_SHOOTOUT' && regularTime.home !== undefined) {
    goalsHome = (regularTime.home ?? 0) + (extraTime.home ?? 0);
    goalsAway = (regularTime.away ?? 0) + (extraTime.away ?? 0);
  }

  return {
    id: String(match.id),
    matchNumber: matchNumber || null,
    kickoff: match.utcDate || FIXED_KICKOFFS[matchNumber] || null,
    status: match.status,
    winner, // 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null — from the API, with a penalty-count fallback
    duration: score.duration || null, // 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT'
    penalties,
    home: { name: match.homeTeam.name || 'TBD', code: teamCode(match.homeTeam), score: goalsHome ?? null },
    away: { name: match.awayTeam.name || 'TBD', code: teamCode(match.awayTeam), score: goalsAway ?? null },
  };
}

function placeholderMatch(nameA, nameB, matchNumber, sourceA, sourceB) {
  const labelA = nameA || sourceA || 'TBD';
  const labelB = nameB || sourceB || 'TBD';
  return {
    id: null,
    matchNumber: matchNumber || null,
    kickoff: FIXED_KICKOFFS[matchNumber] || null,
    status: 'SCHEDULED',
    winner: null,
    duration: null,
    penalties: null,
    home: { name: labelA, code: nameA ? nameA.slice(0, 3).toUpperCase() : null, score: null },
    away: { name: labelB, code: nameB ? nameB.slice(0, 3).toUpperCase() : null, score: null },
  };
}

// Trust `winner` being populated (and not a draw) as sufficient evidence a
// match concluded, rather than also requiring status === 'FINISHED'. That
// extra check seems reasonable, but football-data.org has been observed to
// occasionally return a corrupted `status` value (e.g. a raw date string
// instead of "FINISHED") for a specific match while `winner` itself is
// still populated correctly — the stricter check silently broke bracket
// resolution downstream in exactly that case.
function getWinnerName(m) {
  if (!m || !m.winner || m.winner === 'DRAW') return null;
  return m.winner === 'HOME_TEAM' ? m.home.name : m.away.name;
}

function getLoserName(m) {
  if (!m || !m.winner || m.winner === 'DRAW') return null;
  return m.winner === 'HOME_TEAM' ? m.away.name : m.home.name;
}

// Finds a real fixture from `pool` whose two teams match nameA/nameB (in
// either order). Falls back to a "W97 vs W98"-style placeholder (using the
// feeder match numbers) if not found yet or if the team names aren't known.
function resolveMatch(pool, nameA, nameB, matchNumber, sourceA, sourceB) {
  if (nameA && nameB) {
    const found = pool.find((raw) => {
      const h = raw.homeTeam.name, a = raw.awayTeam.name;
      return (h === nameA && a === nameB) || (h === nameB && a === nameA);
    });
    if (found) return mapMatch(found, matchNumber);
  }
  return placeholderMatch(nameA, nameB, matchNumber, sourceA, sourceB);
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
    .map((raw, idx) => mapMatch(raw, 89 + idx)); // official FIFA match numbers 89-96

  if (round16.length !== 8) {
    console.warn(`Expected 8 Round-of-16 matches, found ${round16.length}. Bracket topology may be off until all 8 exist.`);
  }

  const QF_MATCH_NUMBERS = [97, 98, 99, 100]; // official numbers, in quadrant order

  const quadrants = QUADRANT_R16_PAIRS.map(([i, j], idx) => {
    const matchA = round16[i] || placeholderMatch(null, null, 89 + i);
    const matchB = round16[j] || placeholderMatch(null, null, 89 + j);
    const winnerA = getWinnerName(matchA);
    const winnerB = getWinnerName(matchB);
    const qf = resolveMatch(
      quarterRaw, winnerA, winnerB, QF_MATCH_NUMBERS[idx],
      `W${matchA.matchNumber}`, `W${matchB.matchNumber}`
    );
    return { r16: [matchA, matchB], qf };
  });

  const sf1 = resolveMatch(
    semiRaw, getWinnerName(quadrants[0].qf), getWinnerName(quadrants[1].qf), 101,
    `W${quadrants[0].qf.matchNumber}`, `W${quadrants[1].qf.matchNumber}`
  );
  const sf2 = resolveMatch(
    semiRaw, getWinnerName(quadrants[2].qf), getWinnerName(quadrants[3].qf), 102,
    `W${quadrants[2].qf.matchNumber}`, `W${quadrants[3].qf.matchNumber}`
  );

  const final = resolveMatch(
    finalRaw, getWinnerName(sf1), getWinnerName(sf2), 104,
    `W${sf1.matchNumber}`, `W${sf2.matchNumber}`
  );
  const thirdPlace = resolveMatch(
    thirdRaw, getLoserName(sf1), getLoserName(sf2), 103,
    `L${sf1.matchNumber}`, `L${sf2.matchNumber}`
  );

  const topScorers = await fetchTopScorers(4);

  const output = {
    updated_at: new Date().toISOString(),
    tournament: 'FIFA World Cup 2026',
    quadrants,
    semis: [sf1, sf2],
    final,
    third_place: thirdPlace,
    top_scorers: topScorers,
  };

  const outPath = path.join(__dirname, '..', 'data', 'bracket-data.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`Wrote ${outPath}. R16 matches found: ${round16.length}/8. Top scorers found: ${topScorers.length}.`);
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
