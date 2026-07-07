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

function matchCard(match, { roundLabel, kind } = {}) {
  const tag = statusTag(match.status);
  const stageLabel = roundLabel || 'Round of 16';
  const headerText = tag.cls === 'live' ? 'LIVE' : stageLabel.toUpperCase();
  const num = match.matchNumber ? `Match ${match.matchNumber}` : '';
  const kindClass = `kind-${kind || 'r16'}`;
  return `
    <div class="match ${tag.cls === 'live' ? 'live' : ''} round-box ${kindClass}">
      <div class="card-header">
        <span class="status-tag ${tag.cls}">${headerText}</span>
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

function flippedConnector() {
  return `
    <div class="connector" style="transform: scaleY(-1);">
      <svg class="connector-svg" viewBox="0 0 100 36" preserveAspectRatio="none">
        <path d="M 15 0 L 15 18 L 50 18" />
        <path d="M 85 0 L 85 18 L 50 18" />
        <path d="M 50 18 L 50 36" />
      </svg>
    </div>`;
}

function wideConnector() {
  return `
    <div class="connector wide">
      <svg class="connector-svg" viewBox="0 0 100 36" preserveAspectRatio="none">
        <path d="M 25 0 L 25 18 L 50 18" />
        <path d="M 75 0 L 75 18 L 50 18" />
        <path d="M 50 18 L 50 36" />
      </svg>
    </div>`;
}

function qfCardWithArrow(qf, pointRight) {
  const card = matchCard(qf, { roundLabel: 'Quarter-final', kind: 'qf' });
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
    ${qfCardWithArrow(quadB.qf, pointRight)}
    ${flippedConnector()}
    <div class="feeder-pair">
      ${matchCard(quadB.r16[0])}
      ${matchCard(quadB.r16[1])}
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

  const finalTag = statusTag(final.status);
  const finalHeader = finalTag.cls === 'live' ? 'LIVE' : '🏆 2026 World Cup Final';
  const thirdTag = statusTag(thirdPlace.status);
  const thirdHeader = thirdTag.cls === 'live' ? 'LIVE' : '3rd-Place Match';

  el.innerHTML = `
    ${matchCard(sf1, { roundLabel: 'Semi-final 1', kind: 'sf' })}
    ${matchCard(sf2, { roundLabel: 'Semi-final 2', kind: 'sf' })}
    ${wideConnector()}
    <div class="match round-box kind-r16 ${thirdTag.cls === 'live' ? 'live' : ''}">
      <div class="card-header"><span>${thirdHeader}</span><span>Match ${thirdPlace.matchNumber || ''}</span></div>
      ${teamRow(thirdPlace.home, thirdPlace.away, thirdPlace.status)}
      ${teamRow(thirdPlace.away, thirdPlace.home, thirdPlace.status)}
      <div class="footer-line">${formatKickoffSGT(thirdPlace.kickoff)}</div>
    </div>
    ${connector()}
    <div class="match trophy-card ${finalTag.cls === 'live' ? 'live' : ''}">
      <div class="card-header"><span>${finalHeader}</span><span>Match ${final.matchNumber || ''}</span></div>
      ${teamRow(final.home, final.away, final.status)}
      ${teamRow(final.away, final.home, final.status)}
      <div class="footer-line">${formatKickoffSGT(final.kickoff)}</div>
      ${championName ? `<div class="champion">${championName}</div>` : ''}
    </div>
  `;
}

function renderTopScorers(scorers) {
  const el = document.getElementById('top-scorers');
  if (!el) return;
  if (!scorers || scorers.length === 0) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'flex';
  const items = scorers.slice(0, 3).map((s, i) => `
    <div class="ts-item">
      <span class="rank">${i + 1}</span>
      <span class="ts-name">${s.name}</span>
      <span class="ts-team">${s.teamCode || s.team || ''}</span>
      <span class="goals">${s.goals}⚽</span>
    </div>`).join('');
  el.innerHTML = `<div class="ts-label">🥾 Golden Boot</div><div class="ts-list">${items}</div>`;
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
    renderTopScorers(data.top_scorers);

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
