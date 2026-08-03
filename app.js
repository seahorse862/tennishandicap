// --- PWA install: register the service worker so the app can be added to home screen ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

// Show the "add to home screen" hint only when not already installed
const isStandalone = window.matchMedia('(display-mode: standalone)').matches
  || window.navigator.standalone === true;
if (!isStandalone) {
  document.getElementById('install-hint').hidden = false;
}

// --- Populate handicap dropdowns from the rules engine ---
function populateSelect(select) {
  VALID_HANDICAPS.forEach((h) => {
    const opt = document.createElement('option');
    opt.value = h;
    opt.textContent = h;
    select.appendChild(opt);
  });
}

const p1Select = document.getElementById('p1');
const p2Select = document.getElementById('p2');
populateSelect(p1Select);
populateSelect(p2Select);
p1Select.value = 'Scratch';
p2Select.value = 'Scratch';

// --- Calculate ---
document.getElementById('calc-btn').addEventListener('click', () => {
  const h1 = p1Select.value;
  const h2 = p2Select.value;

  const resultEl = document.getElementById('result');
  const tbEl = document.getElementById('tiebreak-result');

  try {
    const gameScores = computeGameScores(h1, h2);
    const tb = computeTieBreak(h1, h2);

    resultEl.hidden = false;
    resultEl.innerHTML = `
      <div class="result-title">${h1} vs ${h2}</div>
      <table class="score-table">
        <tr><th>Game</th>${gameScores.games.map(g => `<th>${g.game}</th>`).join('')}</tr>
        <tr><td>P1</td>${gameScores.games.map(g => `<td>${g.p1}</td>`).join('')}</tr>
        <tr><td>P2</td>${gameScores.games.map(g => `<td>${g.p2}</td>`).join('')}</tr>
      </table>
    `;

    tbEl.hidden = false;
    const sign = (n) => (n > 0 ? `+${n}` : `${n}`);
    tbEl.innerHTML = `Tie-break starts at ${sign(tb.points1)} to ${sign(tb.points2)}<span class="tb-note">played to 7, win by 2</span>`;
  } catch (err) {
    resultEl.hidden = false;
    tbEl.hidden = true;
    resultEl.textContent = `Error: ${err.message}`;
  }
});
