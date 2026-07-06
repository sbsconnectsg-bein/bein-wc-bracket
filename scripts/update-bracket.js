/**
 * Pulls FIFA World Cup 2026 fixtures from football-data.org and writes
 * data/bracket-data.json in the shape the bracket page expects.
 *
 * Requires an env var API_FOOTBALL_KEY (set as a GitHub Actions secret) —
 * the name is kept from an earlier version of this script, but the value
 * should be your football-data.org token (see README step 1).
 *
 * football-data.org's free tier explicitly includes the World Cup
 * (competition code "WC"), unlike some other providers' free tiers which
 * only cover older seasons. Rate limit: 10 requests/minute.
 */

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.API_FOOTBALL_KEY;
const COMPETITION_CODE = 'WC'; // football-data.org's code for the World Cup
const BASE_URL = 'https://api.football-data.org/v4';

// Maps football-data.org's "stage" field to our bracket buckets.
// Written as loose regex matches since different tournaments on this API
// have used slightly different stage naming (e.g. LAST_16 vs ROUND_OF_16).
const STAGE_MAP = [
  { key: 'round_16', match: (s) => /LAST_16|ROUND_OF_16/i.test(s) },
  { key: 'quarter_finals', match: (s) => /QUARTER/i.test(s) },
  { key: 'semi_finals', match: (s) => /SEMI/i.test(s) },
  { key: 'third_place', match: (s) => /THIRD/i.test(s) },
  { key: 'final', match: (s) => /^FINAL$/i.test(s.trim()) },
];

async function fetchMatches() {
  const url = `${BASE_URL}/competitions/${COMPETITION_CODE}/matches`;
  const res = await fetch(url, {
    headers: { 'X-Auth-Token': API_KEY },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`football-data.org request failed: HTTP ${res.status} ${body}`);
  }
  const json = await res.json();
  return json.matches || [];
}

function mapMatch(match) {
  return {
    id: String(match.id),
    date: new Date(match.utcDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    status: match.status, // SCHEDULED, TIMED, IN_PLAY, PAUSED, FINISHED, POSTPONED, SUSPENDED, CANCELLED
    home: {
      name: match.homeTeam.name || 'TBD',
      code: match.homeTeam.tla || (match.homeTeam.name || '').slice(0, 3).toUpperCase() || null,
      score: match.score && match.score.fullTime ? match.score.fullTime.home : null,
    },
    away: {
      name: match.awayTeam.name || 'TBD',
      code: match.awayTeam.tla || (match.awayTeam.name || '').slice(0, 3).toUpperCase() || null,
      score: match.score && match.score.fullTime ? match.score.fullTime.away : null,
    },
  };
}

async function main() {
  if (!API_KEY) {
    throw new Error('Missing API_FOOTBALL_KEY environment variable (should hold your football-data.org token).');
  }

  const matches = await fetchMatches();

  const rounds = {
    round_16: [],
    quarter_finals: [],
    semi_finals: [],
    third_place: [],
    final: [],
  };

  for (const match of matches) {
    const stage = match.stage || '';
    const bucket = STAGE_MAP.find((r) => r.match(stage));
    if (bucket) {
      rounds[bucket.key].push(mapMatch(match));
    }
  }

  // Keep fixtures in kickoff order within each round.
  for (const key of Object.keys(rounds)) {
    rounds[key].sort((a, b) => (a.id > b.id ? 1 : -1));
  }

  const output = {
    updated_at: new Date().toISOString(),
    tournament: 'FIFA World Cup 2026',
    rounds,
  };

  const outPath = path.join(__dirname, '..', 'data', 'bracket-data.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`Wrote ${outPath} with:`, Object.fromEntries(
    Object.entries(rounds).map(([k, v]) => [k, v.length])
  ));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
