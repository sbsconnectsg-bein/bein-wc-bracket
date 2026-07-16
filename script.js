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
      <span class="boot-name">${s.name}</span>
      <span class="boot-team">${s.teamCode || s.team || ''}</span>
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
