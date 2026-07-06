/**
 * Pulls FIFA World Cup 2026 fixtures from API-Football and writes
 * data/bracket-data.json in the shape the bracket page expects.
 *
 * Requires an env var API_FOOTBALL_KEY (set as a GitHub Actions secret).
 *
 * League ID 1 = FIFA World Cup, Season 2026, per API-Football's dashboard.
 */

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.API_FOOTBALL_KEY;
const LEAGUE_ID = 1;
const SEASON = 2026;

// Sign up directly at https://dashboard.api-football.com/register (free).
// This uses api-sports.io's own auth, not RapidAPI — their RapidAPI listing
// is no longer live, so this is the current supported path.
const BASE_URL = 'https://v3.football.api-sports.io';

// Maps API-Football's round names to our bracket buckets.
// If API-Football phrases a round slightly differently for this tournament,
// adjust the matching strings here.
const ROUND_MAP = [
  { key: 'round_16', match: (r) => /round of 16/i.test(r) },
  { key: 'quarter_finals', match: (r) => /quarter/i.test(r) },
  { key: 'semi_finals', match: (r) => /semi/i.test(r) },
  { key: 'third_place', match: (r) => /3rd place|third place/i.test(r) },
  { key: 'final', match: (r) => /^final$/i.test(r.trim()) },
];

async function fetchFixtures() {
  const url = `${BASE_URL}/fixtures?league=${LEAGUE_ID}&season=${SEASON}`;
  const res = await fetch(url, {
    headers: { 'x-apisports-key': API_KEY },
  });
  if (!res.ok) {
    throw new Error(`API-Football request failed: HTTP ${res.status}`);
  }
  const json = await res.json();
  if (json.errors && Object.keys(json.errors).length) {
    throw new Error(`API-Football error: ${JSON.stringify(json.errors)}`);
  }
  return json.response || [];
}

function mapFixture(fixture) {
  const home = fixture.teams.home;
  const away = fixture.teams.away;
  return {
    id: String(fixture.fixture.id),
    date: new Date(fixture.fixture.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    status: fixture.fixture.status.short, // NS, 1H, HT, 2H, FT, AET, PEN, etc.
    home: {
      name: home.name,
      code: (home.name || '').slice(0, 3).toUpperCase(),
      score: fixture.goals.home,
    },
    away: {
      name: away.name,
      code: (away.name || '').slice(0, 3).toUpperCase(),
      score: fixture.goals.away,
    },
  };
}

async function main() {
  if (!API_KEY) {
    throw new Error('Missing API_FOOTBALL_KEY environment variable.');
  }

  const fixtures = await fetchFixtures();

  const rounds = {
    round_16: [],
    quarter_finals: [],
    semi_finals: [],
    third_place: [],
    final: [],
  };

  for (const fixture of fixtures) {
    const roundName = fixture.league.round || '';
    const bucket = ROUND_MAP.find((r) => r.match(roundName));
    if (bucket) {
      rounds[bucket.key].push(mapFixture(fixture));
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
