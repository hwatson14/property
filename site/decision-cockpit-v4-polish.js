(() => {
  "use strict";

  const toolIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m14.5 6.5 3-3a4 4 0 0 1-5 5l-7.8 7.8a2 2 0 1 0 2.8 2.8l7.8-7.8a4 4 0 0 1 5-5l-3 3"/></svg>';

  function ensureEvidenceGap() {
    const shell = document.querySelector('[data-ux-version="LC-UX-v0.4.0"]');
    const assessment = window.LEMONCHECK_ASSESSMENT;
    if (!shell || !assessment) return;
    if (shell.querySelector('.lc-v4-finding-unknown')) return;
    const gaps = assessment.confidence?.gaps || [];
    const last = shell.querySelector('.lc-v4-finding:last-child');
    if (!last) return;

    let content = null;
    if (gaps.includes('Building and pest evidence')) {
      content = {
        title: 'Building condition is unchecked',
        category: 'Condition',
        consequence: 'Structural, moisture, termite and maintenance costs remain unknown.',
        action: 'Order a current building and pest inspection.',
      };
    } else if (gaps.includes('Contract, approvals and title review')) {
      content = {
        title: 'Legal and approval checks are missing',
        category: 'Legal & title',
        consequence: 'Ownership, easements, unapproved works and contract risks are not confirmed.',
        action: 'Ask a conveyancer to review the contract, title and approvals.',
      };
    }
    if (!content) return;

    last.className = 'lc-v4-finding lc-v4-finding-unknown';
    last.innerHTML = `<div class="lc-v4-finding-icon">${toolIcon}</div>
      <div class="lc-v4-finding-title"><h3>${content.title}</h3><span>${content.category}</span></div>
      <p>${content.consequence}</p>
      <small><b>Next:</b> ${content.action}</small>
      <button type="button" data-v4-evidence aria-label="View evidence for ${content.title}">›</button>`;
  }

  function openPersonalisation() {
    document.documentElement.classList.add('lc-v4-details-open');
    const original = document.querySelector('.lemoncheck-decision-section');
    if (!original) return;
    original.hidden = false;
    original.classList.add('is-open');
    setTimeout(() => {
      const detail = original.querySelector('.lc-simple-details');
      if (detail && !detail.open) detail.open = true;
      (detail || original).scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-v4-personalise]')) openPersonalisation();
    if (event.target.closest('[data-v4-evidence]')) {
      const target = document.querySelector('.report-facts-section details, .report-facts-section');
      if (target?.tagName === 'DETAILS') target.open = true;
    }
  }, true);

  window.addEventListener('lemoncheck:ux-v4-ready', () => setTimeout(ensureEvidenceGap, 0));
  setInterval(ensureEvidenceGap, 500);
})();
