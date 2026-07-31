(() => {
  "use strict";

  const VERSION = "LC-UX-v0.3.0";
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
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
    return `${new Intl.NumberFormat("en-AU").format(Math.round(values.reduce((sum, item) => sum + item, 0)))} m²`;
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

  function scoreValue(value, suffix = "/100") {
    return Number.isFinite(value)
      ? `<strong>${Math.round(value)}<small>${suffix}</small></strong>`
      : `<strong class="lc-v3-empty">—</strong>`;
  }

  function status(assessment) {
    const hard = Array.isArray(assessment.flags) ? assessment.flags.length : 0;
    const advisory = Array.isArray(assessment.advisories) ? assessment.advisories.length : 0;
    if (hard > 0) return {
      tone: "risk",
      label: "Investigate before offering",
      title: `${hard} material issue${hard === 1 ? "" : "s"} need attention.`,
      copy: "The mapped screening has found issues that may affect cost, use or insurability.",
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
      tone: "unknown",
    },
    "Contract, approvals and title review": {
      title: "Legal and approval checks are missing",
      consequence: "Ownership, easements, unapproved works and contract risks are not confirmed.",
      action: "Ask a conveyancer to review the contract, title and approvals.",
      tone: "unknown",
    },
    "Market value and comparable sales": {
      title: "Price has not been assessed",
      consequence: "LemonCheck cannot yet say whether the asking price represents value.",
      action: "Treat price and Deal Score as pending.",
      tone: "unknown",
    },
    "Insurance availability and terms": {
      title: "Insurance is unchecked",
      consequence: "Mapped screening does not confirm that cover is available or affordable.",
      action: "Obtain an address-specific insurance quote.",
      tone: "unknown",
    },
  };

  function findings(assessment) {
    const output = [];
    const add = (tone, title, consequence, action) => {
      if (!title || output.some((item) => item.title === title)) return;
      output.push({ tone, title, consequence: consequence || "Review the detailed evidence.", action: action || "Investigate before relying on this result." });
    };
    (assessment.flags || []).forEach((item) => add("risk", item.title, item.detail, item.action));
    (assessment.advisories || []).forEach((item) => add("review", item.title, item.detail, item.action));
    (assessment.confidence?.gaps || []).forEach((gap) => {
      const mapped = GAP_COPY[gap];
      if (mapped) add(mapped.tone, mapped.title, mapped.consequence, mapped.action);
    });
    while (output.length < 3) add("positive", "No additional mapped concern", "No further material finding was returned by the connected public sources.", "Continue with normal property due diligence.");
    return output.slice(0, 3);
  }

  function lens(key, label, value, suffix = "/100") {
    const score = finite(value);
    return `<article class="lc-v3-lens" data-v3-lens="${escapeHtml(key)}">
      <span>${escapeHtml(label)}</span>
      ${scoreValue(score, suffix)}
      <small>${escapeHtml(scoreLabel(key, score))}</small>
    </article>`;
  }

  function personalise() {
    const old = document.querySelector(".lc-v2-summary [data-v2-open-details]");
    if (old) old.click();
    const original = document.querySelector(".lemoncheck-decision-section");
    if (original) {
      original.hidden = false;
      original.classList.add("is-open");
      setTimeout(() => {
        const details = original.querySelector(".lc-simple-details");
        if (details && !details.open) details.open = true;
        (details || original).scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  }

  function compactChrome() {
    if (location.hash.includes("/preview/full-report")) return;
    const nodes = [...document.querySelectorAll("body *")];
    const banner = nodes.find((node) => node.children.length < 4 && /Live Brisbane beta\. Official sources/i.test(node.textContent || ""));
    if (banner) banner.classList.add("lc-v3-hide-beta-banner");
    const brandCandidates = [...document.querySelectorAll("header *, nav *")];
    brandCandidates.forEach((node) => {
      if (node.children.length === 0 && node.textContent?.trim() === "Property Check") node.textContent = "LemonCheck";
    });
    document.documentElement.classList.add("lc-v3-active");
  }

  function render(data, assessment) {
    if (location.hash.includes("/preview/full-report")) return;
    if (!data?.property_id || !data?.canonical_address || !assessment?.objective) return;
    compactChrome();

    const oldSummary = document.querySelector(".lc-v2-summary");
    const original = document.querySelector(".lemoncheck-decision-section");
    if (!oldSummary || !original) return;

    let shell = document.querySelector(".lc-v3-shell");
    if (!shell) {
      shell = document.createElement("main");
      shell.className = "lc-v3-shell";
      oldSummary.insertAdjacentElement("beforebegin", shell);
    }

    const state = status(assessment);
    const lemon = finite(assessment.objective?.lemonScore);
    const deal = finite(assessment.deal?.score);
    const fit = finite(assessment.fit?.score);
    const development = finite(assessment.development?.score);
    const confidence = finite(assessment.confidence?.score);
    const parcelCount = Number(metric(data, "property.parcel_count")?.value || data.parcels?.length || 1);
    const items = findings(assessment);

    shell.innerHTML = `<div class="container lc-v3-container" data-ux-version="${VERSION}">
      <header class="lc-v3-property-bar">
        <div>
          <span class="lc-v3-eyebrow">Property decision check</span>
          <h1>${escapeHtml(data.canonical_address)}</h1>
          <p>${parcelCount} parcel${parcelCount === 1 ? "" : "s"} · ${escapeHtml(areaLabel(data))} · ${escapeHtml(zoneLabel(data))}</p>
        </div>
        <div class="lc-v3-property-actions">
          <button type="button" class="lc-v3-button-secondary" data-v3-save>Save</button>
          <button type="button" class="lc-v3-button-secondary" data-v3-compare>Compare</button>
          <button type="button" class="lc-v3-button-primary" data-v3-new>New search</button>
        </div>
      </header>

      <section class="lc-v3-decision lc-v3-${state.tone}">
        <div class="lc-v3-answer">
          <span class="lc-v3-status">${escapeHtml(state.label)}</span>
          <h2>${escapeHtml(state.title)}</h2>
          <p>${escapeHtml(state.copy)}</p>
          <div class="lc-v3-boundary"><b>Current boundary:</b> mapped public data only. Building, legal, insurance and pricing checks remain incomplete.</div>
        </div>
        <div class="lc-v3-score-pair" aria-label="Mapped score and evidence coverage">
          <article>
            <span>Mapped score</span>
            ${scoreValue(lemon)}
            <small>${escapeHtml(scoreLabel("lemon", lemon))}</small>
          </article>
          <article>
            <span>Evidence checked</span>
            ${scoreValue(confidence, "%")}
            <small>${escapeHtml(scoreLabel("confidence", confidence))}</small>
          </article>
          <div class="lc-v3-coverage-track"><i style="width:${Math.max(0, Math.min(100, confidence || 0))}%"></i></div>
        </div>
      </section>

      <section class="lc-v3-market-row" aria-label="Price and five decision lenses">
        <article class="lc-v3-price"><span>Property price</span><strong>$–</strong><small>Live pricing unavailable</small></article>
        ${lens("lemon", "Lemon", lemon)}
        ${lens("deal", "Deal", deal)}
        ${lens("fit", "Personal fit", fit)}
        ${lens("development", "Development", development)}
        ${lens("confidence", "Evidence", confidence, "%")}
      </section>

      <section class="lc-v3-workspace">
        <div class="lc-v3-findings">
          <div class="lc-v3-section-heading"><span>What matters now</span><h3>Three findings that could change your decision</h3></div>
          <div class="lc-v3-finding-list">
            ${items.map((item, index) => `<article class="lc-v3-finding lc-v3-finding-${escapeHtml(item.tone)}">
              <b>${index + 1}</b>
              <div><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.consequence)}</p><small><strong>Next:</strong> ${escapeHtml(item.action)}</small></div>
            </article>`).join("")}
          </div>
        </div>
        <aside class="lc-v3-next-card">
          <span>Best next step</span>
          <h3>Personalise the check before comparing properties.</h3>
          <p>Tell LemonCheck whether you plan to live in, invest, renovate or develop. Objective facts stay fixed; relevance and Personal Fit update.</p>
          <button type="button" class="lc-v3-button-primary" data-v3-personalise>Personalise this check</button>
          <button type="button" class="lc-v3-text-button" data-v3-details>View detailed evidence</button>
        </aside>
      </section>
    </div>`;

    oldSummary.hidden = true;
    original.hidden = true;
    document.querySelector(".report-hero")?.classList.add("lc-v3-hidden");

    const map = document.querySelector(".report-overview-section");
    if (map && shell.nextElementSibling !== map) shell.insertAdjacentElement("afterend", map);
    if (map) map.classList.add("lc-v3-map");

    shell.querySelector("[data-v3-save]")?.addEventListener("click", () => document.querySelector(".lc-v2-summary [data-v2-save]")?.click());
    shell.querySelector("[data-v3-compare]")?.addEventListener("click", () => document.querySelector(".lc-v2-summary [data-v2-compare]")?.click());
    shell.querySelector("[data-v3-new]")?.addEventListener("click", () => { location.hash = "#/home"; });
    shell.querySelector("[data-v3-personalise]")?.addEventListener("click", personalise);
    shell.querySelector("[data-v3-details]")?.addEventListener("click", personalise);

    window.dispatchEvent(new CustomEvent("lemoncheck:ux-v3-ready", { detail: { version: VERSION, propertyId: String(data.property_id) } }));
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
    const currentAddress = document.querySelector(".lc-v3-property-bar h1")?.textContent?.trim();
    if (signature !== lastSignature || currentAddress !== data.canonical_address) {
      lastSignature = signature;
      render(data, assessment);
    }
  }

  ["lemoncheck:governance-ready", "lemoncheck:assessment-ready", "lemoncheck:pricing-ready", "hashchange"].forEach((eventName) => {
    window.addEventListener(eventName, () => setTimeout(sync, eventName === "hashchange" ? 80 : 0));
  });
  setInterval(sync, 300);
  setTimeout(sync, 0);
})();
