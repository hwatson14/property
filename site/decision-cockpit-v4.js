(() => {
  "use strict";

  const VERSION = "LC-UX-v0.4.0";
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
  const finite = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };

  function metric(data, id) {
    return (data?.metrics || []).find((item) => item.metric_id === id);
  }

  function areaLabel(data) {
    const value = metric(data, "property.parcel_area")?.value;
    const values = [];
    const collect = (item) => {
      if (Number.isFinite(Number(item))) values.push(Number(item));
      else if (item && typeof item === "object") {
        const candidate = item.area ?? item.value ?? item.square_metres ?? item.squareMeters;
        if (Number.isFinite(Number(candidate))) values.push(Number(candidate));
      }
    };
    if (Array.isArray(value)) value.forEach(collect); else collect(value);
    if (!values.length) return "Area unavailable";
    const total = Math.round(values.reduce((sum, item) => sum + item, 0));
    return `${new Intl.NumberFormat("en-AU").format(total)} m²`;
  }

  function zoneLabel(data) {
    const value = metric(data, "planning.zone")?.value;
    if (Array.isArray(value)) return value.filter(Boolean).join(", ") || "Zone unavailable";
    return value ? String(value) : "Zone unavailable";
  }

  function scoreLabel(key, value) {
    if (!Number.isFinite(value)) {
      if (key === "deal") return "Awaiting pricing";
      if (key === "fit") return "Not personalised";
      return "Not available";
    }
    if (key === "lemon") return value >= 85 ? "Few mapped issues" : value >= 70 ? "Generally sound" : value >= 50 ? "Mixed findings" : "Material concerns";
    if (key === "development") return value >= 75 ? "Flexible" : value >= 50 ? "Some potential" : value >= 25 ? "Constrained" : "Highly constrained";
    if (key === "confidence") return value >= 80 ? "Broad evidence" : value >= 60 ? "Several gaps" : "Partial evidence";
    return value >= 75 ? "Strong fit" : value >= 50 ? "Mixed fit" : "Weak fit";
  }

  function status(assessment) {
    const hard = Array.isArray(assessment.flags) ? assessment.flags.length : 0;
    const advisory = Array.isArray(assessment.advisories) ? assessment.advisories.length : 0;
    if (hard > 0) return {
      tone: "risk",
      label: "Investigate before offering",
      title: `${hard} material issue${hard === 1 ? "" : "s"} need attention.`,
      copy: "The mapped screening found issues that may affect cost, use or insurability.",
    };
    if (advisory > 0) return {
      tone: "review",
      label: "Worth shortlisting",
      title: `Promising, with ${advisory} item${advisory === 1 ? "" : "s"} to review.`,
      copy: "No material mapped issue was detected, but the property is not yet fully assessed.",
    };
    return {
      tone: "positive",
      label: "Worth shortlisting",
      title: "No material mapped issue detected.",
      copy: "This is an encouraging screening result, not a complete due-diligence conclusion.",
    };
  }

  const GAP_COPY = {
    "Building and pest evidence": {
      title: "Building condition is unchecked",
      consequence: "Structural, moisture, termite and maintenance costs remain unknown.",
      action: "Order a current building and pest inspection.",
      category: "Condition",
      tone: "unknown",
    },
    "Contract, approvals and title review": {
      title: "Legal and approval checks are missing",
      consequence: "Ownership, easements, unapproved works and contract risks are not confirmed.",
      action: "Ask a conveyancer to review the contract, title and approvals.",
      category: "Legal & title",
      tone: "unknown",
    },
    "Market value and comparable sales": {
      title: "Price has not been assessed",
      consequence: "LemonCheck cannot yet say whether the asking price represents value.",
      action: "Treat price and Deal Score as pending.",
      category: "Price & value",
      tone: "unknown",
    },
    "Insurance availability and terms": {
      title: "Insurance is unchecked",
      consequence: "Mapped screening does not confirm that cover is available or affordable.",
      action: "Obtain an address-specific insurance quote.",
      category: "Insurance",
      tone: "unknown",
    },
  };

  function findings(assessment) {
    const output = [];
    const add = (tone, title, consequence, action, category) => {
      if (!title || output.some((item) => item.title === title)) return;
      output.push({
        tone,
        title,
        category: category || (tone === "risk" ? "Material risk" : tone === "unknown" ? "Not checked" : "Planning & development"),
        consequence: consequence || "Review the detailed evidence.",
        action: action || "Investigate before relying on this result.",
      });
    };
    (assessment.flags || []).forEach((item) => add("risk", item.title, item.detail, item.action, "Material risk"));
    (assessment.advisories || []).forEach((item) => add("review", item.title, item.detail, item.action, "Planning & development"));
    (assessment.confidence?.gaps || []).forEach((gap) => {
      const mapped = GAP_COPY[gap];
      if (mapped) add(mapped.tone, mapped.title, mapped.consequence, mapped.action, mapped.category);
    });
    while (output.length < 3) {
      add("positive", "No additional mapped concern", "No further material finding was returned by the connected public sources.", "Continue with normal property due diligence.", "Mapped screening");
    }
    return output.slice(0, 3);
  }

  function icon(name) {
    const paths = {
      check: '<path d="M5 12.5 9.1 16.5 19 6.5"/>',
      price: '<path d="M12 3v18M16 7.2c-.8-1-2.1-1.7-4-1.7-2.4 0-4 1.2-4 3s1.5 2.6 4.3 3.2c2.7.6 4.2 1.4 4.2 3.5s-1.8 3.3-4.5 3.3c-2 0-3.6-.7-4.7-2"/>',
      person: '<circle cx="12" cy="8" r="3"/><path d="M5.5 20c.6-4 2.8-6 6.5-6s5.9 2 6.5 6"/>',
      building: '<path d="M5 21V4h10v17M15 9h4v12M8 8h2M8 12h2M8 16h2M18 13h1M18 17h1"/>',
      map: '<path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3V6Z"/><path d="M8 3v15M16 6v15"/>',
      evidence: '<path d="M6 3h9l3 3v15H6V3Z"/><path d="M15 3v4h4M9 11h6M9 15h6"/>',
      heritage: '<path d="M4 9h16M6 9v10M10 9v10M14 9v10M18 9v10M3 19h18M12 3l9 5H3l9-5Z"/>',
      planning: '<path d="M4 20h16M6 20V7l6-4 6 4v13M9 20v-5h6v5"/>',
      tool: '<path d="m14.5 6.5 3-3a4 4 0 0 1-5 5l-7.8 7.8a2 2 0 1 0 2.8 2.8l7.8-7.8a4 4 0 0 1 5-5l-3 3"/>',
      alert: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5M12 17h.01"/>',
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.alert}</svg>`;
  }

  function findingIcon(item, index) {
    if (item.tone === "risk") return "alert";
    if (item.tone === "unknown") return "tool";
    return index === 0 ? "heritage" : "planning";
  }

  function geometryPoints(geometry, output = []) {
    const walk = (value) => {
      if (!Array.isArray(value)) return;
      if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
        output.push([Number(value[0]), Number(value[1])]);
      } else value.forEach(walk);
    };
    walk(geometry?.coordinates);
    return output;
  }

  function parcelSnapshot(data) {
    const layers = (data.map_layers || []).filter((layer) => layer.style_role === "parcel");
    const points = [];
    layers.forEach((layer) => geometryPoints(layer.geometry, points));
    if (points.length < 3) {
      return `<svg class="lc-v4-parcel-svg" viewBox="0 0 320 160" role="img" aria-label="Property parcel outline preview">
        <path class="lc-v4-grid" d="M0 40h320M0 80h320M0 120h320M64 0v160M128 0v160M192 0v160M256 0v160"/>
        <path class="lc-v4-parcel" d="M105 30h108l24 34-22 68H88L73 81l32-51Z"/>
        <circle class="lc-v4-pin" cx="160" cy="82" r="7"/>
      </svg>`;
    }
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    const minX = Math.min(...xs); const maxX = Math.max(...xs);
    const minY = Math.min(...ys); const maxY = Math.max(...ys);
    const spanX = Math.max(maxX - minX, 0.000001);
    const spanY = Math.max(maxY - minY, 0.000001);
    const pad = 22;
    const width = 320; const height = 160;
    const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
    const usedW = spanX * scale; const usedH = spanY * scale;
    const offsetX = (width - usedW) / 2; const offsetY = (height - usedH) / 2;
    const path = points.map(([x, y], index) => {
      const px = offsetX + (x - minX) * scale;
      const py = height - (offsetY + (y - minY) * scale);
      return `${index ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`;
    }).join(" ") + " Z";
    return `<svg class="lc-v4-parcel-svg" viewBox="0 0 320 160" role="img" aria-label="Official property parcel outline preview">
      <path class="lc-v4-grid" d="M0 40h320M0 80h320M0 120h320M64 0v160M128 0v160M192 0v160M256 0v160"/>
      <path class="lc-v4-parcel" d="${path}"/>
      <circle class="lc-v4-pin" cx="160" cy="80" r="7"/>
    </svg>`;
  }

  function scoreMetric(label, value, key, suffix = "/100") {
    const score = finite(value);
    const display = Number.isFinite(score) ? `${Math.round(score)}<small>${suffix}</small>` : "—";
    return `<article class="lc-v4-score" data-v4-score="${escapeHtml(key)}">
      <span>${escapeHtml(label)}</span>
      <strong>${display}</strong>
      <small>${escapeHtml(scoreLabel(key, score))}</small>
      ${Number.isFinite(score) ? `<div class="lc-v4-progress"><i style="width:${Math.max(0, Math.min(100, score))}%"></i></div>` : ""}
    </article>`;
  }

  function render(data, assessment) {
    if (location.hash.includes("/preview/full-report")) return;
    if (!data?.property_id || !data?.canonical_address || !assessment?.objective) return;

    document.documentElement.classList.add("lc-v4-active");
    let shell = document.querySelector(".lc-v4-shell");
    const v3 = document.querySelector(".lc-v3-shell");
    const anchor = v3 || document.querySelector(".lc-v2-summary") || document.querySelector(".lemoncheck-decision-section");
    if (!anchor) return;
    if (!shell) {
      shell = document.createElement("main");
      shell.className = "lc-v4-shell";
      anchor.insertAdjacentElement("beforebegin", shell);
    }

    const state = status(assessment);
    const items = findings(assessment);
    const lemon = finite(assessment.objective?.lemonScore);
    const confidence = finite(assessment.confidence?.score);
    const deal = finite(assessment.deal?.score);
    const fit = finite(assessment.fit?.score);
    const development = finite(assessment.development?.score);
    const parcelCount = Number(metric(data, "property.parcel_count")?.value || data.parcels?.length || 1);

    shell.innerHTML = `<div class="container lc-v4-container" data-ux-version="${VERSION}">
      <section class="lc-v4-report-card">
        <header class="lc-v4-property-header">
          <div>
            <span class="lc-v4-eyebrow">Property decision check</span>
            <h1>${escapeHtml(data.canonical_address)}</h1>
            <p>${parcelCount} parcel${parcelCount === 1 ? "" : "s"} · ${escapeHtml(areaLabel(data))} · ${escapeHtml(zoneLabel(data))}</p>
          </div>
          <div class="lc-v4-property-actions">
            <button type="button" data-v4-save>Save</button>
            <button type="button" data-v4-compare>Compare</button>
          </div>
        </header>

        <div class="lc-v4-decision-row lc-v4-${state.tone}">
          <div class="lc-v4-verdict-icon">${icon("check")}</div>
          <div class="lc-v4-verdict">
            <span>${escapeHtml(state.label)}</span>
            <h2>${escapeHtml(state.title)}</h2>
            <p>${escapeHtml(state.copy)}</p>
            <small><b>Current boundary:</b> mapped public data only. Building, legal, insurance and pricing checks remain incomplete.</small>
          </div>
          ${scoreMetric("Mapped score", lemon, "lemon")}
          ${scoreMetric("Evidence checked", confidence, "confidence", "/100")}
          <article class="lc-v4-price">
            <span>Property price</span>
            <strong>$–</strong>
            <small>Live pricing unavailable</small>
          </article>
          <div class="lc-v4-primary-actions">
            <button type="button" data-v4-personalise>Personalise this check <b>→</b></button>
            <button type="button" data-v4-evidence>View detailed evidence</button>
          </div>
        </div>
      </section>

      <section class="lc-v4-findings-card">
        <header><span>Top findings (3 to review)</span><small>Why these matter</small></header>
        <div class="lc-v4-findings-list">
          ${items.map((item, index) => `<article class="lc-v4-finding lc-v4-finding-${escapeHtml(item.tone)}">
            <div class="lc-v4-finding-icon">${icon(findingIcon(item, index))}</div>
            <div class="lc-v4-finding-title"><h3>${escapeHtml(item.title)}</h3><span>${escapeHtml(item.category)}</span></div>
            <p>${escapeHtml(item.consequence)}</p>
            <small><b>Next:</b> ${escapeHtml(item.action)}</small>
            <button type="button" data-v4-evidence aria-label="View evidence for ${escapeHtml(item.title)}">›</button>
          </article>`).join("")}
        </div>
      </section>

      <section class="lc-v4-lenses" aria-label="Supporting decision lenses">
        <article><div class="lc-v4-lens-icon">${icon("price")}</div><div><span>Deal</span><strong>${Number.isFinite(deal) ? `${Math.round(deal)}<small>/100</small>` : "—"}</strong><small>${escapeHtml(scoreLabel("deal", deal))}</small></div><b>›</b></article>
        <article><div class="lc-v4-lens-icon">${icon("person")}</div><div><span>Personal Fit</span><strong>${Number.isFinite(fit) ? `${Math.round(fit)}<small>/100</small>` : "Personalise"}</strong><small>${escapeHtml(scoreLabel("fit", fit))}</small></div><b>›</b></article>
        <article><div class="lc-v4-lens-icon">${icon("building")}</div><div><span>Development</span><strong>${Number.isFinite(development) ? `${Math.round(development)}<small>/100</small>` : "—"}</strong><small>${escapeHtml(scoreLabel("development", development))}</small></div><b>›</b></article>
      </section>

      <section class="lc-v4-secondary-grid">
        <article class="lc-v4-snapshot-card">
          <div><h3>Property snapshot</h3><p>Official parcel shape and mapped planning context.</p></div>
          <div class="lc-v4-snapshot-content">
            <button type="button" class="lc-v4-map-preview" data-v4-map>${parcelSnapshot(data)}<span>Open full map</span></button>
            <ul>
              <li>${escapeHtml(zoneLabel(data))}</li>
              <li>${parcelCount} parcel${parcelCount === 1 ? "" : "s"} · ${escapeHtml(areaLabel(data))}</li>
              <li>Brisbane City Council</li>
            </ul>
          </div>
        </article>
        <article class="lc-v4-evidence-card">
          <div><h3>Evidence & data</h3><p>${Math.round(confidence || 0)} of 100 evidence points checked across planning, heritage, overlays, condition, pricing and more.</p><button type="button" data-v4-evidence>Explore all evidence →</button></div>
          <div class="lc-v4-evidence-icon">${icon("evidence")}</div>
        </article>
      </section>

      <footer class="lc-v4-source-note"><span>Data from official sources.</span><button type="button" data-v4-evidence>Learn how we check →</button></footer>
    </div>`;

    document.querySelector(".report-hero")?.classList.add("lc-v4-hidden");
    if (v3) v3.classList.add("lc-v4-hidden");
    document.querySelector(".lc-v2-summary")?.classList.add("lc-v4-hidden");
    document.querySelector(".lemoncheck-decision-section")?.classList.add("lc-v4-hidden");

    shell.querySelector("[data-v4-save]")?.addEventListener("click", () => document.querySelector(".lc-v3-shell [data-v3-save]")?.click());
    shell.querySelector("[data-v4-compare]")?.addEventListener("click", () => document.querySelector(".lc-v3-shell [data-v3-compare]")?.click());
    shell.querySelectorAll("[data-v4-personalise]").forEach((button) => button.addEventListener("click", () => document.querySelector(".lc-v3-shell [data-v3-personalise]")?.click()));
    shell.querySelectorAll("[data-v4-map]").forEach((button) => button.addEventListener("click", () => {
      document.documentElement.classList.add("lc-v4-map-open");
      const map = document.querySelector(".report-overview-section");
      map?.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    shell.querySelectorAll("[data-v4-evidence]").forEach((button) => button.addEventListener("click", () => {
      const details = document.querySelector(".report-facts-section details, .report-sources-section details, .report-facts-section");
      if (details?.tagName === "DETAILS") details.open = true;
      details?.scrollIntoView({ behavior: "smooth", block: "start" });
    }));

    window.dispatchEvent(new CustomEvent("lemoncheck:ux-v4-ready", { detail: { version: VERSION, propertyId: String(data.property_id) } }));
  }

  let lastSignature = "";
  function sync() {
    if (location.hash.includes("/preview/full-report")) return;
    const data = window.PROPERTY_DATA;
    const assessment = window.LEMONCHECK_ASSESSMENT;
    if (!data?.property_id || !data?.canonical_address || !assessment?.objective) return;
    const signature = JSON.stringify([
      data.property_id,
      data.canonical_address,
      assessment.objective?.lemonScore,
      assessment.deal?.score,
      assessment.fit?.score,
      assessment.development?.score,
      assessment.confidence?.score,
      assessment.flags?.length,
      assessment.advisories?.length,
    ]);
    if (signature !== lastSignature || !document.querySelector('[data-ux-version="LC-UX-v0.4.0"]')) {
      lastSignature = signature;
      render(data, assessment);
    }
  }

  ["lemoncheck:governance-ready", "lemoncheck:assessment-ready", "lemoncheck:pricing-ready", "hashchange"].forEach((eventName) => {
    window.addEventListener(eventName, () => setTimeout(sync, eventName === "hashchange" ? 100 : 0));
  });
  setInterval(sync, 350);
  setTimeout(sync, 0);
})();
