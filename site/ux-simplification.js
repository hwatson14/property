(() => {
  "use strict";

  const UX_VERSION = "LC-UX-v0.1.0";
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);

  function scoreDescriptor(key, value) {
    if (!Number.isFinite(value)) {
      return key === "deal" ? "Pricing pending" : key === "fit" ? "Personalise" : "Not available";
    }
    if (key === "lemon") return value >= 85 ? "Few mapped issues" : value >= 70 ? "Some follow-up" : value >= 50 ? "Material concerns" : "High concern";
    if (key === "development") return value >= 75 ? "Flexible" : value >= 50 ? "Mixed potential" : value >= 25 ? "Constrained" : "Highly constrained";
    if (key === "confidence") return value >= 80 ? "Broad assessment" : value >= 60 ? "Several gaps" : "Partial assessment";
    return value >= 75 ? "Strong fit" : value >= 50 ? "Mixed" : "Weak";
  }

  function scoreTile(key, label, value, primary = false) {
    const number = Number.isFinite(value) ? `${value}<small>${key === "confidence" ? "%" : "/100"}</small>` : "—";
    const state = Number.isFinite(value) ? value >= 75 ? "strong" : value >= 50 ? "mixed" : "weak" : "pending";
    return `<article class="lc-simple-score lc-simple-score-${state} ${primary ? "lc-simple-score-primary" : ""}" data-simple-score="${escapeHtml(key)}">
      <span>${escapeHtml(label)}</span><strong>${number}</strong><b>${escapeHtml(scoreDescriptor(key, value))}</b>
    </article>`;
  }

  function forceHonestPricingState(assessment) {
    if (assessment?.pricing && assessment?.pricingClientVersion === "LC-PRICE-CLIENT-v0.1.0") return;
    assessment.deal = { score: null, reason: "Automated market pricing is not connected yet." };
    const dealCard = document.querySelector('[data-score-key="deal"]');
    if (dealCard) {
      dealCard.className = "lc-score-card lc-score-pending";
      const strong = dealCard.querySelector(".lc-score-card-head strong");
      if (strong) strong.innerHTML = "—";
      const track = dealCard.querySelector(".lc-score-track i");
      if (track) track.style.width = "0%";
      const reason = dealCard.querySelector(".lc-score-reason");
      if (reason) reason.textContent = assessment.deal.reason;
    }
  }

  function simplifyBuyerForm() {
    const form = document.querySelector(".lc-profile-form");
    if (!form) return;
    const fairValue = form.querySelector('[name="fairValue"]');
    const fairValueLabel = fairValue?.closest("label");
    if (fairValue) {
      fairValue.value = "";
      fairValue.disabled = true;
      fairValue.setAttribute("aria-disabled", "true");
    }
    if (fairValueLabel) fairValueLabel.hidden = true;
    const price = form.querySelector('[name="price"]');
    const priceLabel = price?.closest("label");
    if (priceLabel && !priceLabel.dataset.simpleLabel) {
      const textNode = [...priceLabel.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
      if (textNode) textNode.textContent = "Price you are considering (optional)";
      price.placeholder = "Used once automated pricing is connected";
      priceLabel.dataset.simpleLabel = "true";
    }
    const heading = form.querySelector(".lc-profile-heading p");
    if (heading) heading.textContent = "Tell us what you want from the property. Price comparison remains pending until automated market data is connected.";
  }

  function rankedMatters(assessment) {
    const items = [];
    const push = (type, title, detail, action) => {
      if (!title || items.some((item) => item.title === title)) return;
      items.push({ type, title, detail, action });
    };
    (assessment.flags || []).forEach((flag) => push(flag.severity, flag.title, flag.detail, flag.action));
    (assessment.advisories || []).forEach((flag) => push("advisory", flag.title, flag.detail, flag.action));
    if ((assessment.objective?.hazardRisk || 0) === 0) {
      push("positive", "No major mapped hazard flag was found", "The connected flood, bushfire and waterway screens did not add objective hazard risk points.", "Still obtain an address-specific insurance quote and inspect site drainage.");
    }
    const gapLabels = {
      "Building and pest evidence": ["Building condition is not checked", "No inspection report has been reviewed.", "Obtain a current building and pest report before going unconditional."],
      "Contract, approvals and title review": ["Contract, title and approvals are not checked", "The current screen does not confirm legal ownership, easements or approvals.", "Have a conveyancer review the contract, title and relevant approvals."],
      "Market value and comparable sales": ["Automated pricing is not connected", "Deal Score is withheld until licensed market pricing is available.", "Treat any price comparison as pending rather than supplying your own fair value."],
      "Insurance availability and terms": ["Insurance terms are not checked", "Mapped hazards do not prove that cover will be available or affordable.", "Obtain an address-specific quote before making the contract unconditional."],
    };
    (assessment.confidence?.gaps || []).forEach((gap) => {
      const mapped = gapLabels[gap];
      if (mapped) push("unknown", mapped[0], mapped[1], mapped[2]);
    });
    return items.slice(0, 3);
  }

  function checkedModules(assessment) {
    const publicScore = Number(assessment.confidence?.publicSourceScore || 0);
    const checked = ["Address and parcels", "Planning controls", "Flood and mapped constraints"];
    if (assessment.pricing) checked.push("Automated market pricing");
    return { checked, publicScore };
  }

  function actionList(matters) {
    const actions = matters.map((item) => item.action).filter(Boolean);
    const defaults = [
      "Obtain a current building and pest report.",
      "Have the contract, title and approvals reviewed.",
      "Obtain an address-specific insurance quote.",
    ];
    return [...new Set([...actions, ...defaults])].slice(0, 3);
  }

  function displayDecision(assessment) {
    const map = {
      "Worth shortlisting": "Worth considering",
      "Proceed only after targeted checks": "Promising, with checks",
      "Investigate before offering": "Investigate before offering",
      "Likely poor fit": "Probably not right for you",
      "Price looks unfavourable": "Price needs review",
      "Insufficient evidence": "More evidence needed",
      "Professional review required": "Professional review required",
    };
    return map[assessment.decision?.title] || assessment.decision?.title || "Assessment available";
  }

  function moveShortlistControls(summary) {
    window.setTimeout(() => {
      const controls = document.querySelector(".lc-shortlist-actions");
      const target = summary?.querySelector(".lc-simple-header-actions");
      if (controls && target && !target.contains(controls)) target.appendChild(controls);
    }, 0);
  }

  function makeAdvancedDetails(container) {
    container.querySelector(".lc-simple-details")?.remove();
    const detail = document.createElement("details");
    detail.className = "lc-simple-details";
    detail.innerHTML = `<summary><span>Personalise and inspect the detailed score breakdown</span><b>Optional detail</b></summary><div class="lc-simple-detail-body"></div>`;
    const body = detail.querySelector(".lc-simple-detail-body");
    [".lc-five-score-grid", ".lc-decision-grid", ".lc-action-panel", ".lc-method"].forEach((selector) => {
      const node = container.querySelector(selector);
      if (node) body.appendChild(node);
    });
    container.appendChild(detail);
    detail.addEventListener("toggle", () => {
      if (detail.open) simplifyBuyerForm();
    });
    return detail;
  }

  function collapseSection(section, label, title) {
    if (!section || section.querySelector(":scope > .lc-report-detail")) return;
    const children = [...section.children];
    const detail = document.createElement("details");
    detail.className = "lc-report-detail";
    detail.innerHTML = `<summary><span>${escapeHtml(label)}</span><strong>${escapeHtml(title)}</strong><b>Show</b></summary><div class="lc-report-detail-body"></div>`;
    const body = detail.querySelector(".lc-report-detail-body");
    children.forEach((child) => body.appendChild(child));
    section.appendChild(detail);
    detail.addEventListener("toggle", () => {
      const toggle = detail.querySelector("summary b");
      if (toggle) toggle.textContent = detail.open ? "Hide" : "Show";
    });
  }

  function simplifyLowerReport(decisionSection) {
    const overview = document.querySelector(".report-overview-section");
    if (overview) {
      overview.id = "lc-map";
      if (decisionSection.nextElementSibling !== overview) decisionSection.insertAdjacentElement("afterend", overview);
    }
    collapseSection(document.querySelector(".report-warning-stack"), "Important limitations", "What this screening does not prove");
    collapseSection(document.querySelector(".report-facts-section"), "Detailed evidence", "All property metrics and explanations");
    collapseSection(document.querySelector(".report-sources-section"), "Source register", "Datasets, retrieval states and provenance");
  }

  function renderSimpleUX(assessment) {
    const section = document.querySelector(".lemoncheck-decision-section");
    const container = section?.querySelector(":scope > .container");
    if (!section || !container || !assessment?.objective) return;
    forceHonestPricingState(assessment);
    simplifyBuyerForm();
    section.querySelector(".lc-simple-summary")?.remove();
    const matters = rankedMatters(assessment);
    const actions = actionList(matters);
    const completeness = Number(assessment.confidence?.score || 0);
    const modules = checkedModules(assessment);
    const summary = document.createElement("section");
    summary.className = "lc-simple-summary";
    summary.dataset.uxVersion = UX_VERSION;
    summary.innerHTML = `<div class="lc-simple-header">
      <div class="lc-simple-answer"><span class="lc-simple-kicker">LemonCheck summary · ${UX_VERSION}</span><div class="lc-simple-status">${escapeHtml(displayDecision(assessment))}</div><h2>${escapeHtml(assessment.decision?.text || "Property screening is available.")}</h2><p>This is a shortlist screen. Building, legal, insurance and live pricing checks remain separate.</p></div>
      <div class="lc-simple-header-actions"></div>
    </div>
    <div class="lc-simple-primary-scores">
      ${scoreTile("lemon", "Lemon Score", assessment.objective.lemonScore, true)}
      ${scoreTile("confidence", "Assessment completeness", completeness, true)}
    </div>
    <div class="lc-simple-score-strip" aria-label="Five score lenses">
      ${scoreTile("deal", "Deal", assessment.deal?.score)}
      ${scoreTile("fit", "Personal fit", assessment.fit?.score)}
      ${scoreTile("development", "Development", assessment.development?.score)}
    </div>
    <div class="lc-simple-grid">
      <section id="lc-simple-matters" class="lc-simple-panel"><div class="lc-simple-panel-head"><span>Three things that matter</span><b>${matters.length}</b></div><div class="lc-simple-matters">${matters.map((item, index) => `<article class="lc-simple-matter lc-simple-matter-${escapeHtml(item.type)}"><span>${index + 1}</span><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.detail)}</p><small>${escapeHtml(item.action || "")}</small></div></article>`).join("")}</div></section>
      <section class="lc-simple-panel lc-simple-completeness"><div class="lc-simple-panel-head"><span>What has actually been checked</span><b>${completeness}%</b></div><div class="lc-simple-progress"><i style="width:${completeness}%"></i></div><div class="lc-simple-check-columns"><div><strong>Checked</strong><ul>${modules.checked.map((item) => `<li>✓ ${escapeHtml(item)}</li>`).join("")}</ul></div><div><strong>Still missing</strong><ul>${(assessment.confidence?.gaps || []).slice(0, 4).map((item) => `<li>○ ${escapeHtml(item)}</li>`).join("")}</ul></div></div><small>Connected public-source confidence: ${modules.publicScore}/100.</small></section>
    </div>
    <section id="lc-simple-actions" class="lc-simple-actions"><div><span>Next three actions</span><h3>Do these before relying on the result.</h3></div><ol>${actions.map((action) => `<li>${escapeHtml(action)}</li>`).join("")}</ol></section>
    <nav class="lc-simple-jump-nav" aria-label="Report sections"><a href="#lc-simple-matters">Summary</a><a href="#lc-map">Map</a><button type="button" data-open-personalisation>Personalise</button><a href="#lc-evidence">Evidence</a></nav>`;
    container.prepend(summary);
    const oldHero = container.querySelector(".lc-decision-hero");
    if (oldHero) oldHero.hidden = true;
    const detail = makeAdvancedDetails(container);
    summary.querySelector("[data-open-personalisation]")?.addEventListener("click", () => {
      detail.open = true;
      detail.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => detail.querySelector(".lc-profile-form")?.scrollIntoView({ behavior: "smooth", block: "center" }), 350);
    });
    const facts = document.querySelector(".report-facts-section");
    if (facts) facts.id = "lc-evidence";
    moveShortlistControls(summary);
    simplifyLowerReport(section);
    document.documentElement.classList.add("lc-simple-ux-active");
    window.LEMONCHECK_ASSESSMENT = assessment;
    if (window.PROPERTY_DATA?.five_score_assessment) window.PROPERTY_DATA.five_score_assessment = assessment;
    window.dispatchEvent(new CustomEvent("lemoncheck:ux-ready", { detail: { version: UX_VERSION, assessment } }));
  }

  function schedule(assessment) {
    window.setTimeout(() => renderSimpleUX(assessment || window.LEMONCHECK_ASSESSMENT), 30);
  }

  window.addEventListener("lemoncheck:governance-ready", (event) => schedule(event.detail));
  window.addEventListener("lemoncheck:pricing-ready", (event) => schedule(event.detail?.assessment));
  window.addEventListener("lemoncheck:shortlist-updated", () => moveShortlistControls(document.querySelector(".lc-simple-summary")));
  if (window.LEMONCHECK_ASSESSMENT?.governanceVersion) schedule(window.LEMONCHECK_ASSESSMENT);
})();