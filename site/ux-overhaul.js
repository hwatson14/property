(() => {
  "use strict";

  const VERSION = "LC-UX-v0.2.0";
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  const finite = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };

  function scoreBand(value) {
    if (!Number.isFinite(value)) return { label: "Pending", className: "pending" };
    if (value >= 85) return { label: "Few mapped issues", className: "strong" };
    if (value >= 70) return { label: "Generally sound", className: "good" };
    if (value >= 50) return { label: "Mixed findings", className: "mixed" };
    return { label: "Material concerns", className: "weak" };
  }

  function displayScore(value, suffix = "/100") {
    return Number.isFinite(value)
      ? `<strong>${Math.round(value)}<small>${suffix}</small></strong>`
      : `<strong class="lc-v2-score-missing">—</strong>`;
  }

  function factValue(data, metricId, fallback = "—") {
    const metric = (data.metrics || []).find((item) => item.metric_id === metricId);
    const value = metric?.value;
    if (Array.isArray(value)) return value.length ? value.join(", ") : fallback;
    return value === null || value === undefined || value === "" ? fallback : value;
  }

  function shortDecision(assessment) {
    const title = assessment.decision?.title || "Review this property";
    const hard = Array.isArray(assessment.flags) ? assessment.flags.length : 0;
    const advisories = Array.isArray(assessment.advisories) ? assessment.advisories.length : 0;
    if (hard > 0) return `${hard} material issue${hard === 1 ? "" : "s"} need investigation before offering.`;
    if (advisories > 0) return `No material issue was found in the connected data, but ${advisories} advisory item${advisories === 1 ? "" : "s"} need review.`;
    if (/investigate/i.test(title)) return "Mapped public data indicates issues that should be investigated before offering.";
    return "No material issue was found in the currently connected public-data screening.";
  }

  function topMatters(assessment) {
    const hard = Array.isArray(assessment.flags) ? assessment.flags : [];
    const advisories = Array.isArray(assessment.advisories) ? assessment.advisories : [];
    const gaps = Array.isArray(assessment.confidence?.gaps) ? assessment.confidence.gaps : [];
    const items = [
      ...hard.map((item) => ({ tone: "risk", title: item.title, text: item.detail || item.action })),
      ...advisories.map((item) => ({ tone: "advisory", title: item.title, text: item.detail || item.action })),
      ...gaps.slice(0, 3).map((gap) => ({ tone: "unknown", title: gap, text: "Not yet included in this screening assessment." })),
    ];
    while (items.length < 3) items.push({ tone: "clear", title: "No additional mapped concern", text: "No further material issue was identified in the connected public sources." });
    return items.slice(0, 3);
  }

  function lensCard(key, label, value, note) {
    const score = finite(value);
    const band = scoreBand(score);
    return `<article class="lc-v2-lens lc-v2-${band.className}" data-v2-lens="${escapeHtml(key)}">
      <div><span>${escapeHtml(label)}</span><small>${escapeHtml(note)}</small></div>${displayScore(score)}
    </article>`;
  }

  function relayAction(selector) {
    const original = document.querySelector(`.lc-v2-original ${selector}`);
    if (original) original.click();
  }

  function render(data, assessment) {
    const original = document.querySelector(".lemoncheck-decision-section");
    if (!original || !data?.property_id || !data?.canonical_address || !assessment?.objective) return;

    document.querySelector(".report-hero")?.classList.add("lc-v2-hide-report-hero");

    let section = document.querySelector(".lc-v2-summary");
    if (!section) {
      section = document.createElement("section");
      section.className = "lc-v2-summary";
      original.insertAdjacentElement("beforebegin", section);
    }

    const lemon = finite(assessment.objective?.lemonScore);
    const completeness = finite(assessment.confidence?.score);
    const fit = finite(assessment.fit?.score);
    const development = finite(assessment.development?.score);
    const lemonBand = scoreBand(lemon);
    const matters = topMatters(assessment);
    const parcelCount = Number(factValue(data, "property.parcel_count", data.parcels?.length || 0));
    const area = factValue(data, "property.parcel_area", "Area unavailable");
    const zone = factValue(data, "planning.zone", "Zone unavailable");

    section.innerHTML = `<div class="container lc-v2-shell" data-ux-version="${VERSION}">
      <header class="lc-v2-property-head">
        <div class="lc-v2-property-title"><span>Property assessment</span><h1>${escapeHtml(data.canonical_address)}</h1><p>${parcelCount || 1} parcel${parcelCount === 1 ? "" : "s"} · ${escapeHtml(area)} · ${escapeHtml(zone)}</p></div>
        <div class="lc-v2-head-actions"><button type="button" data-v2-save>Save</button><button type="button" data-v2-compare>Compare</button></div>
      </header>

      <div class="lc-v2-overview">
        <article class="lc-v2-verdict">
          <span class="lc-v2-kicker">${escapeHtml(assessment.decision?.title || "Assessment")}</span>
          <h2>${escapeHtml(shortDecision(assessment))}</h2>
          <p>Screening only. Building condition, contract, title, insurance and live pricing remain separate until connected.</p>
        </article>
        <article class="lc-v2-primary-score lc-v2-${lemonBand.className}">
          <div><span>Lemon Score</span><small>Mapped screening only</small></div>
          ${displayScore(lemon)}
          <b>${escapeHtml(lemonBand.label)}</b>
        </article>
      </div>

      <div class="lc-v2-lenses">
        <article class="lc-v2-lens lc-v2-price" data-v2-lens="price"><div><span>Price</span><small>Live pricing unavailable</small></div><strong class="lc-v2-price-missing">$–</strong></article>
        ${lensCard("deal", "Deal Score", assessment.deal?.score, "Value at the price")}
        ${lensCard("fit", "Personal Fit", fit, fit === null ? "Personalise" : "For your preferences")}
        ${lensCard("development", "Development", development, "Potential and constraints")}
        ${lensCard("completeness", "Completeness", completeness, "Evidence coverage")}
      </div>

      <div class="lc-v2-grid">
        <section class="lc-v2-matters"><div class="lc-v2-section-head"><span>What matters</span><h3>Three things to understand</h3></div>
          <div class="lc-v2-matter-list">${matters.map((item, index) => `<article class="lc-v2-matter lc-v2-matter-${escapeHtml(item.tone)}"><b>${index + 1}</b><div><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.text)}</p></div></article>`).join("")}</div>
        </section>
        <section class="lc-v2-next"><div class="lc-v2-section-head"><span>Next steps</span><h3>Before you offer</h3></div>
          <ol><li>Review the mapped findings and affected areas.</li><li>Obtain building, pest and insurance evidence.</li><li>Confirm contract, title and approvals with your conveyancer.</li></ol>
          <button type="button" data-v2-open-details>View detailed assessment</button>
        </section>
      </div>
    </div>`;

    original.classList.add("lc-v2-original");
    original.hidden = true;

    section.querySelector("[data-v2-save]")?.addEventListener("click", () => relayAction("[data-save-property]"));
    section.querySelector("[data-v2-compare]")?.addEventListener("click", () => relayAction("[data-open-comparison]"));
    section.querySelector("[data-v2-open-details]")?.addEventListener("click", (event) => {
      original.hidden = !original.hidden;
      original.classList.toggle("is-open", !original.hidden);
      event.currentTarget.textContent = original.hidden ? "View detailed assessment" : "Hide detailed assessment";
      if (!original.hidden) original.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    window.dispatchEvent(new CustomEvent("lemoncheck:ux-v2-ready", { detail: { version: VERSION, propertyId: String(data.property_id) } }));
  }

  function apply() {
    const data = window.PROPERTY_DATA;
    const assessment = window.LEMONCHECK_ASSESSMENT;
    if (data?.property_id && data?.canonical_address && assessment?.objective) render(data, assessment);
  }

  window.addEventListener("lemoncheck:governance-ready", apply);
  window.addEventListener("lemoncheck:assessment-ready", apply);
  window.addEventListener("lemoncheck:pricing-ready", apply);
  window.addEventListener("hashchange", () => setTimeout(apply, 50));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(apply, 50));
  else setTimeout(apply, 50);
})();
