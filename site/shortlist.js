(() => {
  "use strict";

  const FEATURE_VERSION = "LC-COMPARE-v0.1.0";
  const STORAGE_KEY = "lemoncheck-shortlist-v1";
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);

  function readShortlist() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(value) ? value.filter((item) => item?.propertyId && item?.address) : [];
    } catch (_error) {
      return [];
    }
  }

  function writeShortlist(items) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      window.dispatchEvent(new CustomEvent("lemoncheck:shortlist-updated", { detail: items }));
      return true;
    } catch (_error) {
      return false;
    }
  }

  function snapshotCurrent() {
    const data = window.PROPERTY_DATA;
    const assessment = window.LEMONCHECK_ASSESSMENT;
    if (!data?.property_id || !data?.canonical_address || !assessment?.objective) return null;
    return {
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
  }

  function saveCurrent() {
    const snapshot = snapshotCurrent();
    if (!snapshot) return false;
    const items = readShortlist();
    const index = items.findIndex((item) => String(item.propertyId) === snapshot.propertyId);
    if (index >= 0) items[index] = snapshot;
    else items.push(snapshot);
    writeShortlist(items.slice(-12));
    updateControls();
    return true;
  }

  function removeProperty(propertyId) {
    writeShortlist(readShortlist().filter((item) => String(item.propertyId) !== String(propertyId)));
    renderComparison();
    updateControls();
  }

  function scoreDisplay(value) {
    return Number.isFinite(value) ? `${value}<small>/100</small>` : `<span class="lc-compare-missing">—</span>`;
  }

  function scoreClass(value) {
    if (!Number.isFinite(value)) return "missing";
    if (value >= 75) return "strong";
    if (value >= 50) return "mixed";
    return "weak";
  }

  function bestValue(items, key) {
    const values = items.map((item) => item.scores?.[key]).filter(Number.isFinite);
    return values.length >= 2 ? Math.max(...values) : null;
  }

  function comparisonCard(item, best) {
    const lens = [
      ["lemon", "Lemon", item.scores?.lemon],
      ["deal", "Deal", item.scores?.deal],
      ["fit", "Fit", item.scores?.fit],
      ["development", "Development", item.scores?.development],
      ["confidence", "Confidence", item.scores?.confidence],
    ];
    return `<article class="lc-compare-card" data-property-id="${escapeHtml(item.propertyId)}">
      <div class="lc-compare-card-head"><div><span>${escapeHtml(item.modelVersion)}</span><h3>${escapeHtml(item.address)}</h3><p>${escapeHtml(item.decision)}</p></div><button type="button" data-remove-property="${escapeHtml(item.propertyId)}" aria-label="Remove ${escapeHtml(item.address)}">×</button></div>
      <div class="lc-compare-lenses">${lens.map(([key, label, value]) => {
        const isBest = Number.isFinite(best[key]) && value === best[key];
        return `<div class="lc-compare-score lc-compare-${scoreClass(value)} ${isBest ? "lc-compare-best" : ""}"><span>${label}</span><strong>${scoreDisplay(value)}</strong>${isBest ? "<em>Highest saved</em>" : ""}</div>`;
      }).join("")}</div>
      <div class="lc-compare-flags"><span><b>${item.hardFlags}</b> hard flag${item.hardFlags === 1 ? "" : "s"}</span><span><b>${item.advisories}</b> advisor${item.advisories === 1 ? "y" : "ies"}</span></div>
      <a class="lc-compare-open" href="${escapeHtml(item.route)}">Open report</a>
    </article>`;
  }

  function ensureDialog() {
    let dialog = document.getElementById("lemoncheck-compare-dialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = "lemoncheck-compare-dialog";
    dialog.className = "lc-compare-dialog";
    dialog.innerHTML = `<div class="lc-compare-shell"><header><div><span>House-hunt shortlist</span><h2>Compare saved properties.</h2><p>Each lens stays separate. Missing scores are not treated as zero and no single winner is inferred.</p></div><button type="button" data-close-compare aria-label="Close comparison">×</button></header><div class="lc-compare-version-warning" hidden></div><div class="lc-compare-grid"></div><footer><button type="button" data-clear-shortlist>Clear shortlist</button><small>Saved in this browser only · ${FEATURE_VERSION}</small></footer></div>`;
    document.body.appendChild(dialog);
    dialog.querySelector("[data-close-compare]")?.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.querySelector("[data-clear-shortlist]")?.addEventListener("click", () => {
      writeShortlist([]);
      renderComparison();
      updateControls();
    });
    dialog.addEventListener("click", (event) => {
      const remove = event.target.closest("[data-remove-property]");
      if (remove) removeProperty(remove.dataset.removeProperty);
    });
    return dialog;
  }

  function renderComparison() {
    const dialog = ensureDialog();
    const items = readShortlist();
    const grid = dialog.querySelector(".lc-compare-grid");
    const versions = [...new Set(items.map((item) => item.modelVersion).filter(Boolean))];
    const warning = dialog.querySelector(".lc-compare-version-warning");
    if (versions.length > 1) {
      warning.hidden = false;
      warning.textContent = `Saved properties use different model versions (${versions.join(", ")}). Compare cautiously or refresh the older reports.`;
    } else warning.hidden = true;

    if (!items.length) {
      grid.innerHTML = `<div class="lc-compare-empty"><span>⌂</span><h3>No saved properties yet.</h3><p>Open a Brisbane report and select “Save property” to build a shortlist.</p></div>`;
      return dialog;
    }
    const best = {
      lemon: bestValue(items, "lemon"),
      deal: bestValue(items, "deal"),
      fit: bestValue(items, "fit"),
      development: bestValue(items, "development"),
      confidence: bestValue(items, "confidence"),
    };
    grid.innerHTML = items.map((item) => comparisonCard(item, best)).join("");
    return dialog;
  }

  function openComparison() {
    const dialog = renderComparison();
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function injectControls() {
    const decision = document.querySelector(".lc-decision-hero > div:first-child");
    if (!decision || decision.querySelector(".lc-shortlist-actions")) return;
    const actions = document.createElement("div");
    actions.className = "lc-shortlist-actions";
    actions.innerHTML = `<button type="button" data-save-property>Save property</button><button type="button" data-open-comparison>Compare saved <b>0</b></button>`;
    decision.appendChild(actions);
    actions.querySelector("[data-save-property]")?.addEventListener("click", saveCurrent);
    actions.querySelector("[data-open-comparison]")?.addEventListener("click", openComparison);
    updateControls();
  }

  function updateControls() {
    const items = readShortlist();
    const currentId = String(window.PROPERTY_DATA?.property_id || "");
    document.querySelectorAll("[data-open-comparison] b").forEach((element) => { element.textContent = String(items.length); });
    document.querySelectorAll("[data-save-property]").forEach((button) => {
      const saved = items.some((item) => String(item.propertyId) === currentId);
      button.textContent = saved ? "Update saved property" : "Save property";
      button.classList.toggle("is-saved", saved);
    });
  }

  window.addEventListener("lemoncheck:governance-ready", () => {
    injectControls();
    updateControls();
  });
  window.addEventListener("lemoncheck:shortlist-updated", updateControls);
  window.addEventListener("storage", (event) => { if (event.key === STORAGE_KEY) updateControls(); });
  document.addEventListener("click", (event) => {
    const link = event.target.closest("#lemoncheck-compare-dialog .lc-compare-open");
    if (link) document.getElementById("lemoncheck-compare-dialog")?.close();
  });
})();
