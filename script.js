const DATA_URL = 'data/bracket-data.json';
const POLL_MS = 5 * 60 * 1000;

const LIVE_STATUSES = new Set(['IN_PLAY', 'PAUSED']);
const FINISHED_STATUSES = new Set(['FINISHED']);

function formatKickoffSGT(iso) {
  if (!iso) return 'Date TBC';
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Singapore',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  return `${parts} SGT`;
}

function teamRow(team, opponent, status) {
  const hasScore = team.score !== null && team.score !== undefined;
  const decided = FINISHED_STATUSES.has(status) && hasScore && opponent && opponent.score !== null;
  let rowClass = '';
  if (decided) rowClass = team.score > opponent.score ? 'winner' : 'eliminated';
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

function matchCard(match, { compact } = {}) {
  const isLive = LIVE_STATUSES.has(match.status);
  return `
    <div class="match ${isLive ? 'live' : ''} ${compact ? 'compact' : ''}">
      <div class="meta">${formatKickoffSGT(match.kickoff)}</div>
      ${isLive ? '<div class="live-tag"><span class="dot"></span>LIVE</div>' : ''}
      ${teamRow(match.home, match.away, match.status)}
      ${teamRow(match.away, match.home, match.status)}
    </div>`;
}

function renderQuadrant(quadrant, label) {
  return `
    <div class="quadrant">
      <div class="feeder-pair">
        ${matchCard(quadrant.r16[0], { compact: true })}
        ${matchCard(quadrant.r16[1], { compact: true })}
      </div>
      <div class="connector">
        <div class="connector-line"></div>
        <div class="connector-label">${label}</div>
      </div>
      ${matchCard(quadrant.qf)}
    </div>`;
}

function renderSemiGroup(elId, quadA, quadB, semiMatch, semiLabel) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = `
    ${renderQuadrant(quadA, 'Quarter-final')}
    ${renderQuadrant(quadB, 'Quarter-final')}
    <div class="connector">
      <div class="connector-line"></div>
      <div class="connector-label">${semiLabel}</div>
    </div>
    ${matchCard(semiMatch)}
  `;
}

function renderFinal(finalMatch, thirdPlaceMatch) {
  const el = document.getElementById('final-block');
  if (!el || !finalMatch) return;

  const decided = FINISHED_STATUSES.has(finalMatch.status) &&
    finalMatch.home.score !== null && finalMatch.away.score !== null;
  let championName = null;
  if (decided) {
    championName = finalMatch.home.score > finalMatch.away.score ? finalMatch.home.name : finalMatch.away.name;
  }

  el.innerHTML = `
    <div class="connector">
      <div class="connector-line"></div>
      <div class="connector-label">Final</div>
    </div>
    <div class="trophy-card">
      <div class="label">${formatKickoffSGT(finalMatch.kickoff)}</div>
      <div class="final-teams">
        ${teamRow(finalMatch.home, finalMatch.away, finalMatch.status)}
        ${teamRow(finalMatch.away, finalMatch.home, finalMatch.status)}
      </div>
      ${championName ? `<div class="champion">🏆 ${championName}</div>` : ''}
    </div>
    ${thirdPlaceMatch ? `
      <div class="third-place-note">
        3rd place (${formatKickoffSGT(thirdPlaceMatch.kickoff)}): 
        <b>${thirdPlaceMatch.home.name || 'TBD'}</b> vs <b>${thirdPlaceMatch.away.name || 'TBD'}</b>
      </div>` : ''}
  `;
}

function updateClock() {
  const clockEl = document.getElementById('clock');
  if (!clockEl) return;
  const now = new Date();
  clockEl.textContent = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now) + ' SGT';
}

async function loadBracket() {
  try {
    const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const q = data.quadrants || [];
    if (q.length === 4) {
      renderSemiGroup('semi-group-1', q[0], q[1], data.semis[0], 'Semi-final 1');
      renderSemiGroup('semi-group-2', q[2], q[3], data.semis[1], 'Semi-final 2');
    }
    renderFinal(data.final, data.third_place);

    const updatedEl = document.getElementById('updated-at');
    if (updatedEl && data.updated_at) {
      updatedEl.innerHTML = `<span class="dot"></span>Updated ${formatKickoffSGT(data.updated_at)}`;
    }
  } catch (err) {
    console.error('Failed to load bracket data:', err);
  }
}

updateClock();
setInterval(updateClock, 30 * 1000);
loadBracket();
setInterval(loadBracket, POLL_MS);
