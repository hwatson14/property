(() => {
  "use strict";

  const STORAGE_KEY = "lemoncheck-shortlist-v1";
  const FEATURE_VERSION = "LC-COMPARE-v0.1.0";
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);

  function read() {
    try {
      const items = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(items) ? items : [];
    } catch (_error) {
      return [];
    }
  }

  function write(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-12)));
    window.dispatchEvent(new CustomEvent("lemoncheck:shortlist-updated", { detail: items.slice(-12) }));
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
      write(items);
      const button = document.querySelector("[data-v2-save]");
      if (button) button.textContent = "Saved";
      return true;
    } catch (_error) {
      return false;
    }
  }

  function score(value) {
    return Number.isFinite(value) ? `${value}<small>/100</small>` : `<span class="lc-compare-missing">—</span>`;
  }

  function card(item) {
    const lenses = [
      ["Lemon", item.scores?.lemon],
      ["Deal", item.scores?.deal],
      ["Fit", item.scores?.fit],
      ["Development", item.scores?.development],
      ["Confidence", item.scores?.confidence],
    ];
    return `<article class="lc-compare-card" data-property-id="${escapeHtml(item.propertyId)}">
      <div class="lc-compare-card-head"><div><span>${escapeHtml(item.modelVersion)}</span><h3>${escapeHtml(item.address)}</h3><p>${escapeHtml(item.decision)}</p></div><button type="button" data-v2-remove="${escapeHtml(item.propertyId)}" aria-label="Remove ${escapeHtml(item.address)}">×</button></div>
      <div class="lc-compare-lenses">${lenses.map(([label, value]) => `<div class="lc-compare-score"><span>${label}</span><strong>${score(value)}</strong></div>`).join("")}</div>
      <div class="lc-compare-flags"><span><b>${item.hardFlags || 0}</b> hard flags</span><span><b>${item.advisories || 0}</b> advisories</span></div>
      <a class="lc-compare-open" href="${escapeHtml(item.route)}">Open report</a>
    </article>`;
  }

  function renderComparison() {
    let dialog = document.getElementById("lemoncheck-compare-dialog");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "lemoncheck-compare-dialog";
      dialog.className = "lc-compare-dialog";
      document.body.appendChild(dialog);
    }
    const items = read();
    const versions = [...new Set(items.map((item) => item.modelVersion).filter(Boolean))];
    dialog.innerHTML = `<div class="lc-compare-shell"><header><div><span>House-hunt shortlist</span><h2>Compare saved properties.</h2><p>Each score remains separate. Missing values are not treated as zero.</p></div><button type="button" data-v2-close-compare aria-label="Close comparison">×</button></header>
      ${versions.length > 1 ? `<div class="lc-compare-version-warning">Saved reports use different model versions: ${escapeHtml(versions.join(", "))}.</div>` : ""}
      <div class="lc-compare-grid">${items.length ? items.map(card).join("") : `<div class="lc-compare-empty"><h3>No saved properties yet.</h3></div>`}</div>
      <footer><button type="button" data-v2-clear>Clear shortlist</button><small>Saved in this browser only · ${FEATURE_VERSION}</small></footer></div>`;

    dialog.querySelector("[data-v2-close-compare]")?.addEventListener("click", () => dialog.close());
    dialog.querySelector("[data-v2-clear]")?.addEventListener("click", () => { write([]); renderComparison(); });
    dialog.querySelectorAll("[data-v2-remove]").forEach((button) => button.addEventListener("click", () => {
      write(read().filter((item) => String(item.propertyId) !== String(button.dataset.v2Remove)));
      renderComparison();
    }));
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); }, { once: true });
    if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-v2-save]")) saveCurrent();
    if (event.target.closest("[data-v2-compare]")) renderComparison();
  }, true);
})();
