const DATA_URL = 'data/bracket-data.json';
const LIVE_STATUSES = new Set(['IN_PLAY', 'PAUSED']);
const FINISHED_STATUSES = new Set(['FINISHED']);

function formatKickoffSGT(iso) {
  if (!iso) return 'Date TBC';
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Singapore', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
  return `${parts} SGT`;
}

function statusTag(status) {
  if (FINISHED_STATUSES.has(status)) return { text: 'FT', cls: 'finished' };
  if (LIVE_STATUSES.has(status)) return { text: 'LIVE', cls: 'live' };
  return { text: 'UPCOMING', cls: 'upcoming' };
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
      <div class="team"><span class="code">${code}</span><span class="name">${name}</span></div>
      <div class="score">${score}</div>
    </div>`;
}

// roundLabel: e.g. "Quarter-final", "Semi-final 1" — shown as the card's
// header (like the reference) instead of floating on a connector line.
function matchCard(match, { roundLabel } = {}) {
  const tag = statusTag(match.status);
  const num = match.matchNumber ? `Match ${match.matchNumber}` : '';
  return `
    <div class="match ${tag.cls === 'live' ? 'live' : ''} ${roundLabel ? 'round-box' : ''}">
      <div class="card-header">
        <span class="status-tag ${tag.cls}">${roundLabel ? roundLabel.toUpperCase() : tag.text}</span>
        <span>${num}</span>
      </div>
      ${teamRow(match.home, match.away, match.status)}
      ${teamRow(match.away, match.home, match.status)}
      <div class="footer-line">${formatKickoffSGT(match.kickoff)}</div>
    </div>`;
}

function updateClock() {
  const clockEl = document.getElementById('clock');
  if (!clockEl) return;
  const now = new Date();
  clockEl.textContent = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now) + ' SGT';
}

async function fetchBracketData() {
  const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function connector() {
  return `
    <div class="connector">
      <svg class="connector-svg" viewBox="0 0 100 36" preserveAspectRatio="none">
        <path d="M 15 0 L 15 18 L 50 18" />
        <path d="M 85 0 L 85 18 L 50 18" />
        <path d="M 50 18 L 50 36" />
      </svg>
    </div>`;
}

function qfCardWithArrow(qf, pointRight) {
  // Wrap the QF match card so we can position a directional arrow badge on it,
  // indicating it advances into the Semi-final in the center column.
  const card = matchCard(qf, { roundLabel: 'Quarter-final' });
  const arrow = `<span class="advance-arrow">${pointRight ? '→' : '←'}</span>`;
  return `<div style="position:relative;">${card}${arrow}</div>`;
}

function renderSideColumn(elId, quadA, quadB, pointRight) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = `
    <div class="quadrant">
      <div class="feeder-pair">
        ${matchCard(quadA.r16[0])}
        ${matchCard(quadA.r16[1])}
      </div>
      ${connector()}
      ${qfCardWithArrow(quadA.qf, pointRight)}
    </div>
    <div class="quadrant">
      <div class="feeder-pair">
        ${matchCard(quadB.r16[0])}
        ${matchCard(quadB.r16[1])}
      </div>
      ${connector()}
      ${qfCardWithArrow(quadB.qf, pointRight)}
    </div>
  `;
}

function renderCenter(sf1, sf2, final, thirdPlace) {
  const el = document.getElementById('center-col');
  if (!el) return;

  const decided = FINISHED_STATUSES.has(final.status) && final.home.score !== null && final.away.score !== null;
  const championName = decided
    ? (final.home.score > final.away.score ? final.home.name : final.away.name)
    : null;

  el.innerHTML = `
    ${matchCard(sf1, { roundLabel: 'Semi-final 1' })}
    ${connector()}
    <div class="match trophy-card">
      <div class="card-header"><span>🏆 2026 World Cup Final</span><span>Match ${final.matchNumber || ''}</span></div>
      ${teamRow(final.home, final.away, final.status)}
      ${teamRow(final.away, final.home, final.status)}
      <div class="footer-line">${formatKickoffSGT(final.kickoff)}</div>
      ${championName ? `<div class="champion">${championName}</div>` : ''}
    </div>
    <div class="connector" style="transform: scaleY(-1);">
      <svg class="connector-svg" viewBox="0 0 100 36" preserveAspectRatio="none">
        <path d="M 50 0 L 50 36" />
      </svg>
    </div>
    <div class="match">
      <div class="card-header"><span>3rd-Place Match</span><span>Match ${thirdPlace.matchNumber || ''}</span></div>
      ${teamRow(thirdPlace.home, thirdPlace.away, thirdPlace.status)}
      ${teamRow(thirdPlace.away, thirdPlace.home, thirdPlace.status)}
      <div class="footer-line">${formatKickoffSGT(thirdPlace.kickoff)}</div>
    </div>
    ${matchCard(sf2, { roundLabel: 'Semi-final 2' })}
  `;
}

async function loadBracket() {
  try {
    const data = await fetchBracketData();
    const q = data.quadrants || [];
    if (q.length === 4) {
      renderSideColumn('side-left', q[0], q[1], true);
      renderSideColumn('side-right', q[2], q[3], false);
    }
    renderCenter(data.semis[0], data.semis[1], data.final, data.third_place);

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
setInterval(loadBracket, 5 * 60 * 1000);
