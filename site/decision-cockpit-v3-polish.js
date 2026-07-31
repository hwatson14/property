(() => {
  "use strict";

  const VERSION = "LC-UX-v0.3.1";
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  const GAP_COPY = {
    "Building and pest evidence": ["Building condition is unchecked", "Structural, moisture, termite and maintenance costs remain unknown.", "Order a current building and pest inspection."],
    "Contract, approvals and title review": ["Legal and approval checks are missing", "Ownership, easements, unapproved works and contract risks are not confirmed.", "Ask a conveyancer to review the contract, title and approvals."],
    "Market value and comparable sales": ["Price has not been assessed", "LemonCheck cannot yet say whether the asking price represents value.", "Treat price and Deal Score as pending."],
    "Insurance availability and terms": ["Insurance is unchecked", "Mapped screening does not confirm that cover is available or affordable.", "Obtain an address-specific insurance quote."],
  };

  function replaceThirdFindingWithGap(shell) {
    if (shell.querySelector('.lc-v3-finding-unknown')) return;
    const gap = (window.LEMONCHECK_ASSESSMENT?.confidence?.gaps || []).find((item) => GAP_COPY[item]);
    const card = shell.querySelector('.lc-v3-finding:last-child');
    if (!gap || !card) return;
    const [title, consequence, action] = GAP_COPY[gap];
    card.className = 'lc-v3-finding lc-v3-finding-unknown';
    card.innerHTML = `<b>3</b><div><h4>${escapeHtml(title)}</h4><p>${escapeHtml(consequence)}</p><small><strong>Next:</strong> ${escapeHtml(action)}</small></div>`;
  }

  function replaceBrand() {
    [...document.querySelectorAll('body *')].forEach((node) => {
      if (node.children.length === 0 && node.textContent?.trim() === 'Property Check') node.textContent = 'LemonCheck';
    });
  }

  function hideRedundantEnding() {
    const leaf = [...document.querySelectorAll('body *')].find((node) => node.children.length === 0 && /Check another Brisbane address\.?/i.test(node.textContent || ''));
    let node = leaf;
    while (node && node !== document.body) {
      if (/Check another Brisbane address/i.test(node.textContent || '') && node.querySelector('a,button')) {
        node.classList.add('lc-v3-hide-next-section');
        break;
      }
      node = node.parentElement;
    }
  }

  function patch() {
    if (location.hash.includes('/preview/full-report')) return;
    const shell = document.querySelector('.lc-v3-shell');
    const container = shell?.querySelector('[data-ux-version]');
    if (!shell || !container) return;

    shell.querySelector('[data-v3-lens="lemon"]')?.remove();
    shell.querySelector('[data-v3-lens="confidence"]')?.remove();
    replaceThirdFindingWithGap(shell);
    replaceBrand();
    hideRedundantEnding();
    document.documentElement.classList.add('lc-v3-polished');
    container.dataset.uxVersion = VERSION;
    window.dispatchEvent(new CustomEvent('lemoncheck:ux-v3-polished', { detail: { version: VERSION, propertyId: String(window.PROPERTY_DATA?.property_id || '') } }));
  }

  window.addEventListener('lemoncheck:ux-v3-ready', () => setTimeout(patch, 0));
  window.addEventListener('hashchange', () => setTimeout(patch, 100));
  setInterval(patch, 300);
  setTimeout(patch, 0);
})();
