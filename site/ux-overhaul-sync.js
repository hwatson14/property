(() => {
  "use strict";

  let lastPropertyId = "";
  let lastAddress = "";
  let lastSignature = "";

  function scoreValue(value) {
    return value === null || value === undefined ? "pending" : String(value);
  }

  function assessmentSignature(assessment) {
    return [
      scoreValue(assessment.objective?.lemonScore),
      scoreValue(assessment.deal?.score),
      scoreValue(assessment.fit?.score),
      scoreValue(assessment.development?.score),
      scoreValue(assessment.confidence?.score),
      assessment.decision?.title || "",
      Array.isArray(assessment.flags) ? assessment.flags.length : 0,
      Array.isArray(assessment.advisories) ? assessment.advisories.length : 0,
    ].join("|");
  }

  function markPending(key) {
    const card = document.querySelector(`[data-v2-lens="${key}"]`);
    const score = card?.querySelector("strong");
    if (!card || !score) return;
    card.classList.remove("lc-v2-strong", "lc-v2-good", "lc-v2-mixed", "lc-v2-weak");
    card.classList.add("lc-v2-pending");
    score.className = "lc-v2-score-missing";
    score.textContent = "—";
  }

  function patchPendingScores() {
    const assessment = window.LEMONCHECK_ASSESSMENT;
    if (!assessment) return;
    if (assessment.deal?.score === null || assessment.deal?.score === undefined) markPending("deal");
    if (assessment.fit?.score === null || assessment.fit?.score === undefined) markPending("fit");
    if (assessment.development?.score === null || assessment.development?.score === undefined) markPending("development");
  }

  function enforceReadingOrder() {
    const summary = document.querySelector(".lc-v2-summary");
    const map = document.querySelector(".report-overview-section");
    if (summary && map && summary.nextElementSibling !== map) summary.insertAdjacentElement("afterend", map);
  }

  function synchronise() {
    const data = window.PROPERTY_DATA;
    const assessment = window.LEMONCHECK_ASSESSMENT;
    if (!data?.property_id || !data?.canonical_address || !assessment?.objective) return;

    const propertyId = String(data.property_id);
    const address = String(data.canonical_address);
    const signature = assessmentSignature(assessment);
    const renderedAddress = document.querySelector('.lc-v2-property-title h1')?.textContent?.trim() || "";
    const currentVersion = document.querySelector('[data-ux-version="LC-UX-v0.2.0"]');

    if (!currentVersion || renderedAddress !== address || propertyId !== lastPropertyId || address !== lastAddress || signature !== lastSignature) {
      lastPropertyId = propertyId;
      lastAddress = address;
      lastSignature = signature;
      window.dispatchEvent(new CustomEvent("lemoncheck:governance-ready", { detail: assessment }));
    }
    setTimeout(() => {
      patchPendingScores();
      enforceReadingOrder();
    }, 0);
  }

  window.addEventListener("hashchange", () => {
    lastPropertyId = "";
    lastAddress = "";
    lastSignature = "";
    setTimeout(synchronise, 50);
  });
  window.addEventListener("lemoncheck:assessment-ready", () => setTimeout(synchronise, 0));
  window.addEventListener("lemoncheck:governance-ready", () => setTimeout(synchronise, 0));
  window.addEventListener("lemoncheck:pricing-ready", () => setTimeout(synchronise, 0));
  window.addEventListener("lemoncheck:ux-v2-ready", () => setTimeout(() => {
    patchPendingScores();
    enforceReadingOrder();
  }, 0));
  setInterval(synchronise, 150);
  setTimeout(synchronise, 0);
})();
