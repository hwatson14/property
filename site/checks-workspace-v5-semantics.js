(() => {
  "use strict";

  const VERSION = "LC-WORKSPACE-SEMANTICS-v0.1.0";
  const CHECK_IDS = {
    planning: ["planning.zone", "planning.heritage.state", "planning.heritage.reference", "planning.heritage.entry_date", "planning.character", "constraint.mapped_secondary_interests", null, null, null],
    hazards: ["flood.levels.assigned", "flood.fpa.overland_flow", "flood.flag.overland_flow", "flood.flag.large_allotment", "flood.coastal_hazard", "constraint.bushfire", "constraint.waterway_corridor", null],
    development: ["planning.zone", "planning.character", "planning.heritage.reference", "constraint.mapped_secondary_interests", null, null, null, null, null],
    building: ["property.address", "property.parcels", "property.parcel_area", null, null, null, null],
    noise: [null, null, null, null, null, null],
    services: [null, null, null, null, null, null],
    lifestyle: [null, null, null, null, null, null, null, null],
    market: [null, null, null, null, null, null, null, null],
    documents: [null, null, null, null, null, null, null, null],
  };

  const metric = (id) => (window.PROPERTY_DATA?.metrics || []).find((item) => item.metric_id === id);
  const isResolved = (item) => Boolean(item) && item.status !== "not_assessed" && item.source?.mode !== "unavailable";
  const isDetected = (item) => Boolean(item) && ["detected", "multiple"].includes(item.status);

  function valueLooksMaterial(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "boolean") return value;
    if (Array.isArray(value)) return value.some((entry) => valueLooksMaterial(entry?.value ?? entry));
    const text = String(value).trim().toLowerCase();
    if (!text) return false;
    return !new Set(["0", "0.0", "false", "no", "none", "n", "not affected", "not detected", "null", "na", "n/a", "nil", "no matching records returned"]).has(text);
  }

  function checkState(id) {
    if (!id) return "not-started";
    const item = metric(id);
    if (!isResolved(item)) return "unavailable";
    if (["property.address", "property.parcel_area", "planning.zone", "flood.levels.assigned"].includes(id)) return "complete";
    if (id === "property.parcels") return item.status === "multiple" ? "attention" : "complete";
    if (["flood.fpa.overland_flow", "flood.flag.overland_flow", "flood.flag.large_allotment", "flood.coastal_hazard"].includes(id)) {
      return isDetected(item) && valueLooksMaterial(item.value) ? "issue" : "complete";
    }
    if (["constraint.bushfire", "constraint.mapped_secondary_interests"].includes(id)) return isDetected(item) ? "issue" : "complete";
    if (["planning.heritage.state", "planning.heritage.reference", "planning.heritage.entry_date", "planning.character", "constraint.waterway_corridor"].includes(id)) return isDetected(item) ? "attention" : "complete";
    return isDetected(item) ? "attention" : "complete";
  }

  function officialAreaLabel() {
    const item = metric("property.parcel_area");
    const display = String(item?.display_value || "").trim();
    if (display && !/^(0(?:\.0+)?\s*(?:m²|m2|ha|source units)?|not returned|not available|parcel source unavailable)$/i.test(display)) return display;
    const numbers = [];
    const collect = (entry) => {
      if (Number.isFinite(Number(entry)) && Number(entry) > 0) numbers.push(Number(entry));
      else if (entry && typeof entry === "object") {
        const candidate = entry.area ?? entry.value ?? entry.square_metres ?? entry.squareMeters;
        if (Number.isFinite(Number(candidate)) && Number(candidate) > 0) numbers.push(Number(candidate));
      }
    };
    if (Array.isArray(item?.value)) item.value.forEach(collect); else collect(item?.value);
    if (!numbers.length) return "Area unavailable";
    return `${new Intl.NumberFormat("en-AU").format(Math.round(numbers.reduce((sum, number) => sum + number, 0)))} m²`;
  }

  function setFactText(element, value) {
    if (!element) return;
    const svg = element.querySelector("svg")?.cloneNode(true);
    element.replaceChildren();
    if (svg) element.appendChild(svg);
    element.appendChild(document.createTextNode(` ${value}`));
  }

  function patchArea() {
    const value = officialAreaLabel();
    setFactText(document.querySelector(".lcw-property-facts span:last-child"), value);
    const snapshot = [...document.querySelectorAll(".lcw-snapshot-list div")].find((row) => /^Land size/i.test(row.querySelector("span")?.textContent || ""));
    if (snapshot?.querySelector("b")) snapshot.querySelector("b").textContent = value;
  }

  function patchCheckRows() {
    document.querySelectorAll("[data-check-category]").forEach((group) => {
      const key = group.dataset.checkCategory;
      const ids = CHECK_IDS[key] || [];
      const states = [];
      group.querySelectorAll(".lcw-check-row").forEach((row, index) => {
        const state = checkState(ids[index] || null);
        states.push(state);
        const holder = row.querySelector(".lcw-check-state");
        if (holder) {
          holder.className = `lcw-check-state ${state}`;
          holder.textContent = state.replace("-", " ");
        }
      });
      const completed = states.filter((state) => ["complete", "issue", "attention"].includes(state)).length;
      const issues = states.filter((state) => state === "issue").length;
      const attentions = states.filter((state) => state === "attention").length;
      const status = issues ? "issue" : attentions ? "attention" : completed === states.length ? "clear" : "not-started";
      const label = ({ issue: "Issue found", attention: "Attention", clear: "No issues", "not-started": "Not started" })[status];
      const groupStatus = group.querySelector(".lcw-section-head .lcw-status");
      if (groupStatus) {
        groupStatus.className = `lcw-status ${status}`;
        groupStatus.textContent = `${label} · ${completed}/${states.length}`;
      }
      const summary = document.querySelector(`[data-lcw-category="${CSS.escape(key)}"]`);
      if (summary) {
        const summaryStatus = summary.querySelector(".lcw-status");
        const count = summary.querySelector(".lcw-category-count");
        if (summaryStatus) {
          summaryStatus.className = `lcw-status ${status}`;
          summaryStatus.textContent = label;
        }
        if (count) count.textContent = `${completed} / ${states.length}`;
      }
    });
  }

  function patchCoverage() {
    const states = [...document.querySelectorAll(".lcw-check-state")].map((node) => [...node.classList].find((name) => ["complete", "issue", "attention", "unavailable", "not-started"].includes(name)) || "not-started");
    if (!states.length) return;
    const completed = states.filter((state) => ["complete", "issue", "attention"].includes(state)).length;
    const attention = states.filter((state) => ["issue", "attention"].includes(state)).length;
    const unavailable = states.length - completed;
    const coverage = Math.round((completed / states.length) * 100);
    const ring = document.querySelector(".lcw-ring");
    if (ring) ring.style.setProperty("--value", String(coverage));
    if (ring?.querySelector("strong")) ring.querySelector("strong").textContent = `${coverage}%`;
    const counts = document.querySelectorAll(".lcw-check-counts span");
    if (counts[0]) counts[0].lastChild.textContent = `${completed} Completed`;
    if (counts[1]) counts[1].lastChild.textContent = `${attention} Require attention`;
    if (counts[2]) counts[2].lastChild.textContent = `${unavailable} Not available`;
    const coverageMetric = document.querySelector(".lcw-recommendation-metric:nth-child(2)");
    if (coverageMetric?.querySelector("strong")) coverageMetric.querySelector("strong").textContent = `${coverage}%`;
    if (coverageMetric?.querySelector("small")) coverageMetric.querySelector("small").textContent = coverage >= 70 ? "Good" : coverage >= 40 ? "Partial" : "Limited";
  }

  function patchRecommendation() {
    const assessment = window.LEMONCHECK_ASSESSMENT;
    if (!assessment) return;
    const material = (assessment.flags || []).filter((flag) => ["critical", "material"].includes(flag.severity)).length;
    const unresolved = (assessment.flags || []).filter((flag) => flag.severity === "unresolved").length;
    const attention = unresolved + (assessment.advisories || []).length + (assessment.confidence?.gaps || []).length;
    const critical = (assessment.flags || []).some((flag) => flag.severity === "critical");
    const title = critical ? "Professional review required" : material ? "Investigate before offering" : "Proceed with caution";
    const copy = `${material} material issue${material === 1 ? "" : "s"} and ${attention} check${attention === 1 ? "" : "s"} require attention.`;
    const lead = document.querySelector(".lcw-recommendation-lead");
    if (lead?.querySelector("h2")) lead.querySelector("h2").textContent = title;
    if (lead?.querySelector("p")) lead.querySelector("p").textContent = copy;
  }

  function apply() {
    if (!document.querySelector('[data-ux-version="LC-UX-v0.5.0"]')) return;
    patchArea();
    patchCheckRows();
    patchCoverage();
    patchRecommendation();
    document.documentElement.dataset.workspaceSemantics = VERSION;
  }

  window.addEventListener("lemoncheck:workspace-ready", () => setTimeout(apply, 0));
  window.addEventListener("lemoncheck:pricing-ready", () => setTimeout(apply, 0));
  setTimeout(apply, 100);
})();
