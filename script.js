const DATA_URL = 'data/bracket-data.json';
// How often the page checks for new data, in milliseconds.
// Keep this modest — GitHub Pages + Actions won't update more than every ~15 min anyway.
const POLL_MS = 5 * 60 * 1000;

const LIVE_STATUSES = new Set(['IN_PLAY', 'PAUSED', 'LIVE']);
const FINISHED_STATUSES = new Set(['FINISHED']);

function teamRow(team, opponent, status) {
  const hasScore = team.score !== null && team.score !== undefined;
  const decided = FINISHED_STATUSES.has(status) && hasScore && opponent && opponent.score !== null;
  let rowClass = '';
  if (decided) {
    rowClass = team.score > opponent.score ? 'winner' : 'eliminated';
  }
  const code = team.code ? team.code : '—';
  const name = team.name || 'TBD';
  const score = hasScore ? team.score : '';
  return `
    <div class="row ${rowClass}">
      <div class="team">
        <span class="code">${code}</span>
        <span class="name">${name}</span>
      </div>
      <div class="score">${score}</div>
    </div>`;
}

function matchCard(match) {
  const isLive = LIVE_STATUSES.has(match.status);
  return `
    <div class="match ${isLive ? 'live' : ''}">
      <div class="meta">${match.date || ''}</div>
      ${isLive ? '<div class="live-tag"><span class="dot"></span>LIVE</div>' : ''}
      ${teamRow(match.home, match.away, match.status)}
      ${teamRow(match.away, match.home, match.status)}
    </div>`;
}

function renderColumn(elId, matches) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = matches.map(matchCard).join('');
}

function renderFinal(finalMatch, thirdPlaceMatch) {
  const el = document.getElementById('final-col');
  if (!el || !finalMatch) return;

  const decided = FINISHED_STATUSES.has(finalMatch.status) &&
    finalMatch.home.score !== null && finalMatch.away.score !== null;
  let championName = null;
  if (decided) {
    championName = finalMatch.home.score > finalMatch.away.score
      ? finalMatch.home.name
      : finalMatch.away.name;
  }

  const thirdLine = thirdPlaceMatch
    ? `<div class="third-place-note">3rd place: <b>${thirdPlaceMatch.home.name || 'TBD'}</b> vs <b>${thirdPlaceMatch.away.name || 'TBD'}</b></div>`
    : '';

  el.innerHTML = `
    <div class="trophy-card">
      <div class="label">Final &middot; ${finalMatch.date || ''}</div>
      <div class="final-teams">
        ${teamRow(finalMatch.home, finalMatch.away, finalMatch.status)}
        ${teamRow(finalMatch.away, finalMatch.home, finalMatch.status)}
      </div>
      ${championName ? `<div class="champion">🏆 ${championName}</div>` : ''}
    </div>
    ${thirdLine}
  `;
}

function updateClock() {
  const clockEl = document.getElementById('clock');
  if (!clockEl) return;
  const now = new Date();
  clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function loadBracket() {
  try {
    const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    renderColumn('r16-col', data.rounds.round_16 || []);
    renderColumn('qf-col', data.rounds.quarter_finals || []);
    renderColumn('sf-col', data.rounds.semi_finals || []);
    renderFinal(
      (data.rounds.final || [])[0],
      (data.rounds.third_place || [])[0]
    );

    const updatedEl = document.getElementById('updated-at');
    if (updatedEl && data.updated_at) {
      const d = new Date(data.updated_at);
      updatedEl.innerHTML = `<span class="dot"></span>Updated ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
  } catch (err) {
    console.error('Failed to load bracket data:', err);
  }
}

updateClock();
setInterval(updateClock, 30 * 1000);
loadBracket();
setInterval(loadBracket, POLL_MS);
