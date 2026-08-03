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

// --- Placeholder calculate action (real handicap rules get wired in next step) ---
document.getElementById('calc-btn').addEventListener('click', () => {
  const p1 = document.getElementById('p1').value || 'Scratch';
  const p2 = document.getElementById('p2').value || 'Scratch';
  const result = document.getElementById('result');
  result.hidden = false;
  result.textContent = `${p1}  vs  ${p2} — logic coming next`;
});
