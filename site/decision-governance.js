(() => {
  "use strict";

  const GOVERNANCE_VERSION = "LC-BNE-5L-v0.2.1";
  const FULL_ASSESSMENT_PUBLIC_DATA_WEIGHT = 0.55;
  const MISSING_MODULES = [
    "Building and pest evidence",
    "Contract, approvals and title review",
    "Market value and comparable sales",
    "Insurance availability and terms",
  ];
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);

  function renderFlag(flag) {
    const symbol = flag.severity === "critical" ? "!" : flag.severity === "material" ? "●" : "○";
    return `<article class="lc-flag lc-flag-${escapeHtml(flag.severity)}"><span>${symbol}</span><div><b>${escapeHtml(flag.title)}</b><p>${escapeHtml(flag.detail)}</p><small>${escapeHtml(flag.action)}</small></div><em>${escapeHtml(flag.severity)}</em></article>`;
  }

  function renderNoFlags() {
    return `<div class="lc-no-flags"><span>✓</span><p><b>No critical, material or unresolved flags in the connected scope.</b><br>Advisories remain visible separately and formal due diligence is still required.</p></div>`;
  }

  function updateScoreCard(assessment) {
    const card = document.querySelector('[data-score-key="confidence"]');
    if (!card) return;
    const score = assessment.confidence.score;
    const state = score >= 75 ? "strong" : score >= 50 ? "mixed" : "weak";
    card.className = `lc-score-card lc-score-${state}`;
    const strong = card.querySelector(".lc-score-card-head strong");
    if (strong) strong.innerHTML = `${score}<small>/100</small>`;
    const track = card.querySelector(".lc-score-track i");
    if (track) track.style.width = `${score}%`;
    const reason = card.querySelector(".lc-score-reason");
    if (reason) reason.textContent = `Connected public-source confidence ${assessment.confidence.publicSourceScore}/100. Overall assessment breadth is capped at ${score}/100 until building, legal, valuation and insurance evidence is added.`;
  }

  function updateFlags(assessment) {
    const hardPanel = document.querySelector(".lc-decision-grid .lc-panel:first-child");
    if (!hardPanel) return;
    const count = hardPanel.querySelector(".lc-panel-head > b");
    if (count) count.textContent = String(assessment.flags.length);
    const list = hardPanel.querySelector(".lc-flags");
    if (list) list.innerHTML = assessment.flags.length ? assessment.flags.map(renderFlag).join("") : renderNoFlags();

    let advisory = hardPanel.querySelector(".lc-advisory-block");
    if (!advisory) {
      advisory = document.createElement("div");
      advisory.className = "lc-advisory-block";
      hardPanel.appendChild(advisory);
    }
    advisory.innerHTML = assessment.advisories.length
      ? `<div class="lc-advisory-head"><span>Advisories</span><b>${assessment.advisories.length}</b></div><div class="lc-advisory-list">${assessment.advisories.map(renderFlag).join("")}</div>`
      : "";
    advisory.hidden = assessment.advisories.length === 0;
  }

  function updateMethod(assessment) {
    document.querySelectorAll(".lc-model-label").forEach((element) => {
      element.textContent = `Brisbane screening model · ${GOVERNANCE_VERSION}`;
    });
    const method = document.querySelector(".lc-method-grid");
    if (method) {
      const versionParagraph = [...method.querySelectorAll("p")].find((paragraph) => /Model\s+LC-BNE-5L-v0\.2\.0/i.test(paragraph.textContent || ""));
      if (versionParagraph) versionParagraph.innerHTML = `Model <b>${GOVERNANCE_VERSION}</b>. Public-source quality and whole-assessment breadth are shown separately. The formula is deterministic and not yet calibrated against purchase outcomes.`;
    }
    const decisionText = document.querySelector(".lc-decision-hero > div:first-child > p");
    if (decisionText && !/shortlist screen only/i.test(decisionText.textContent || "")) {
      decisionText.textContent = `${decisionText.textContent} This is a shortlist screen only; building, title, contract, valuation and insurance evidence are not yet included.`;
    }
  }

  function applyGovernance(assessment) {
    if (!assessment?.confidence || assessment.governanceVersion === GOVERNANCE_VERSION) return;

    const publicSourceScore = Number.isFinite(assessment.confidence.publicSourceScore)
      ? assessment.confidence.publicSourceScore
      : Number(assessment.confidence.score || 0);
    const overallConfidence = Math.min(
      Math.round(publicSourceScore * FULL_ASSESSMENT_PUBLIC_DATA_WEIGHT),
      Math.round(FULL_ASSESSMENT_PUBLIC_DATA_WEIGHT * 100),
    );

    const allFlags = Array.isArray(assessment.flags) ? assessment.flags : [];
    assessment.advisories = allFlags.filter((flag) => flag.severity === "advisory");
    assessment.flags = allFlags.filter((flag) => flag.severity !== "advisory");
    assessment.modelVersion = GOVERNANCE_VERSION;
    assessment.governanceVersion = GOVERNANCE_VERSION;
    assessment.confidence.publicSourceScore = publicSourceScore;
    assessment.confidence.assessmentBreadthCap = Math.round(FULL_ASSESSMENT_PUBLIC_DATA_WEIGHT * 100);
    assessment.confidence.score = overallConfidence;
    assessment.confidence.gaps = [...new Set([...(assessment.confidence.gaps || []), ...MISSING_MODULES])];
    assessment.generatedAt = new Date().toISOString();

    window.LEMONCHECK_ASSESSMENT = assessment;
    if (window.PROPERTY_DATA?.five_score_assessment) window.PROPERTY_DATA.five_score_assessment = assessment;

    updateScoreCard(assessment);
    updateFlags(assessment);
    updateMethod(assessment);
    window.dispatchEvent(new CustomEvent("lemoncheck:governance-ready", { detail: assessment }));
  }

  window.addEventListener("lemoncheck:assessment-ready", (event) => applyGovernance(event.detail));
  if (window.LEMONCHECK_ASSESSMENT) applyGovernance(window.LEMONCHECK_ASSESSMENT);
})();
