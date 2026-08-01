(() => {
  "use strict";

  const VERSION = "LC-WORKSPACE-SHORTLIST-v0.1.0";
  const STORAGE_KEY = "lemoncheck-shortlist-v1";
  const MAX_ITEMS = 12;
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);

  function read() {
    try {
      const items = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(items) ? items.filter((item) => item?.propertyId && item?.address) : [];
    } catch (_error) {
      return [];
    }
  }

  function write(items) {
    const next = items.slice(-MAX_ITEMS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("lemoncheck:shortlist-updated", { detail: next }));
    return next;
  }

  function snapshotCurrent() {
    const data = window.PROPERTY_DATA;
    const assessment = window.LEMONCHECK_ASSESSMENT;
    if (!data?.property_id || !data?.canonical_address || !assessment?.objective) return null;
    return {
      featureVersion: VERSION,
      propertyId: String(data.property_id),
      address: String(data.canonical_address),
      route: `#/report/${encodeURIComponent(String(data.property_id))}`,
      modelVersion: assessment.modelVersion || assessment.governanceVersion || "unknown",
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
      hardFlags: Array.isArray(assessment.flags) ? assessment.flags.filter((flag) => ["critical", "material"].includes(flag.severity)).length : 0,
      advisories: (Array.isArray(assessment.advisories) ? assessment.advisories.length : 0)
        + (Array.isArray(assessment.flags) ? assessment.flags.filter((flag) => flag.severity === "unresolved").length : 0),
      profile: assessment.profile || {},
    };
  }

  function saveCurrent() {
    const snapshot = snapshotCurrent();
    if (!snapshot) return false;
    const items = read();
    const index = items.findIndex((item) => String(item.propertyId) === snapshot.propertyId);
    if (index >= 0) items[index] = snapshot; else items.push(snapshot);
    write(items);
    return true;
  }

  function score(value) {
    return Number.isFinite(value)
      ? `${Math.round(value)}<small>/100</small>`
      : '<span class="lc-compare-missing">—</span>';
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

  function card(item, best) {
    const lenses = [
      ["lemon", "Lemon", item.scores?.lemon],
      ["deal", "Deal", item.scores?.deal],
      ["fit", "Fit", item.scores?.fit],
      ["development", "Development", item.scores?.development],
      ["confidence", "Confidence", item.scores?.confidence],
    ];
    return `<article class="lc-compare-card" data-property-id="${escapeHtml(item.propertyId)}">
      <div class="lc-compare-card-head"><div><span>${escapeHtml(item.modelVersion)}</span><h3>${escapeHtml(item.address)}</h3><p>${escapeHtml(item.decision)}</p></div><button type="button" data-v5-remove="${escapeHtml(item.propertyId)}" aria-label="Remove ${escapeHtml(item.address)}">×</button></div>
      <div class="lc-compare-lenses">${lenses.map(([key, label, value]) => {
        const isBest = Number.isFinite(best[key]) && value === best[key];
        return `<div class="lc-compare-score lc-compare-${scoreClass(value)} ${isBest ? "lc-compare-best" : ""}"><span>${label}</span><strong>${score(value)}</strong>${isBest ? "<em>Highest saved</em>" : ""}</div>`;
      }).join("")}</div>
      <div class="lc-compare-flags"><span><b>${item.hardFlags || 0}</b> material flag${item.hardFlags === 1 ? "" : "s"}</span><span><b>${item.advisories || 0}</b> attention item${item.advisories === 1 ? "" : "s"}</span></div>
      <a class="lc-compare-open" href="${escapeHtml(item.route)}">Open report</a>
    </article>`;
  }

  function ensureDialog() {
    let dialog = document.getElementById("lemoncheck-compare-dialog");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "lemoncheck-compare-dialog";
      dialog.className = "lc-compare-dialog";
      document.body.appendChild(dialog);
    }
    return dialog;
  }

  function renderComparison() {
    const dialog = ensureDialog();
    const items = read();
    const versions = [...new Set(items.map((item) => item.modelVersion).filter(Boolean))];
    const best = {
      lemon: bestValue(items, "lemon"),
      deal: bestValue(items, "deal"),
      fit: bestValue(items, "fit"),
      development: bestValue(items, "development"),
      confidence: bestValue(items, "confidence"),
    };
    dialog.innerHTML = `<div class="lc-compare-shell"><header><div><span>House-hunt shortlist</span><h2>Compare saved properties.</h2><p>Each lens stays separate. Missing values remain missing and no overall winner is inferred.</p></div><button type="button" data-v5-close aria-label="Close comparison">×</button></header>
      ${versions.length > 1 ? `<div class="lc-compare-version-warning">Saved reports use different model versions: ${escapeHtml(versions.join(", "))}.</div>` : ""}
      <div class="lc-compare-grid">${items.length ? items.map((item) => card(item, best)).join("") : '<div class="lc-compare-empty"><h3>No saved properties yet.</h3><p>Save a report to build your shortlist.</p></div>'}</div>
      <footer><button type="button" data-v5-clear>Clear shortlist</button><small>Saved in this browser only · ${VERSION}</small></footer></div>`;
    dialog.querySelector("[data-v5-close]")?.addEventListener("click", () => dialog.close());
    dialog.querySelector("[data-v5-clear]")?.addEventListener("click", () => { write([]); renderComparison(); });
    dialog.querySelectorAll("[data-v5-remove]").forEach((button) => button.addEventListener("click", () => {
      write(read().filter((item) => String(item.propertyId) !== String(button.dataset.v5Remove)));
      renderComparison();
    }));
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); }, { once: true });
    return dialog;
  }

  function openCompare() {
    const dialog = renderComparison();
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else dialog.setAttribute("open", "");
    return true;
  }

  function install() {
    const api = window.LemonCheckWorkspace || {};
    api.saveCurrent = saveCurrent;
    api.openCompare = openCompare;
    api.shortlistVersion = VERSION;
    window.LemonCheckWorkspace = api;
  }

  window.addEventListener("lemoncheck:workspace-ready", () => setTimeout(install, 0));
  window.addEventListener("hashchange", () => setTimeout(install, 150));
  setInterval(() => {
    if (document.documentElement.classList.contains("lcw-active") && window.LemonCheckWorkspace?.shortlistVersion !== VERSION) install();
  }, 500);
  setTimeout(install, 100);
})();
