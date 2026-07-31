(() => {
  "use strict";

  function enforce() {
    if (location.hash.includes('/preview/full-report')) return;
    const shell = document.querySelector('.lc-v3-shell');
    if (!shell) return;
    const old = document.querySelector('.lc-v2-summary');
    const original = document.querySelector('.lemoncheck-decision-section');
    const map = document.querySelector('.report-overview-section');
    if (old) old.hidden = true;
    if (original && !original.classList.contains('is-open')) original.hidden = true;
    if (map && shell.nextElementSibling !== map) shell.insertAdjacentElement('afterend', map);
  }

  window.addEventListener('lemoncheck:ux-v3-ready', () => setTimeout(enforce, 0));
  window.addEventListener('hashchange', () => setTimeout(enforce, 100));
  setInterval(enforce, 200);
  setTimeout(enforce, 0);
})();
