(() => {
  "use strict";

  const CLIENT_VERSION = "LC-PRICE-CLIENT-v0.1.0";
  const PRICING_SCHEMA = "LC-PRICE-v0.1.0";
  const pricingByPropertyId = new Map();
  const requestByPropertyId = new Map();
  const addressByPropertyId = new Map();

  const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  const amount = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  const money = (value) => Number.isFinite(Number(value))
    ? new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(Number(value))
    : "Not available";

  function configureBuyerForm() {
    const form = document.querySelector(".lc-profile-form");
    if (!form) return;
    const fairValueInput = form.querySelector('[name="fairValue"]');
    const fairValueLabel = fairValueInput?.closest("label");
    if (fairValueInput) {
      fairValueInput.value = "";
      fairValueInput.disabled = true;
      fairValueInput.setAttribute("aria-disabled", "true");
    }
    if (fairValueLabel) {
      fairValueLabel.hidden = true;
      fairValueLabel.dataset.replacedByAutomatedPricing = "true";
    }
    const priceInput = form.querySelector('[name="price"]');
    const priceLabel = priceInput?.closest("label");
    if (priceLabel && !priceLabel.dataset.pricingLabelUpdated) {
      const firstText = [...priceLabel.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
      if (firstText) firstText.textContent = "Your intended offer (optional)";
      priceLabel.dataset.pricingLabelUpdated = "true";
      priceInput.placeholder = "Uses numeric asking price when blank";
    }
    const heading = form.querySelector(".lc-profile-heading p");
    if (heading) heading.textContent = "Your intended offer and known costs stay in this browser. Market value and current asking price are pulled automatically.";
  }

  function ensurePanel() {
    const section = document.querySelector(".lemoncheck-decision-section .container");
    const scoreGrid = section?.querySelector(".lc-five-score-grid");
    if (!section || !scoreGrid) return null;
    let panel = section.querySelector(".lc-pricing-panel");
    if (!panel) {
      panel = document.createElement("section");
      panel.className = "lc-pricing-panel";
      panel.dataset.clientVersion = CLIENT_VERSION;
      scoreGrid.insertAdjacentElement("beforebegin", panel);
    }
    return panel;
  }

  function renderStatus({ state, title, text }) {
    const panel = ensurePanel();
    if (!panel) return;
    panel.className = `lc-pricing-panel lc-pricing-${state}`;
    panel.innerHTML = `<div class="lc-pricing-status"><span>Automated pricing</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></div>`;
  }

  function lastSale(pricing) {
    return Array.isArray(pricing.saleHistory) && pricing.saleHistory.length ? pricing.saleHistory[0] : null;
  }

  function renderPricing(pricing, deal) {
    const panel = ensurePanel();
    if (!panel) return;
    const estimate = pricing.marketEstimate || {};
    const listing = pricing.listing || {};
    const sale = lastSale(pricing);
    const estimateRange = estimate.available
      ? `${money(estimate.low)} – ${money(estimate.high)}`
      : "Not returned";
    const listingText = listing.displayPrice || "No current listing returned";
    const match = pricing.propertyMatch || {};
    panel.className = `lc-pricing-panel lc-pricing-${pricing.status || "partial"}`;
    panel.innerHTML = `<div class="lc-pricing-head"><div><span>Automated pricing · ${escapeHtml(PRICING_SCHEMA)}</span><h3>Price evidence for the matched property.</h3><p>Asking price, market estimate and sale evidence remain separate. None is a professional valuation.</p></div><b>${escapeHtml(pricing.status || "unknown")}</b></div>
      <div class="lc-pricing-grid">
        <article><span>Current listing</span><strong>${escapeHtml(listingText)}</strong><small>${listing.price?.numeric ? `Parsed ${money(listing.price.low)}${listing.price.high !== listing.price.low ? ` – ${money(listing.price.high)}` : ""}` : "No numeric listing price inferred"}</small></article>
        <article><span>Market estimate</span><strong>${estimate.available ? money(estimate.mid) : "Not returned"}</strong><small>${escapeHtml(estimateRange)}${estimate.confidence ? ` · ${escapeHtml(estimate.confidence)} confidence` : ""}</small></article>
        <article><span>Most recent sale</span><strong>${sale?.price ? money(sale.price) : "Not returned"}</strong><small>${escapeHtml(sale?.date || "No sale date available")}</small></article>
        <article><span>Deal calculation</span><strong>${deal.score === null ? "Waiting" : `${deal.score}/100`}</strong><small>${escapeHtml(deal.reason)}</small></article>
      </div>
      <details><summary>Pricing evidence and limitations</summary><div class="lc-pricing-evidence"><p><b>Matched address:</b> ${escapeHtml(match.address || "Not resolved")} · ${escapeHtml(match.quality || "unknown match")}</p><p><b>Provider property ID:</b> ${escapeHtml(match.propertyId || "Not returned")}</p><p><b>Retrieved:</b> ${escapeHtml(pricing.generatedAt || "Unknown")}</p><ul>${(pricing.sources || []).map((source) => `<li><b>${escapeHtml(source.kind)}</b>: ${escapeHtml(source.limitation)}</li>`).join("")}</ul></div></details>`;
  }

  function automatedDeal(pricing, assessment) {
    const estimate = pricing.marketEstimate || {};
    const profile = assessment.profile || {};
    const listingAmount = pricing.listing?.price?.numeric ? amount(pricing.listing.price.mid) : null;
    const intendedOffer = amount(profile.price);
    const purchasePrice = intendedOffer && intendedOffer > 0 ? intendedOffer : listingAmount;
    const estimateMid = amount(estimate.mid);
    const knownCosts = Math.max(0, amount(profile.costs) || 0);
    if (!estimate.available || !estimateMid) {
      return { score: null, purchasePrice, adjustedValue: null, gap: null, reason: "The automated provider did not return a market estimate." };
    }
    if (!purchasePrice) {
      return { score: null, purchasePrice: null, adjustedValue: null, gap: null, reason: "The listing has no numeric asking price. Add your intended offer to calculate Deal Score." };
    }
    const low = amount(estimate.low);
    const high = amount(estimate.high);
    const uncertaintyAllowance = low && high && high >= low ? Math.round((high - low) * 0.25) : 0;
    const adjustedValue = Math.max(0, estimateMid - knownCosts - uncertaintyAllowance);
    const gap = adjustedValue - purchasePrice;
    const gapRatio = estimateMid ? gap / estimateMid : 0;
    const score = clamp(Math.round(50 + (gapRatio * 400)));
    const priceSource = intendedOffer ? "your intended offer" : "the parsed listing price";
    return {
      score,
      purchasePrice,
      adjustedValue,
      gap,
      uncertaintyAllowance,
      source: priceSource,
      reason: `${money(gap)} headroom using ${priceSource}, the AVM midpoint, ${money(knownCosts)} known costs and ${money(uncertaintyAllowance)} range allowance.`,
    };
  }

  function updateScoreCard(key, score, reason) {
    const card = document.querySelector(`[data-score-key="${key}"]`);
    if (!card) return;
    const state = score === null ? "pending" : score >= 75 ? "strong" : score >= 50 ? "mixed" : "weak";
    card.className = `lc-score-card lc-score-${state}`;
    const holder = card.querySelector(".lc-score-card-head");
    const existing = holder?.querySelector("strong");
    if (existing) existing.innerHTML = score === null ? "—" : `${score}<small>/100</small>`;
    const track = card.querySelector(".lc-score-track i");
    if (track) track.style.width = `${score === null ? 0 : score}%`;
    const explanation = card.querySelector(".lc-score-reason");
    if (explanation) explanation.textContent = reason;
  }

  function updateDecision(assessment) {
    if (assessment.deal?.score === null || assessment.deal.score >= 40) return;
    const hasCritical = (assessment.flags || []).some((flag) => flag.severity === "critical");
    if (hasCritical) return;
    assessment.decision = { code: "price", title: "Price looks unfavourable", text: "The automated price evidence and current purchase-price assumption leave limited or negative risk-adjusted headroom." };
    const hero = document.querySelector(".lc-decision-hero");
    if (hero) hero.className = "lc-decision-hero lc-decision-price";
    const title = hero?.querySelector("h2");
    const text = hero?.querySelector("p");
    if (title) title.textContent = assessment.decision.title;
    if (text) text.textContent = `${assessment.decision.text} This remains a shortlist screen, not a valuation or buying recommendation.`;
  }

  function applyPricing(pricing, assessment, propertyId) {
    const clientPropertyId = String(propertyId || assessment.propertyId || window.PROPERTY_DATA?.property_id || "");
    pricing.lemoncheckPropertyId = clientPropertyId;
    const deal = automatedDeal(pricing, assessment);
    assessment.deal = deal;
    assessment.pricing = pricing;
    assessment.pricingClientVersion = CLIENT_VERSION;
    if (pricing.marketEstimate?.available) {
      const pricingEvidenceScore = pricing.listing?.status !== "not_found" ? 15 : 10;
      const baseConfidence = Number.isFinite(Number(assessment.confidence?.withoutPricingScore))
        ? Number(assessment.confidence.withoutPricingScore)
        : Number(assessment.confidence?.score || 0);
      assessment.confidence.withoutPricingScore = baseConfidence;
      assessment.confidence.pricingEvidenceScore = pricingEvidenceScore;
      assessment.confidence.score = Math.min(70, baseConfidence + pricingEvidenceScore);
      assessment.confidence.gaps = (assessment.confidence.gaps || []).filter((gap) => gap !== "Market value and comparable sales" && gap !== "Comparable sales validation");
      if (!Array.isArray(pricing.saleHistory) || !pricing.saleHistory.length) assessment.confidence.gaps.push("Comparable sales validation");
    }
    window.LEMONCHECK_PRICING = pricing;
    window.LEMONCHECK_PRICING_PROPERTY_ID = clientPropertyId;
    window.LEMONCHECK_ASSESSMENT = assessment;
    if (window.PROPERTY_DATA && String(window.PROPERTY_DATA.property_id) === clientPropertyId) {
      window.PROPERTY_DATA.pricing = pricing;
      window.PROPERTY_DATA.five_score_assessment = assessment;
    }
    updateScoreCard("deal", deal.score, deal.reason);
    updateScoreCard("confidence", assessment.confidence.score, `Whole-assessment confidence including automated pricing evidence. Connected public-source confidence remains ${assessment.confidence.publicSourceScore ?? "not available"}/100.`);
    updateDecision(assessment);
    renderPricing(pricing, deal);
    window.dispatchEvent(new CustomEvent("lemoncheck:pricing-ready", { detail: { pricing, assessment, propertyId: clientPropertyId } }));
  }

  function markUnavailable(assessment, message, propertyId) {
    const existing = pricingByPropertyId.get(String(propertyId || ""));
    if (existing) {
      applyPricing(existing, assessment, propertyId);
      return;
    }
    assessment.deal = { score: null, reason: message };
    assessment.pricingClientVersion = CLIENT_VERSION;
    window.LEMONCHECK_ASSESSMENT = assessment;
    updateScoreCard("deal", null, message);
    renderStatus({ state: "unavailable", title: "Automated pricing unavailable", text: message });
    window.dispatchEvent(new CustomEvent("lemoncheck:pricing-ready", { detail: { pricing: null, assessment, propertyId: String(propertyId || "") } }));
  }

  function stableQueryAddress(data, propertyId) {
    const key = String(propertyId);
    const retained = addressByPropertyId.get(key);
    if (retained) return retained;
    let address = String(data.canonical_address || "").trim();
    const postcode = String(data.postcode || "").trim();
    if (postcode && !new RegExp(`\\b${postcode}\\b`).test(address)) address = `${address} ${postcode}`.trim();
    addressByPropertyId.set(key, address);
    return address;
  }

  function validatePricing(pricing) {
    if (pricing.schemaVersion !== PRICING_SCHEMA) throw new Error(`Unsupported pricing schema ${pricing.schemaVersion || "missing"}`);
    if (pricing.propertyMatch?.quality !== "exact") throw new Error("The pricing provider did not return an exact address match.");
    if (pricing.propertyMatch?.provider === "fixture" && location.hostname !== "127.0.0.1" && location.hostname !== "localhost") throw new Error("Test fixture pricing is blocked outside local validation.");
    return pricing;
  }

  async function loadPricing(assessment) {
    configureBuyerForm();
    const data = window.PROPERTY_DATA;
    if (!data?.property_id || !data?.canonical_address || !assessment) return;
    const propertyId = String(data.property_id);
    const base = String(window.LEMONCHECK_PRICING_API_BASE || "").replace(/\/$/, "");

    if (String(window.LEMONCHECK_PRICING_PROPERTY_ID || "") !== propertyId) {
      window.LEMONCHECK_PRICING = null;
      window.LEMONCHECK_PRICING_PROPERTY_ID = propertyId;
    }

    const retained = pricingByPropertyId.get(propertyId) || (data.pricing?.propertyMatch?.quality === "exact" ? data.pricing : null);
    if (retained) {
      pricingByPropertyId.set(propertyId, retained);
      applyPricing(retained, assessment, propertyId);
      return;
    }

    if (!base) {
      markUnavailable(assessment, "The automated pricing gateway is built but no live provider URL is configured yet. Manual fair value has been disabled.", propertyId);
      return;
    }

    renderStatus({ state: "loading", title: "Loading price evidence", text: "Resolving the provider property record, AVM, current listing and sale history." });
    let promise = requestByPropertyId.get(propertyId);
    if (!promise) {
      const queryAddress = stableQueryAddress(data, propertyId);
      promise = fetch(`${base}/v1/pricing?address=${encodeURIComponent(queryAddress)}`, { headers: { Accept: "application/json" } })
        .then(async (response) => {
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.message || `Pricing gateway returned HTTP ${response.status}`);
          return validatePricing(payload);
        })
        .then((pricing) => {
          pricing.lemoncheckPropertyId = propertyId;
          pricingByPropertyId.set(propertyId, pricing);
          return pricing;
        })
        .finally(() => requestByPropertyId.delete(propertyId));
      requestByPropertyId.set(propertyId, promise);
    }

    try {
      const pricing = await promise;
      if (String(window.PROPERTY_DATA?.property_id) !== propertyId) return;
      applyPricing(pricing, assessment, propertyId);
    } catch (error) {
      const existing = pricingByPropertyId.get(propertyId);
      if (String(window.PROPERTY_DATA?.property_id) !== propertyId) return;
      if (existing) applyPricing(existing, assessment, propertyId);
      else markUnavailable(assessment, error.message || "The automated pricing provider failed.", propertyId);
    }
  }

  window.addEventListener("lemoncheck:governance-ready", (event) => loadPricing(event.detail));
  window.addEventListener("lemoncheck:assessment-ready", () => configureBuyerForm());
  if (window.LEMONCHECK_ASSESSMENT?.governanceVersion) loadPricing(window.LEMONCHECK_ASSESSMENT);
})();
