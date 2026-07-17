const DATA_URL = 'data/bracket-data.json';

function formatSGT(iso, opts = {}) {
  if (!iso) return 'Date TBC';
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Singapore',
    weekday: opts.weekday ? 'long' : undefined,
    day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
  return `${parts} SGT`;
}

function updateClock() {
  const el = document.getElementById('clock');
  if (!el) return;
  el.textContent = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date()) + ' SGT';
}

const LIVE_STATUSES = new Set(['IN_PLAY', 'PAUSED']);
const NOT_YET_DECIDED_STATUSES = new Set(['SCHEDULED', 'TIMED', 'IN_PLAY', 'PAUSED', 'POSTPONED', 'SUSPENDED', 'CANCELLED']);

// Flags as hand-built inline SVG rather than Unicode flag emoji — the
// signage hardware has no emoji font installed (the same issue that broke
// the trophy/boot/ball icons before they were replaced with SVGs), and
// regional-indicator flag emoji are even more likely to fail than a simple
// pictograph. SVG renders identically everywhere, no font needed, and
// unlike plain CSS color stripes (a first pass at this, since replaced) can
// actually draw crosses and other real patterns — a solid color block for
// England or Switzerland doesn't read as those flags at all.
// Shared viewBox "0 0 30 20" (3:2 ratio). Simplified — emblems/seals
// omitted where they'd be illegible at this size, but stripe/cross
// geometry is accurate.
const FLAG_SVG = {
  'Canada': '<rect width="30" height="20" fill="#fff"/><rect width="7.5" height="20" fill="#D80621"/><rect x="22.5" width="7.5" height="20" fill="#D80621"/><path d="M15 5l1.2 2.6 2.6-1.2-0.9 2.7 2.6 0.9-2.6 0.9 0.9 2.7-2.6-1.2L15 15l-1.2-2.6-2.6 1.2 0.9-2.7-2.6-0.9 2.6-0.9-0.9-2.7 2.6 1.2z" fill="#D80621"/>',
  'Morocco': '<rect width="30" height="20" fill="#C1272D"/><path d="M15 7l1 2.4 2.6.1-2.1 1.6.8 2.5-2.3-1.5-2.3 1.5.8-2.5-2.1-1.6 2.6-.1z" fill="none" stroke="#006233" stroke-width="0.8"/>',
  'Paraguay': '<rect width="30" height="20" fill="#D52B1E"/><rect y="6.67" width="30" height="6.67" fill="#fff"/><rect y="13.33" width="30" height="6.67" fill="#0038A8"/>',
  'France': '<rect width="30" height="20" fill="#fff"/><rect width="10" height="20" fill="#0055A4"/><rect x="20" width="10" height="20" fill="#EF4135"/>',
  'Portugal': '<rect width="30" height="20" fill="#DA291C"/><rect width="12" height="20" fill="#046A38"/>',
  'Spain': '<rect width="30" height="20" fill="#AA151B"/><rect y="5" width="30" height="10" fill="#F1BF00"/>',
  'United States': '<rect width="30" height="20" fill="#fff"/><rect y="0" width="30" height="1.54" fill="#B22234"/><rect y="3.08" width="30" height="1.54" fill="#B22234"/><rect y="6.15" width="30" height="1.54" fill="#B22234"/><rect y="9.23" width="30" height="1.54" fill="#B22234"/><rect y="12.3" width="30" height="1.54" fill="#B22234"/><rect y="15.4" width="30" height="1.54" fill="#B22234"/><rect y="18.5" width="30" height="1.54" fill="#B22234"/><rect width="13" height="10.8" fill="#3C3B6E"/>',
  'Belgium': '<rect width="30" height="20" fill="#ED2939"/><rect width="10" height="20" fill="#000"/><rect x="10" width="10" height="20" fill="#FAE042"/>',
  'Brazil': '<rect width="30" height="20" fill="#009739"/><path d="M15 3 27 10 15 17 3 10z" fill="#FEDD00"/><circle cx="15" cy="10" r="4.2" fill="#012169"/>',
  'Norway': '<rect width="30" height="20" fill="#EF2B2D"/><rect x="9" width="4" height="20" fill="#fff"/><rect y="8" width="30" height="4" fill="#fff"/><rect x="10" width="2" height="20" fill="#002868"/><rect y="9" width="30" height="2" fill="#002868"/>',
  'Mexico': '<rect width="30" height="20" fill="#fff"/><rect width="10" height="20" fill="#006847"/><rect x="20" width="10" height="20" fill="#CE1126"/>',
  'England': '<rect width="30" height="20" fill="#fff"/><rect x="12.5" width="5" height="20" fill="#CE1124"/><rect y="7.5" width="30" height="5" fill="#CE1124"/>',
  'Argentina': '<rect width="30" height="20" fill="#fff"/><rect width="30" height="6.67" fill="#75AADB"/><rect y="13.33" width="30" height="6.67" fill="#75AADB"/><circle cx="15" cy="10" r="2" fill="#F6B40E" stroke="#85340A" stroke-width="0.3"/>',
  'Egypt': '<rect width="30" height="20" fill="#fff"/><rect width="30" height="6.67" fill="#CE1126"/><rect y="13.33" width="30" height="6.67" fill="#000"/>',
  'Switzerland': '<rect width="30" height="20" fill="#D52B1E"/><rect x="12" y="6" width="6" height="8" fill="#fff"/><rect x="9" y="9" width="12" height="2" fill="#fff"/>',
  'Colombia': '<rect width="30" height="20" fill="#CE1126"/><rect width="30" height="15" fill="#003893"/><rect width="30" height="10" fill="#FCD116"/>',
};
FLAG_SVG['USA'] = FLAG_SVG['United States'];

function flagBadge(teamName, size) {
  const inner = FLAG_SVG[teamName];
  if (!inner) return `<span class="flag flag-${size}" style="background:#555;"></span>`;
  return `<svg class="flag flag-${size}" viewBox="0 0 30 20" preserveAspectRatio="xMidYMid slice">${inner}</svg>`;
}

function resultNote(match) {
  if (match.duration === 'EXTRA_TIME') return 'AET';
  if (match.duration === 'PENALTY_SHOOTOUT') return 'AET &middot; Penalties';
  return '';
}

function heroTeamRow(team, isWinner, decided, pkCount) {
  const hasScore = team.score !== null && team.score !== undefined;
  const rowClass = decided ? (isWinner ? 'winner' : 'eliminated') : '';
  const pk = (pkCount !== null && pkCount !== undefined) ? `<span class="pk">(${pkCount})</span>` : '';
  return `
    <div class="hero-row ${rowClass}">
      ${flagBadge(team.name, 'lg')}
      <span class="hero-code">${team.code || '—'}</span>
      <span class="hero-name">${team.name || 'TBD'}</span>
      <span class="hero-score">${pk}${hasScore ? team.score : ''}</span>
    </div>`;
}

function renderFinalHero(final) {
  const el = document.getElementById('final-hero');
  if (!el || !final) return;
  const isLive = LIVE_STATUSES.has(final.status);
  const decided = !!final.winner && final.winner !== 'DRAW' && !NOT_YET_DECIDED_STATUSES.has(final.status);
  const championName = decided ? (final.winner === 'HOME_TEAM' ? final.home.name : final.away.name) : null;
  const note = resultNote(final);
  const pkHome = final.duration === 'PENALTY_SHOOTOUT' && final.penalties ? final.penalties.home : null;
  const pkAway = final.duration === 'PENALTY_SHOOTOUT' && final.penalties ? final.penalties.away : null;

  el.innerHTML = `
    <div class="final-label">
      <svg class="icon-trophy" viewBox="0 0 24 24"><path d="M6 3h12v2h3v3a4 4 0 0 1-4 4h-.1a6 6 0 0 1-3.9 3.86V18h3v2H8v-2h3v-2.14A6 6 0 0 1 7.1 12H7a4 4 0 0 1-4-4V5h3V3zm0 4H5v1a2 2 0 0 0 2 2V7zm12 0v3a2 2 0 0 0 2-2V7h-2z"/></svg>
      ${isLive ? '<span class="live-badge">LIVE</span>' : '2026 World Cup Final'}
    </div>
    <div class="final-teams">
      ${heroTeamRow(final.home, final.winner === 'HOME_TEAM', decided, pkHome)}
      <div class="final-vs">VS</div>
      ${heroTeamRow(final.away, final.winner === 'AWAY_TEAM', decided, pkAway)}
    </div>
    <div class="final-meta">
      ${formatSGT(final.kickoff, { weekday: true })}${note ? ' &middot; ' + note : ''} &middot; Match ${final.matchNumber}
    </div>
    ${championName ? `<div class="champion-banner">🏆 ${championName} ARE WORLD CHAMPIONS</div>` : ''}
  `;
}

function renderThirdHero(third) {
  const el = document.getElementById('third-hero');
  if (!el || !third) return;
  const isLive = LIVE_STATUSES.has(third.status);
  const decided = !!third.winner && third.winner !== 'DRAW' && !NOT_YET_DECIDED_STATUSES.has(third.status);
  const note = resultNote(third);
  const pkHome = third.duration === 'PENALTY_SHOOTOUT' && third.penalties ? third.penalties.home : null;
  const pkAway = third.duration === 'PENALTY_SHOOTOUT' && third.penalties ? third.penalties.away : null;

  el.innerHTML = `
    <div class="third-label">${isLive ? '<span class="live-badge">LIVE</span>' : '3rd-Place Match'}</div>
    <div class="third-teams">
      ${heroTeamRow(third.home, third.winner === 'HOME_TEAM', decided, pkHome)}
      <div class="third-vs">VS</div>
      ${heroTeamRow(third.away, third.winner === 'AWAY_TEAM', decided, pkAway)}
    </div>
    <div class="third-meta">
      ${formatSGT(third.kickoff, { weekday: true })}${note ? ' &middot; ' + note : ''} &middot; Match ${third.matchNumber}
    </div>
  `;
}

function renderBoot(scorers) {
  const el = document.getElementById('boot-section');
  if (!el) return;
  if (!scorers || scorers.length === 0) { el.style.display = 'none'; return; }
  const rows = scorers.slice(0, 5).map((s, i) => `
    <div class="boot-row ${i === 0 ? 'boot-1' : ''}">
      <span class="boot-rank">${i + 1}</span>
      ${flagBadge(s.team, 'sm')}
      <span class="boot-name">${s.name}</span>
      <span class="boot-team">${s.team || ''}</span>
      <span class="boot-goals">${s.goals}</span>
    </div>`).join('');
  el.innerHTML = `
    <div class="boot-title">
      <svg class="icon-boot" viewBox="0 0 24 24"><path d="M5 3h5v6.5l3.5 2c1.5.9 3.5 1.5 5.5 1.5h1c1.5 0 2.5 1.2 2.5 2.5V19H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="currentColor"/></svg>
      Golden Boot
    </div>
    <div class="boot-list">${rows}</div>
  `;
}

async function load() {
  try {
    const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
    const data = await res.json();
    renderFinalHero(data.final);
    renderThirdHero(data.third_place);
    renderBoot(data.top_scorers);
    const updatedEl = document.getElementById('updated-at');
    if (updatedEl && data.updated_at) {
      updatedEl.innerHTML = `<span class="dot"></span>Updated ${formatSGT(data.updated_at)}`;
    }
  } catch (err) {
    console.error('Failed to load bracket data:', err);
  }
}

updateClock();
setInterval(updateClock, 30 * 1000);
load();
setInterval(load, 5 * 60 * 1000);
