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

function teamRow(team, isWinner, decided) {
  const hasScore = team.score !== null && team.score !== undefined;
  const rowClass = decided ? (isWinner ? 'winner' : 'eliminated') : '';
  const code = team.code ? team.code : '—';
  const name = team.name || 'TBD';
  const score = hasScore ? team.score : '';
  return `
    <div class="row ${rowClass}">
      <div class="team"><span class="code">${code}</span><span class="name">${name}</span></div>
      <div class="score">${score}</div>
    </div>`;
}

// Knockout matches can be decided in extra time or a penalty shootout —
// this returns a short label to append next to the date. A shootout only
// ever happens after extra time also ends level, so we show both markers
// together ("AET, Pens 4-3") rather than just the shootout score alone,
// which would silently drop the fact 30 extra minutes were played first.
function resultNote(match) {
  if (match.duration === 'PENALTY_SHOOTOUT' && match.penalties) {
    return `AET, Pens ${match.penalties.home}-${match.penalties.away}`;
  }
  if (match.duration === 'EXTRA_TIME') return 'AET';
  return '';
}

// roundLabel: e.g. "Quarter-final", "Semi-final 1" — shown permanently as
// the card's header (defaults to "Round of 16" when not given), EXCEPT
// while a match is actually live, when "LIVE" temporarily takes its place.
// kind: 'qf' | 'sf' — accent color per stage; defaults to a neutral 'r16'.
function matchCard(match, { roundLabel, kind } = {}) {
  const tag = statusTag(match.status);
  const stageLabel = roundLabel || 'Round of 16';
  const headerText = tag.cls === 'live' ? 'LIVE' : stageLabel.toUpperCase();
  const num = match.matchNumber ? `Match ${match.matchNumber}` : '';
  const kindClass = `kind-${kind || 'r16'}`;
  const decided = FINISHED_STATUSES.has(match.status) && !!match.winner && match.winner !== 'DRAW';
  const note = resultNote(match);
  const footer = note
    ? `${formatKickoffSGT(match.kickoff)} &middot; ${note}`
    : formatKickoffSGT(match.kickoff);
  return `
    <div class="match ${tag.cls === 'live' ? 'live' : ''} round-box ${kindClass}">
      <div class="card-header">
        <span class="status-tag ${tag.cls}">${headerText}</span>
        <span>${num}</span>
      </div>
      ${teamRow(match.home, match.winner === 'HOME_TEAM', decided)}
      ${teamRow(match.away, match.winner === 'AWAY_TEAM', decided)}
      <div class="footer-line">${footer}</div>
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

// Same shape as connector(), but flipped vertically — used when the two
// feeder matches render BELOW the box they feed into instead of above it
// (as with QF98/QF100, whose R16 feeders are shown after them for layout
// reasons), so the merge line still correctly points into the result.
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
      ${matchCard(quadA.qf, { roundLabel: 'Quarter-final', kind: 'qf' })}
    </div>
    <div class="quadrant">
      ${matchCard(quadB.qf, { roundLabel: 'Quarter-final', kind: 'qf' })}
      ${flippedConnector()}
      <div class="feeder-pair">
        ${matchCard(quadB.r16[0])}
        ${matchCard(quadB.r16[1])}
      </div>
    </div>
  `;
}

function renderCenter(sf1, sf2, final, thirdPlace) {
  const el = document.getElementById('center-col');
  if (!el) return;

  const finalDecided = FINISHED_STATUSES.has(final.status) && !!final.winner && final.winner !== 'DRAW';
  const championName = finalDecided
    ? (final.winner === 'HOME_TEAM' ? final.home.name : final.away.name)
    : null;
  const thirdDecided = FINISHED_STATUSES.has(thirdPlace.status) && !!thirdPlace.winner && thirdPlace.winner !== 'DRAW';

  const finalTag = statusTag(final.status);
  const finalHeader = finalTag.cls === 'live' ? 'LIVE' : '🏆 2026 World Cup Final';
  const thirdTag = statusTag(thirdPlace.status);
  const thirdHeader = thirdTag.cls === 'live' ? 'LIVE' : '3rd-Place Match';

  const finalNote = resultNote(final);
  const finalFooter = finalNote ? `${formatKickoffSGT(final.kickoff)} &middot; ${finalNote}` : formatKickoffSGT(final.kickoff);
  const thirdNote = resultNote(thirdPlace);
  const thirdFooter = thirdNote ? `${formatKickoffSGT(thirdPlace.kickoff)} &middot; ${thirdNote}` : formatKickoffSGT(thirdPlace.kickoff);

  el.innerHTML = `
    ${matchCard(sf1, { roundLabel: 'Semi-final 1', kind: 'sf' })}
    ${matchCard(sf2, { roundLabel: 'Semi-final 2', kind: 'sf' })}
    ${wideConnector()}
    <div class="match round-box kind-r16 ${thirdTag.cls === 'live' ? 'live' : ''}">
      <div class="card-header"><span>${thirdHeader}</span><span>Match ${thirdPlace.matchNumber || ''}</span></div>
      ${teamRow(thirdPlace.home, thirdPlace.winner === 'HOME_TEAM', thirdDecided)}
      ${teamRow(thirdPlace.away, thirdPlace.winner === 'AWAY_TEAM', thirdDecided)}
      <div class="footer-line">${thirdFooter}</div>
    </div>
    ${connector()}
    <div class="match trophy-card ${finalTag.cls === 'live' ? 'live' : ''}">
      <div class="card-header"><span>${finalHeader}</span><span>Match ${final.matchNumber || ''}</span></div>
      ${teamRow(final.home, final.winner === 'HOME_TEAM', finalDecided)}
      ${teamRow(final.away, final.winner === 'AWAY_TEAM', finalDecided)}
      <div class="footer-line">${finalFooter}</div>
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
  const items = scorers.slice(0, 4).map((s, i) => `
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
