(() => {
  "use strict";

  const MODEL_VERSION = "LC-BNE-5L-v0.2.0";
  const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  const metricById = (data, id) => (data.metrics || []).find((item) => item.metric_id === id);
  const isDetected = (data, id) => metricById(data, id)?.status === "detected";
  const isResolved = (item) => Boolean(item) && item.status !== "not_assessed" && item.source?.mode !== "unavailable";

  function valueLooksMaterial(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "boolean") return value;
    const text = String(value).trim().toLowerCase();
    if (!text) return false;
    return !new Set(["0", "0.0", "false", "no", "none", "n", "not affected", "not detected", "null", "na", "n/a", "nil", "no matching records returned"]).has(text);
  }

  function floodGroupIsMaterial(data, id) {
    const item = metricById(data, id);
    if (!item || item.status !== "detected") return false;
    if (!Array.isArray(item.value)) return true;
    return item.value.some((entry) => valueLooksMaterial(entry?.value ?? entry));
  }

  function money(value) {
    if (!Number.isFinite(value)) return "Not supplied";
    return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);
  }

  function numberFromForm(form, name) {
    const value = Number(String(new FormData(form).get(name) || "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  function loadProfile(propertyId) {
    try {
      return JSON.parse(localStorage.getItem(`lemoncheck-profile-${propertyId}`) || "null") || {};
    } catch (_error) {
      return {};
    }
  }

  function saveProfile(propertyId, profile) {
    try {
      localStorage.setItem(`lemoncheck-profile-${propertyId}`, JSON.stringify(profile));
    } catch (_error) {
      // The assessment still works if storage is blocked.
    }
  }

  function calculateObjective(data) {
    const hazardContributions = [
      { label: "Overland-flow screening records", points: floodGroupIsMaterial(data, "flood.fpa.overland_flow") ? 15 : 0, severity: "material" },
      { label: "River or creek screening records", points: floodGroupIsMaterial(data, "flood.flag.overland_flow") ? 20 : 0, severity: "material" },
      { label: "Storm-tide or coastal screening records", points: floodGroupIsMaterial(data, "flood.flag.large_allotment") ? 20 : 0, severity: "material" },
      { label: "Bushfire overlay", points: isDetected(data, "constraint.bushfire") ? 15 : 0, severity: "material" },
      { label: "Waterway corridor overlay", points: isDetected(data, "constraint.waterway_corridor") ? 10 : 0, severity: "advisory" },
    ];
    const parcelCount = Number(metricById(data, "property.parcel_count")?.value || data.parcels?.length || 0);
    const siteContributions = [
      { label: "Mapped easement parcel intersection", points: isDetected(data, "constraint.mapped_secondary_interests") ? 12 : 0, severity: "material" },
      { label: "Multiple cadastral parcels", points: parcelCount > 1 ? Math.min(12, (parcelCount - 1) * 4) : 0, severity: "advisory" },
    ];
    const hazardRisk = clamp(hazardContributions.reduce((sum, item) => sum + item.points, 0));
    const siteRisk = clamp(siteContributions.reduce((sum, item) => sum + item.points, 0));
    const totalRisk = clamp(hazardRisk + siteRisk);
    return {
      lemonScore: 100 - totalRisk,
      totalRisk,
      hazardRisk,
      siteRisk,
      contributors: [...hazardContributions, ...siteContributions].filter((item) => item.points > 0),
    };
  }

  function calculateConfidence(data) {
    const floodMetrics = (data.metrics || []).filter((item) => item.category === "Flood");
    const planningChecks = [
      metricById(data, "planning.heritage.state"),
      metricById(data, "planning.heritage.reference"),
      metricById(data, "planning.heritage.entry_date"),
      metricById(data, "planning.character"),
      metricById(data, "constraint.bushfire"),
      metricById(data, "constraint.waterway_corridor"),
    ];
    const resolvedPlanning = planningChecks.filter(isResolved).length;
    const checks = [
      { label: "Address identity", weight: 15, passed: isResolved(metricById(data, "property.address")) },
      { label: "Lot and parcel identity", weight: 15, passed: isResolved(metricById(data, "property.parcels")) && (data.parcels || []).length > 0 },
      { label: "Parcel area", weight: 10, passed: isResolved(metricById(data, "property.parcel_area")) },
      { label: "Current zoning screen", weight: 15, passed: isResolved(metricById(data, "planning.zone")) },
      { label: "Flood screening", weight: 20, passed: floodMetrics.length > 0 && floodMetrics.some(isResolved) },
      { label: "Mapped easement screen", weight: 10, passed: isResolved(metricById(data, "constraint.mapped_secondary_interests")) },
      { label: "Planning and constraint coverage", weight: 10, passed: resolvedPlanning >= 4 },
      { label: "Source provenance", weight: 5, passed: (data.metrics || []).every((item) => item.source?.source_id && item.source?.owner) },
    ];
    const score = checks.reduce((sum, check) => sum + (check.passed ? check.weight : 0), 0);
    return { score: clamp(score), checks, gaps: checks.filter((check) => !check.passed).map((check) => check.label) };
  }

  function calculateDevelopment(data) {
    const zoning = metricById(data, "planning.zone");
    if (!isResolved(zoning)) return { score: null, reason: "Current zoning was not resolved." };
    const deductions = [
      { label: "State heritage overlay", points: isDetected(data, "planning.heritage.state") ? 30 : 0 },
      { label: "Local heritage overlay", points: isDetected(data, "planning.heritage.reference") ? 22 : 0 },
      { label: "Pre-1911 building overlay", points: isDetected(data, "planning.heritage.entry_date") ? 12 : 0 },
      { label: "Dwelling-house character overlay", points: isDetected(data, "planning.character") ? 8 : 0 },
      { label: "Mapped easement intersection", points: isDetected(data, "constraint.mapped_secondary_interests") ? 15 : 0 },
      { label: "Waterway corridor", points: isDetected(data, "constraint.waterway_corridor") ? 10 : 0 },
      { label: "Bushfire overlay", points: isDetected(data, "constraint.bushfire") ? 8 : 0 },
    ].filter((item) => item.points > 0);
    const score = clamp(80 - deductions.reduce((sum, item) => sum + item.points, 0));
    return {
      score,
      deductions,
      reason: "Constraint-based development flexibility. It is capped at 80 until height, setbacks, servicing, approvals and feasibility are connected.",
    };
  }

  function calculateDeal(profile) {
    const price = profile.price;
    const fairValue = profile.fairValue;
    const costs = profile.costs || 0;
    if (![price, fairValue].every((value) => Number.isFinite(value) && value > 0)) {
      return { score: null, reason: "Add a proposed price and your risk-adjusted fair value." };
    }
    const gap = fairValue - price - costs;
    const gapRatio = gap / fairValue;
    return {
      score: clamp(Math.round(50 + (gapRatio * 400))),
      gap,
      gapRatio,
      reason: `${money(gap)} risk-adjusted headroom after your supplied costs.`,
    };
  }

  function calculateFit(data, profile, objective, development) {
    if (!profile.goal) return { score: null, reason: "Choose what you want to do with the property." };
    if (profile.goal === "invest") {
      return { score: null, reason: "Investor fit needs rent, yield, vacancy and market-strength data that are not yet connected." };
    }
    const toleranceFactor = { cautious: 1.15, balanced: 0.75, comfortable: 0.4 }[profile.riskTolerance || "balanced"];
    let score = 86 - (objective.hazardRisk * toleranceFactor * 0.7);
    const notes = [];
    if (objective.hazardRisk > 0) notes.push("mapped hazard indicators");
    if (profile.simpleTitle && objective.siteRisk > 0) {
      score -= objective.siteRisk * 1.2;
      notes.push("parcel or easement complexity conflicts with your preference");
    }
    if (profile.plannedWorks || profile.goal === "renovate" || profile.goal === "develop") {
      if (development.score === null) return { score: null, reason: "Planning evidence is incomplete for your intended works." };
      const developmentPenalty = (100 - development.score) * (profile.goal === "develop" ? 0.75 : 0.35);
      score -= developmentPenalty;
      if (developmentPenalty > 0) notes.push("mapped planning constraints affect your intended works");
    }
    if (profile.goal === "develop" && development.score !== null) score = (score * 0.35) + (development.score * 0.65);
    return {
      score: clamp(Math.round(score)),
      reason: notes.length ? `Adjusted for ${notes.join(" and ")}.` : "No current mapped fact conflicts with the selected buyer profile.",
    };
  }

  function buildFlags(data, objective, confidence, development, profile) {
    const flags = [];
    const add = (severity, title, detail, stage, action) => flags.push({ severity, title, detail, stage, action });
    if (!isResolved(metricById(data, "property.address")) || !(data.parcels || []).length) {
      add("critical", "Property identity is unresolved", "The address-to-parcel chain is incomplete.", "before_offer", "Confirm the exact lot and property identity before relying on any other result.");
    }
    if (floodGroupIsMaterial(data, "flood.flag.overland_flow")) add("material", "River or creek flood records returned", "Parcel-level screening records require property-specific interpretation.", "before_offer", "Obtain the current FloodWise report and a property-specific insurance quote.");
    if (floodGroupIsMaterial(data, "flood.fpa.overland_flow")) add("material", "Overland-flow records returned", "Mapped flow can affect drainage, access and insurance even when the dwelling floor is not affected.", "before_inspection", "Inspect drainage paths and confirm dwelling floor levels and insurance terms.");
    if (floodGroupIsMaterial(data, "flood.flag.large_allotment")) add("material", "Storm-tide or coastal records returned", "Coastal mechanisms require source-specific review.", "before_offer", "Obtain current flood and insurance advice for the exact property.");
    if (isDetected(data, "constraint.bushfire")) add("material", "Bushfire overlay detected", "Mapped bushfire exposure can affect construction, access and insurance.", "before_offer", "Confirm site-specific bushfire requirements and insurance availability.");
    if (isDetected(data, "constraint.mapped_secondary_interests")) add("material", "Mapped easement parcel intersects the property", "The mapped layer is not a title search but warrants legal follow-up.", "before_offer", "Ask the conveyancer to review current title documents and the easement's practical effect.");
    if (isDetected(data, "planning.heritage.state") || isDetected(data, "planning.heritage.reference")) add("advisory", "Heritage controls may apply", "Heritage controls can restrict alteration, demolition or development.", "before_offer", "Confirm the current heritage controls with a planner if changes are intended.");
    if (isDetected(data, "planning.character") || isDetected(data, "planning.heritage.entry_date")) add("advisory", "Character or pre-1911 controls may apply", "These controls matter primarily if alteration, demolition or redevelopment is contemplated.", "before_offer", "Test the intended works against the current planning scheme.");
    if ((data.parcels || []).length > 1) add("advisory", "Multiple parcels are associated with the address", "The legal holding and practical use may be more complex than a single-lot property.", "before_offer", "Confirm all lots included in the contract and how they are held.");
    if (confidence.score < 60) add("unresolved", "Evidence confidence is low", `${confidence.gaps.length} key evidence areas remain unresolved.`, "before_offer", "Resolve the missing evidence before relying on the score.");
    if ((profile.goal === "develop" || profile.plannedWorks) && development.score !== null && development.score < 45) add("material", "Mapped constraints conflict with intended works", "The current constraint screen indicates limited development flexibility.", "before_offer", "Obtain site-specific planning advice before valuing development upside.");
    return flags;
  }

  function decisionFrom(assessment) {
    const critical = assessment.flags.filter((flag) => flag.severity === "critical").length;
    const material = assessment.flags.filter((flag) => flag.severity === "material").length;
    if (critical) return { code: "professional_review", title: "Professional review required", text: "A critical property-identity or evidence issue prevents a reliable screening conclusion." };
    if (assessment.confidence.score < 60) return { code: "insufficient", title: "Insufficient evidence", text: "Complete the missing evidence before relying on the property scores." };
    if (assessment.deal.score !== null && assessment.deal.score < 40) return { code: "price", title: "Price looks unfavourable", text: "Your supplied price and risk-adjusted fair value leave limited or negative headroom." };
    if (assessment.fit.score !== null && assessment.fit.score < 45) return { code: "fit", title: "Likely poor fit", text: "The mapped facts conflict with your stated purpose or tolerances." };
    if (assessment.objective.lemonScore < 60 || material >= 2) return { code: "investigate", title: "Investigate before offering", text: "Multiple material issues need targeted follow-up before an offer is made." };
    if (material === 1) return { code: "conditions", title: "Proceed only after targeted checks", text: "One material issue needs to be resolved or explicitly accepted." };
    return { code: "shortlist", title: "Worth shortlisting", text: "No material issue has been identified in the currently connected public-data scope." };
  }

  function calculateAssessment(data, profile) {
    const objective = calculateObjective(data);
    const confidence = calculateConfidence(data);
    const development = calculateDevelopment(data);
    const deal = calculateDeal(profile);
    const fit = calculateFit(data, profile, objective, development);
    const assessment = {
      modelVersion: MODEL_VERSION,
      propertyId: String(data.property_id),
      generatedAt: new Date().toISOString(),
      objective,
      deal,
      fit,
      development,
      confidence,
      profile,
      flags: [],
      decision: null,
    };
    assessment.flags = buildFlags(data, objective, confidence, development, profile);
    assessment.decision = decisionFrom(assessment);
    return assessment;
  }

  function scoreValue(score, emptyLabel = "Add inputs") {
    return score === null ? `<strong class="lc-score-empty">—</strong><small>${escapeHtml(emptyLabel)}</small>` : `<strong>${score}<small>/100</small></strong>`;
  }

  function scoreCard(key, label, score, description, reason) {
    const state = score === null ? "pending" : score >= 75 ? "strong" : score >= 50 ? "mixed" : "weak";
    return `<article class="lc-score-card lc-score-${state}" data-score-key="${escapeHtml(key)}">
      <div class="lc-score-card-head"><span>${escapeHtml(label)}</span>${scoreValue(score)}</div>
      <div class="lc-score-track" aria-hidden="true"><i style="width:${score === null ? 0 : score}%"></i></div>
      <p>${escapeHtml(description)}</p><small class="lc-score-reason">${escapeHtml(reason || "")}</small>
    </article>`;
  }

  function profileForm(profile) {
    const selected = (name, value) => profile[name] === value ? "selected" : "";
    const checked = (name) => profile[name] ? "checked" : "";
    return `<form class="lc-profile-form" autocomplete="off">
      <div class="lc-profile-heading"><div><span>Buyer inputs</span><h3>Make the assessment relevant to you.</h3><p>These inputs stay in this browser and only affect Deal Score and Personal Fit.</p></div><b>Optional</b></div>
      <div class="lc-form-grid">
        <label>Primary goal<select name="goal"><option value="">Choose…</option><option value="live_in" ${selected("goal", "live_in")}>Live in</option><option value="renovate" ${selected("goal", "renovate")}>Renovate or value-add</option><option value="develop" ${selected("goal", "develop")}>Develop</option><option value="invest" ${selected("goal", "invest")}>Invest</option></select></label>
        <label>Risk tolerance<select name="riskTolerance"><option value="cautious" ${selected("riskTolerance", "cautious")}>Cautious</option><option value="balanced" ${selected("riskTolerance", "balanced") || !profile.riskTolerance ? "selected" : ""}>Balanced</option><option value="comfortable" ${selected("riskTolerance", "comfortable")}>Comfortable with complexity</option></select></label>
        <label>Proposed price (A$)<input name="price" inputmode="numeric" value="${profile.price ?? ""}" placeholder="e.g. 950000"></label>
        <label>Your risk-adjusted fair value (A$)<input name="fairValue" inputmode="numeric" value="${profile.fairValue ?? ""}" placeholder="e.g. 1000000"></label>
        <label>Known costs / contingency (A$)<input name="costs" inputmode="numeric" value="${profile.costs ?? ""}" placeholder="e.g. 25000"></label>
        <div class="lc-checks"><label><input type="checkbox" name="plannedWorks" ${checked("plannedWorks")}> I intend to renovate or develop</label><label><input type="checkbox" name="simpleTitle" ${checked("simpleTitle")}> I prefer a simple single-lot property</label></div>
      </div>
      <button type="submit" class="lc-update-button">Update my assessment</button>
    </form>`;
  }

  function renderFlags(flags) {
    if (!flags.length) return `<div class="lc-no-flags"><span>✓</span><p><b>No hard flags in the connected scope.</b><br>This does not cover building condition, contract, title or valuation.</p></div>`;
    return flags.map((flag) => `<article class="lc-flag lc-flag-${escapeHtml(flag.severity)}"><span>${flag.severity === "critical" ? "!" : flag.severity === "material" ? "●" : "○"}</span><div><b>${escapeHtml(flag.title)}</b><p>${escapeHtml(flag.detail)}</p><small>${escapeHtml(flag.action)}</small></div><em>${escapeHtml(flag.severity)}</em></article>`).join("");
  }

  function renderActions(flags) {
    const stages = [
      ["before_inspection", "Before inspection"],
      ["before_offer", "Before offering"],
      ["before_unconditional", "Before unconditional"],
      ["before_settlement", "Before settlement"],
    ];
    const generic = {
      before_inspection: ["Inspect drainage, retaining walls, access and visible alterations."],
      before_offer: ["Obtain current building and pest reports and confirm insurance availability."],
      before_unconditional: ["Have the contract, title and material findings reviewed by qualified professionals."],
      before_settlement: ["Confirm agreed conditions, approvals and outstanding documents have been satisfied."],
    };
    return stages.map(([key, label]) => {
      const specific = flags.filter((flag) => flag.stage === key).map((flag) => flag.action);
      const actions = [...new Set([...specific, ...generic[key]])].slice(0, 4);
      return `<article class="lc-action-stage"><span>${escapeHtml(label)}</span><ol>${actions.map((action) => `<li>${escapeHtml(action)}</li>`).join("")}</ol></article>`;
    }).join("");
  }

  function renderDecisionLayer(data, profile = loadProfile(data.property_id)) {
    const reportPage = document.querySelector('[data-spa-page="report"]');
    const hero = reportPage?.querySelector(".report-hero");
    if (!reportPage || !hero || !data?.metrics?.length) return;
    reportPage.querySelector(".prototype-scores-section")?.remove();
    reportPage.querySelector(".lemoncheck-decision-section")?.remove();

    const assessment = calculateAssessment(data, profile);
    window.LEMONCHECK_ASSESSMENT = assessment;
    data.five_score_assessment = assessment;

    const section = document.createElement("section");
    section.className = "lemoncheck-decision-section";
    section.innerHTML = `<div class="container">
      <div class="lc-decision-hero lc-decision-${escapeHtml(assessment.decision.code)}">
        <div><span class="lc-model-label">Brisbane screening model · ${MODEL_VERSION}</span><h2>${escapeHtml(assessment.decision.title)}</h2><p>${escapeHtml(assessment.decision.text)}</p></div>
        <div class="lc-lemon-score"><span>Lemon Score</span><strong>${assessment.objective.lemonScore}<small>/100</small></strong><b>Higher is better</b><em>Public-data property soundness only</em></div>
      </div>
      <div class="lc-five-score-grid">
        ${scoreCard("lemon", "Lemon Score", assessment.objective.lemonScore, "Objective mapped property soundness, independent of price or buyer preference.", `${assessment.objective.totalRisk} risk points from current mapped findings.`)}
        ${scoreCard("deal", "Deal Score", assessment.deal.score, "Your proposed price versus your own risk-adjusted fair value and contingency.", assessment.deal.reason)}
        ${scoreCard("fit", "Personal Fit", assessment.fit.score, "How the mapped facts align with your stated goal and tolerance.", assessment.fit.reason)}
        ${scoreCard("development", "Development Potential", assessment.development.score, "Preliminary development flexibility after mapped constraints.", assessment.development.reason)}
        ${scoreCard("confidence", "Confidence", assessment.confidence.score, "Evidence authority and completeness. Missing data does not reduce Lemon Score.", assessment.confidence.gaps.length ? `Missing: ${assessment.confidence.gaps.join(", ")}.` : "All currently required public-source checks resolved.")}
      </div>
      <div class="lc-decision-grid">
        <section class="lc-panel"><div class="lc-panel-head"><div><span>Hard flags</span><h3>Issues that cannot disappear through averaging.</h3></div><b>${assessment.flags.length}</b></div><div class="lc-flags">${renderFlags(assessment.flags)}</div></section>
        <section class="lc-panel">${profileForm(profile)}</section>
      </div>
      <section class="lc-panel lc-action-panel"><div class="lc-panel-head"><div><span>Next actions</span><h3>What to investigate, in order.</h3></div></div><div class="lc-action-grid">${renderActions(assessment.flags)}</div></section>
      <details class="lc-method"><summary>How the five-score prototype works</summary><div class="lc-method-grid">
        <div><h3>Stable facts, separate lenses</h3><p>Lemon Score uses mapped hazards and parcel complexity only. Price is isolated in Deal Score. Buyer preferences only affect Personal Fit. Planning constraints primarily affect Development Potential. Missing evidence only affects Confidence or creates a hard flag.</p></div>
        <div><h3>Current exclusions</h3><p>Building condition, pest, contract review, title search, approvals, market valuation, comparable sales, insurance, maintenance cost, body corporate, commute and suburb-market strength are not yet included.</p></div>
        <div><h3>Versioning</h3><p>Model <b>${MODEL_VERSION}</b>. The formula is deterministic and displayed for review; it is not yet calibrated against purchase outcomes.</p></div>
      </div></details>
    </div>`;
    hero.insertAdjacentElement("afterend", section);

    const form = section.querySelector(".lc-profile-form");
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const nextProfile = {
        goal: String(formData.get("goal") || ""),
        riskTolerance: String(formData.get("riskTolerance") || "balanced"),
        price: numberFromForm(form, "price"),
        fairValue: numberFromForm(form, "fairValue"),
        costs: numberFromForm(form, "costs") || 0,
        plannedWorks: formData.get("plannedWorks") === "on",
        simpleTitle: formData.get("simpleTitle") === "on",
      };
      saveProfile(data.property_id, nextProfile);
      renderDecisionLayer(data, nextProfile);
      document.querySelector(".lemoncheck-decision-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    window.dispatchEvent(new CustomEvent("lemoncheck:assessment-ready", { detail: assessment }));
  }

  function scheduleRender(data) {
    window.setTimeout(() => renderDecisionLayer(data), 20);
  }

  window.addEventListener("property-check:report-ready", (event) => scheduleRender(event.detail));
  window.addEventListener("hashchange", () => window.setTimeout(() => renderDecisionLayer(window.PROPERTY_DATA), 300));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => window.setTimeout(() => renderDecisionLayer(window.PROPERTY_DATA), 300));
  else window.setTimeout(() => renderDecisionLayer(window.PROPERTY_DATA), 300);
})();
