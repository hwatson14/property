(() => {
  "use strict";

  const STORAGE_KEY = "lemoncheck-shortlist-v1";
  const FEATURE_VERSION = "LC-COMPARE-v0.1.0";

  function read() {
    try {
      const items = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(items) ? items : [];
    } catch (_error) {
      return [];
    }
  }

  function saveCurrent() {
    const data = window.PROPERTY_DATA;
    const assessment = window.LEMONCHECK_ASSESSMENT;
    if (!data?.property_id || !data?.canonical_address || !assessment?.objective) return false;
    const snapshot = {
      featureVersion: FEATURE_VERSION,
      propertyId: String(data.property_id),
      address: String(data.canonical_address),
      route: `#/report/${encodeURIComponent(String(data.property_id))}`,
      modelVersion: assessment.modelVersion || "unknown",
      savedAt: new Date().toISOString(),
      decision: assessment.decision?.title || "Assessment available",
      scores: {
        lemon: assessment.objective?.lemonScore ?? null,
        deal: assessment.deal?.score ?? null,
        fit: assessment.fit?.score ?? null,
        development: assessment.development?.score ?? null,
        confidence: assessment.confidence?.score ?? null,
        publicSourceConfidence: assessment.confidence?.publicSourceScore ?? null,
      },
      hardFlags: Array.isArray(assessment.flags) ? assessment.flags.length : 0,
      advisories: Array.isArray(assessment.advisories) ? assessment.advisories.length : 0,
      profile: assessment.profile || {},
    };
    const items = read();
    const index = items.findIndex((item) => String(item.propertyId) === snapshot.propertyId);
    if (index >= 0) items[index] = snapshot; else items.push(snapshot);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-12)));
      window.dispatchEvent(new CustomEvent("lemoncheck:shortlist-updated", { detail: items.slice(-12) }));
      const button = document.querySelector("[data-v2-save]");
      if (button) button.textContent = "Saved";
      return true;
    } catch (_error) {
      return false;
    }
  }

  function openComparison(attempt = 0) {
    const control = [...document.querySelectorAll("[data-open-comparison]")]
      .find((element) => !element.closest(".lc-v2-summary"));
    if (control) {
      control.click();
      return;
    }
    if (attempt < 30) setTimeout(() => openComparison(attempt + 1), 100);
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-v2-save]")) saveCurrent();
    if (event.target.closest("[data-v2-compare]")) openComparison();
  }, true);
})();
