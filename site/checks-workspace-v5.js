(() => {
  "use strict";

  const VERSION = "LC-UX-v0.5.0";
  const STORAGE_KEY = "lemoncheck-shortlist-v1";
  let currentView = "summary";
  let lastSignature = "";
  let mapRetries = 0;

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
  const finite = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };
  const metric = (data, id) => (data?.metrics || []).find((item) => item.metric_id === id);
  const resolved = (item) => Boolean(item) && item.status !== "not_assessed" && item.source?.mode !== "unavailable";
  const detected = (data, id) => metric(data, id)?.status === "detected";

  function icon(name) {
    const paths = {
      summary: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10M9 20v-6h6v6"/>',
      checks: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2"/>',
      docs: '<path d="M6 3h9l3 3v15H6V3Z"/><path d="M15 3v4h4M9 11h6M9 15h6"/>',
      map: '<path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3V6Z"/><path d="M8 3v15M16 6v15"/>',
      share: '<circle cx="18" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="19" r="2"/><path d="m8 11 8-5M8 13l8 5"/>',
      parcel: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="m8 9 8 6M16 9l-8 6"/>',
      house: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10M9 20v-6h6v6"/>',
      ruler: '<path d="m5 19 14-14 3 3L8 22l-3-3Z"/><path d="m14 7 3 3M11 10l2 2M8 13l3 3"/>',
      planning: '<path d="M4 20h16M6 20V7l6-4 6 4v13M9 20v-5h6v5"/>',
      hazards: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5M12 17h.01"/>',
      development: '<path d="M4 20V9h6v11M10 20V4h6v16M16 20v-7h4v7"/>',
      building: '<path d="M5 21V4h10v17M15 9h4v12M8 8h2M8 12h2M8 16h2"/>',
      noise: '<path d="M4 14h3l4 4V6L7 10H4v4Z"/><path d="M15 9a4 4 0 0 1 0 6M17 6a8 8 0 0 1 0 12"/>',
      services: '<path d="M12 2v20M5 7h14M5 17h14"/>',
      lifestyle: '<path d="M12 21s7-4.4 7-11a7 7 0 0 0-14 0c0 6.6 7 11 7 11Z"/><circle cx="12" cy="10" r="2"/>',
      market: '<path d="M4 19V5M4 19h16"/><path d="m7 15 4-5 3 2 5-7"/>',
      warning: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5M12 17h.01"/>',
      shield: '<path d="M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6l-8-3Z"/><path d="m8.5 12 2 2 5-5"/>',
      upload: '<path d="M12 16V4M8 8l4-4 4 4"/><path d="M5 14v6h14v-6"/>',
      back: '<path d="m15 18-6-6 6-6"/>',
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.warning}</svg>`;
  }

  const CATEGORY_SPECS = [
    {
      key: "planning", title: "Planning & legal controls", subtitle: "Zoning, overlays, heritage, title", icon: "planning", colour: "#e99c12", soft: "#fff7e7",
      checks: [
        ["planning.zone", "Current zoning"], ["planning.heritage.state", "State heritage"], ["planning.heritage.reference", "Local heritage"],
        ["planning.heritage.entry_date", "Pre-1911 controls"], ["planning.character", "Character controls"], ["constraint.mapped_secondary_interests", "Mapped easement screen"],
        [null, "Registered title review"], [null, "Contract review"], [null, "Approval history"],
      ],
    },
    {
      key: "hazards", title: "Hazards & environment", subtitle: "Flood, bushfire, waterways, insurance", icon: "hazards", colour: "#169260", soft: "#ebf8f1",
      checks: [
        ["flood.levels.assigned", "Flood records"], ["flood.fpa.overland_flow", "Overland flow"], ["flood.flag.overland_flow", "River and creek"],
        ["flood.flag.large_allotment", "Storm tide and coastal"], ["flood.coastal_hazard", "Ground level metrics"], ["constraint.bushfire", "Bushfire overlay"],
        ["constraint.waterway_corridor", "Waterway corridor"], [null, "Insurance availability"],
      ],
    },
    {
      key: "development", title: "Development & future change", subtitle: "Applications, approvals, infrastructure", icon: "development", colour: "#8b5ad8", soft: "#f4effd",
      checks: [
        ["planning.zone", "Zoning flexibility"], ["planning.character", "Character controls"], ["planning.heritage.reference", "Heritage constraints"],
        ["constraint.mapped_secondary_interests", "Easement constraints"], [null, "Height and site cover"], [null, "Setbacks"], [null, "Servicing capacity"],
        [null, "Nearby development applications"], [null, "Approval pathway"],
      ],
    },
    {
      key: "building", title: "Property & building", subtitle: "Building approvals, site features, condition", icon: "building", colour: "#33a779", soft: "#edf8f3",
      checks: [
        ["property.address", "Property identity"], ["property.parcels", "Lot and parcel identity"], ["property.parcel_area", "Land area"],
        [null, "Building condition"], [null, "Pest inspection"], [null, "Unapproved works"], [null, "Immediate repairs"],
      ],
    },
    {
      key: "noise", title: "Noise & surroundings", subtitle: "Road, rail, aircraft, industrial, odour", icon: "noise", colour: "#26a5a7", soft: "#eaf8f8",
      checks: [[null, "Road noise"], [null, "Rail noise"], [null, "Aircraft noise"], [null, "Industrial activity"], [null, "Odour sources"], [null, "Night-time activity"]],
    },
    {
      key: "services", title: "Services & access", subtitle: "Water, sewer, NBN, power, transport, roads", icon: "services", colour: "#2583d8", soft: "#edf6fd",
      checks: [[null, "Water service"], [null, "Sewer service"], [null, "Power service"], [null, "NBN availability"], [null, "Road access"], [null, "Public transport"]],
    },
    {
      key: "lifestyle", title: "Area & lifestyle", subtitle: "Schools, healthcare, parks, safety, amenities", icon: "lifestyle", colour: "#35a879", soft: "#eef8f3",
      checks: [[null, "School access"], [null, "Healthcare access"], [null, "Parks and recreation"], [null, "Shops and services"], [null, "Commute"], [null, "Walkability"], [null, "Crime context"], [null, "Neighbourhood fit"]],
    },
    {
      key: "market", title: "Market & costs", subtitle: "Sales, rents, rates, insurance, ownership costs", icon: "market", colour: "#7554be", soft: "#f3effb",
      checks: [[null, "Current listing price"], [null, "Automated value range"], [null, "Comparable sales"], [null, "Sale history"], [null, "Council rates"], [null, "Insurance premium"], [null, "Maintenance estimate"], [null, "Holding costs"]],
    },
    {
      key: "documents", title: "Documents still required", subtitle: "Title, contract, inspections, insurance quote", icon: "docs", colour: "#69736f", soft: "#f1f3f2",
      checks: [[null, "Title search"], [null, "Contract"], [null, "Building report"], [null, "Pest report"], [null, "Approval documents"], [null, "Insurance quote"], [null, "Rates notice"], [null, "Survey plan"]],
    },
  ];

  function metricState(item) {
    if (!item) return "not-started";
    if (!resolved(item)) return "unavailable";
    if (item.status === "detected" || item.status === "multiple") return "issue";
    return "complete";
  }

  function buildCategories(data) {
    return CATEGORY_SPECS.map((spec) => {
      const checks = spec.checks.map(([id, label]) => {
        const item = id ? metric(data, id) : null;
        return { id, label, item, state: metricState(item) };
      });
      const completed = checks.filter((check) => ["complete", "issue"].includes(check.state)).length;
      const issues = checks.filter((check) => check.state === "issue").length;
      const unavailable = checks.filter((check) => ["unavailable", "not-started"].includes(check.state)).length;
      const status = issues > 0 ? "issue" : unavailable === checks.length ? "not-started" : unavailable > 0 ? "attention" : "clear";
      return { ...spec, checks, completed, issues, unavailable, status, total: checks.length };
    });
  }

  function statusLabel(status) {
    return ({ issue: "Issue found", attention: "Attention", clear: "No issues", "not-started": "Not started" })[status] || "Attention";
  }

  function areaLabel(data) {
    const value = metric(data, "property.parcel_area")?.value;
    const numbers = [];
    const collect = (entry) => {
      if (Number.isFinite(Number(entry))) numbers.push(Number(entry));
      else if (entry && typeof entry === "object") {
        const candidate = entry.area ?? entry.value ?? entry.square_metres ?? entry.squareMeters;
        if (Number.isFinite(Number(candidate))) numbers.push(Number(candidate));
      }
    };
    if (Array.isArray(value)) value.forEach(collect); else collect(value);
    if (!numbers.length) return "Area unavailable";
    return `${new Intl.NumberFormat("en-AU").format(Math.round(numbers.reduce((sum, item) => sum + item, 0)))} m²`;
  }

  function zoneLabel(data) {
    const value = metric(data, "planning.zone")?.value;
    if (Array.isArray(value)) return value.filter(Boolean).join(", ") || "Zone unavailable";
    return value ? String(value) : "Zone unavailable";
  }

  function parcelLabel(data) {
    const value = metric(data, "property.parcels")?.value;
    return Array.isArray(value) ? value.join(" · ") : value ? String(value) : "Lot/plan unavailable";
  }

  function profileGoal(assessment) {
    const goal = assessment?.profile?.goal;
    return ({ live_in: "Family home", renovate: "Home to renovate", develop: "Development project", invest: "Investment property" })[goal] || "Not personalised";
  }

  function propertySnapshotSvg(data) {
    const parcelLayers = (data.map_layers || []).filter((layer) => layer.style_role === "parcel");
    const points = [];
    const walk = (value) => {
      if (!Array.isArray(value)) return;
      if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) points.push([Number(value[0]), Number(value[1])]);
      else value.forEach(walk);
    };
    parcelLayers.forEach((layer) => walk(layer.geometry?.coordinates));
    if (points.length < 3) return `<svg viewBox="0 0 240 150" aria-label="Property parcel preview"><rect width="240" height="150" fill="#edf3f0"/><path d="M0 40h240M0 80h240M0 120h240M60 0v150M120 0v150M180 0v150" stroke="#dfe7e3"/><path d="M75 26h92l20 33-18 66H60L49 74l26-48Z" fill="#d9efe6" stroke="#118a63" stroke-width="4"/><circle cx="120" cy="76" r="7" fill="#0a5d46" stroke="#fff" stroke-width="3"/></svg>`;
    const xs = points.map(([x]) => x); const ys = points.map(([, y]) => y);
    const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
    const spanX = Math.max(maxX - minX, 0.000001); const spanY = Math.max(maxY - minY, 0.000001);
    const width = 240; const height = 150; const pad = 20;
    const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
    const offsetX = (width - spanX * scale) / 2; const offsetY = (height - spanY * scale) / 2;
    const d = points.map(([x, y], index) => `${index ? "L" : "M"}${(offsetX + (x - minX) * scale).toFixed(1)} ${(height - (offsetY + (y - minY) * scale)).toFixed(1)}`).join(" ") + " Z";
    return `<svg viewBox="0 0 240 150" aria-label="Official property parcel preview"><rect width="240" height="150" fill="#edf3f0"/><path d="M0 40h240M0 80h240M0 120h240M60 0v150M120 0v150M180 0v150" stroke="#dfe7e3"/><path d="${d}" fill="#d9efe6" stroke="#118a63" stroke-width="4"/><circle cx="120" cy="75" r="7" fill="#0a5d46" stroke="#fff" stroke-width="3"/></svg>`;
  }

  function sourceForTitle(data, title) {
    const text = String(title || "").toLowerCase();
    const candidates = [
      ["flood", ["flood.flag.overland_flow", "flood.fpa.overland_flow", "flood.levels.assigned"]],
      ["bushfire", ["constraint.bushfire"]], ["heritage", ["planning.heritage.reference", "planning.heritage.state"]],
      ["character", ["planning.character", "planning.heritage.entry_date"]], ["easement", ["constraint.mapped_secondary_interests"]],
      ["parcel", ["property.parcels"]], ["building", []], ["insurance", []], ["price", []],
    ];
    for (const [keyword, ids] of candidates) {
      if (!text.includes(keyword)) continue;
      for (const id of ids) {
        const item = metric(data, id);
        if (item) return item.source;
      }
    }
    return null;
  }

  function priorityIssues(data, assessment) {
    const output = [];
    const add = (severity, title, detail, action, source, tags = []) => {
      if (!title || output.some((item) => item.title === title)) return;
      output.push({ severity, title, detail: detail || "Review the detailed evidence.", action: action || "Investigate before relying on this result.", source, tags });
    };
    (assessment.flags || []).forEach((item) => add("material", item.title, item.detail, item.action, sourceForTitle(data, item.title), ["Risk to property"]));
    (assessment.advisories || []).forEach((item) => add("attention", item.title, item.detail, item.action, sourceForTitle(data, item.title), ["May affect intended use"]));
    const gaps = assessment.confidence?.gaps || [];
    const gapMap = {
      "Building and pest evidence": ["Building condition is unchecked", "No building or pest inspection has been reviewed.", "Obtain current building and pest reports."],
      "Contract, approvals and title review": ["Legal and approval checks are missing", "The contract, title and approval history have not been reviewed.", "Ask a conveyancer to review the title, contract and approvals."],
      "Market value and comparable sales": ["Market pricing is not connected", "Asking price, AVM and comparable sales are not available.", "Treat price and Deal Score as pending."],
      "Insurance availability and terms": ["Insurance remains unchecked", "Mapped hazards do not confirm cover or premium.", "Obtain an address-specific insurance quote."],
    };
    gaps.forEach((gap) => {
      const mapped = gapMap[gap];
      if (mapped) add("pending", mapped[0], mapped[1], mapped[2], null, ["Evidence required"]);
    });
    if (!output.length) add("attention", "No material mapped issue detected", "The connected public datasets did not return a material mapped flag.", "Continue with normal building, legal, insurance and pricing checks.", null, ["Mapped screening only"]);
    return output.slice(0, 4);
  }

  function recommendation(assessment, issues) {
    const material = issues.filter((item) => item.severity === "material").length;
    const attention = issues.filter((item) => item.severity !== "material").length;
    if ((assessment.flags || []).some((item) => item.severity === "critical")) return { title: "Professional review required", copy: `${material} material issues and ${attention} checks require attention.` };
    if (material > 0) return { title: "Investigate before offering", copy: `${material} material issue${material === 1 ? "" : "s"} and ${attention} checks require attention.` };
    return { title: "Proceed with caution", copy: `${material} material issues and ${attention} checks require attention.` };
  }

  function overallCounts(categories) {
    const checks = categories.flatMap((category) => category.checks);
    return {
      total: checks.length,
      completed: checks.filter((check) => ["complete", "issue"].includes(check.state)).length,
      attention: checks.filter((check) => check.state === "issue").length,
      unavailable: checks.filter((check) => ["unavailable", "not-started"].includes(check.state)).length,
    };
  }

  function issueCard(item, index) {
    const source = item.source;
    const confidence = source?.mode === "live" ? "High" : item.severity === "pending" ? "Low" : "Medium";
    const impact = item.severity === "material" ? "High" : item.severity === "attention" ? "Medium" : "Unknown";
    const tone = item.severity === "material" ? "" : item.severity === "attention" ? " is-attention" : " is-pending";
    return `<article class="lcw-issue${tone}" data-lcw-issue="${index}">
      <div class="lcw-issue-icon">${item.severity === "material" ? "!" : item.severity === "pending" ? "?" : "!"}</div>
      <div class="lcw-issue-copy"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.detail)}</p><div class="lcw-tags">${item.tags.map((tag) => `<span class="lcw-tag">${escapeHtml(tag)}</span>`).join("")}</div></div>
      <div class="lcw-issue-meta"><span>Impact</span><b>${impact}</b><span>Confidence</span><b>${confidence}</b><span>Source</span><b>${escapeHtml(source?.dataset || "Evidence not supplied")}</b></div>
      <button type="button" class="lcw-chevron" data-lcw-open-issue="${index}" aria-label="Open ${escapeHtml(item.title)}">›</button>
    </article>`;
  }

  function categoryRow(category) {
    return `<button type="button" class="lcw-category-row" data-lcw-category="${escapeHtml(category.key)}" style="--cat:${category.colour};--cat-soft:${category.soft}">
      <span class="lcw-category-icon">${icon(category.icon)}</span><span class="lcw-category-copy"><strong>${escapeHtml(category.title)}</strong><small>${escapeHtml(category.subtitle)}</small></span>
      <span class="lcw-status ${category.status}">${statusLabel(category.status)}</span><span class="lcw-category-count">${category.completed} / ${category.total}</span><span class="lcw-category-arrow">›</span>
    </button>`;
  }

  function snapshot(data) {
    const bushfire = detected(data, "constraint.bushfire") ? "Mapped" : resolved(metric(data, "constraint.bushfire")) ? "Not detected" : "Unavailable";
    const flood = (data.metrics || []).some((item) => item.category === "Flood" && item.status === "detected") ? "Records returned" : "No material record detected";
    return `<div class="lcw-snapshot-list">
      <div><span>Land size</span><b>${escapeHtml(areaLabel(data))}</b></div><div><span>Land use zone</span><b>${escapeHtml(zoneLabel(data))}</b></div>
      <div><span>Lot on plan</span><b>${escapeHtml(parcelLabel(data))}</b></div><div><span>Property price</span><b>$–</b></div>
      <div><span>Heritage</span><b>${detected(data, "planning.heritage.reference") || detected(data, "planning.heritage.state") ? "Mapped control" : "Not detected"}</b></div>
      <div><span>Flood screen</span><b>${escapeHtml(flood)}</b></div><div><span>Bushfire</span><b>${escapeHtml(bushfire)}</b></div>
    </div>`;
  }

  function meaningItems(issues) {
    return issues.slice(0, 3).map((item, index) => `<div class="lcw-meaning"><span class="lcw-meaning-icon">${index + 1}</span><div><b>${escapeHtml(item.title)}</b><p>${escapeHtml(item.action)}</p></div></div>`).join("");
  }

  function nextItems(issues) {
    const defaults = [
      "Obtain a current building and pest report.", "Ask a conveyancer to review the contract, title and approvals.", "Obtain an address-specific insurance quote.", "Review pricing evidence before offering.",
    ];
    const actions = [...new Set([...issues.map((item) => item.action), ...defaults])].slice(0, 4);
    return actions.map((action, index) => `<div class="lcw-next-item"><span class="lcw-step">${index + 1}</span><div><b>${escapeHtml(action)}</b><p>${index < issues.length ? "Recommended from the current assessment." : "Required before relying on the result."}</p></div></div>`).join("");
  }

  function navButton(view, label, iconName) {
    return `<button type="button" class="lcw-nav-button${currentView === view ? " is-active" : ""}" data-lcw-view="${view}">${icon(iconName)}<span>${label}</span></button>`;
  }

  function mobileNav(view, label, iconName) {
    return `<button type="button" class="lcw-mobile-nav${currentView === view ? " is-active" : ""}" data-lcw-view="${view}">${icon(iconName)}<span>${label}</span></button>`;
  }

  function summaryView(data, assessment, categories, issues) {
    const rec = recommendation(assessment, issues);
    const coverage = Math.round(finite(assessment.confidence?.score) || 0);
    const publicConfidence = Math.round(finite(assessment.confidence?.publicSourceScore) || coverage);
    const confidenceLabel = publicConfidence >= 85 ? "High" : publicConfidence >= 65 ? "Medium" : "Low";
    return `<section class="lcw-view${currentView === "summary" ? " is-active" : ""}" data-lcw-panel="summary">
      <article class="lcw-property-card lcw-card">
        <div class="lcw-property-main"><div class="lcw-property-visual">${propertySnapshotSvg(data)}</div><div class="lcw-property-copy"><h1>${escapeHtml(data.canonical_address)}</h1><div class="lcw-property-facts"><span>${icon("parcel")} ${escapeHtml(parcelLabel(data))}</span><span>${icon("house")} Residential</span><span>${icon("ruler")} ${escapeHtml(areaLabel(data))}</span></div></div><button type="button" class="lcw-share" data-lcw-share>${icon("share")} Share</button></div>
        <div class="lcw-goal-row"><span><b>Your goal:</b> ${escapeHtml(profileGoal(assessment))}</span><button type="button" data-lcw-edit-goal>Edit</button></div>
      </article>
      <article class="lcw-recommendation lcw-card"><div class="lcw-recommendation-lead"><span class="lcw-recommendation-icon">!</span><div><h2>${escapeHtml(rec.title)}</h2><p>${escapeHtml(rec.copy)}</p><button type="button" class="lcw-reason-button" data-lcw-reason>Why this recommendation?</button></div></div><div class="lcw-recommendation-metric"><span>Evidence coverage</span><strong>${coverage}%</strong><small>${coverage >= 70 ? "Good" : "Partial"}</small></div><div class="lcw-recommendation-metric"><span>Confidence</span><strong>${confidenceLabel}</strong><small>Based on available data</small></div><div class="lcw-recommendation-metric"><span>Intended use</span><strong>${escapeHtml(profileGoal(assessment))}</strong><small>${assessment.profile?.goal ? "Personalised" : "Not set"}</small></div></article>
      <div class="lcw-content-grid"><div class="lcw-center">
        <section class="lcw-section lcw-card"><div class="lcw-section-head"><h2>Priority issues <b>${issues.length}</b></h2><button type="button" class="lcw-link-button" data-lcw-view="checks">View all issues →</button></div><div class="lcw-issues">${issues.slice(0, 2).map(issueCard).join("")}</div></section>
        <section class="lcw-map-card lcw-card"><div class="lcw-section-head"><h2>Property map</h2><button type="button" class="lcw-link-button" data-lcw-view="map">Open map →</button></div><div class="lcw-map-chips"><button class="lcw-map-chip" data-lcw-layer="flood"><i style="background:#2583d8"></i>Flood</button><button class="lcw-map-chip" data-lcw-layer="bushfire"><i style="background:#e23d3d"></i>Bushfire</button><button class="lcw-map-chip" data-lcw-layer="heritage"><i style="background:#8b5ad8"></i>Heritage</button><button class="lcw-map-chip" data-lcw-layer="planning"><i style="background:#f3aa13"></i>Planning</button><button class="lcw-map-chip" data-lcw-layer="parcel"><i style="background:#118a63"></i>Parcel</button></div><div class="lcw-map-host" data-lcw-map-host></div></section>
        <section class="lcw-section lcw-card lcw-mobile-meaning" style="display:none"><div class="lcw-section-head"><h2>What this means for you</h2></div><div class="lcw-meaning-list">${meaningItems(issues)}</div></section>
        <section class="lcw-section lcw-card"><div class="lcw-section-head"><h2>Category summary</h2><button type="button" class="lcw-link-button" data-lcw-view="checks">View all checks →</button></div><div class="lcw-category-list">${categories.map(categoryRow).join("")}</div></section>
        <section class="lcw-rail-card lcw-card lcw-advice lcw-mobile-meaning" style="display:none"><h3>LemonCheck is general information only</h3><p>Speak with a conveyancer, planner, valuer, insurer or building inspector for advice specific to this property.</p><a href="#">Find local experts</a></section>
      </div><aside class="lcw-right-rail"><section class="lcw-rail-card lcw-card"><h3>Property snapshot</h3>${snapshot(data)}<button type="button" class="lcw-link-button" data-lcw-view="checks">View full snapshot</button></section><section class="lcw-rail-card lcw-card"><h3>What this means for you</h3><div class="lcw-meaning-list">${meaningItems(issues)}</div></section><section class="lcw-rail-card lcw-card"><h3>Next steps</h3><div class="lcw-next-list">${nextItems(issues)}</div></section><section class="lcw-rail-card lcw-card lcw-advice"><h3>Need professional advice?</h3><p>LemonCheck is general information only. Speak with a conveyancer, planner, valuer, insurer or building inspector for advice specific to this property.</p><a href="#">Find local experts</a></section></aside></div>
    </section>`;
  }

  function checksView(categories) {
    return `<section class="lcw-view${currentView === "checks" ? " is-active" : ""}" data-lcw-panel="checks"><div class="lcw-checks-view"><header class="lcw-page-title lcw-card"><h1>All property checks</h1><p>Every check retains its current status, evidence source and availability.</p></header>${categories.map((category) => `<section class="lcw-check-group lcw-card" data-check-category="${escapeHtml(category.key)}"><div class="lcw-section-head"><h2>${escapeHtml(category.title)}</h2><span class="lcw-status ${category.status}">${statusLabel(category.status)} · ${category.completed}/${category.total}</span></div>${category.checks.map((check, index) => `<div class="lcw-check-row" data-lcw-check="${escapeHtml(category.key)}:${index}"><span class="lcw-category-icon" style="--cat:${category.colour};--cat-soft:${category.soft}">${icon(category.icon)}</span><span><b>${escapeHtml(check.label)}</b><small>${escapeHtml(check.item?.display_value || "Evidence not connected")}</small></span><span class="lcw-check-state ${check.state}">${check.state.replace("-", " ")}</span><span>›</span></div>`).join("")}</section>`).join("")}</div></section>`;
  }

  function documentsView() {
    const docs = [
      ["Title search", "Confirm ownership, registered interests and easements."], ["Contract of sale", "Review disclosures, conditions and inclusions."],
      ["Building inspection", "Assess structure, moisture, defects and maintenance."], ["Pest inspection", "Assess termites and timber pests."],
      ["Approval records", "Confirm alterations and improvements are approved."], ["Insurance quote", "Confirm availability, exclusions and premium."],
    ];
    return `<section class="lcw-view${currentView === "docs" ? " is-active" : ""}" data-lcw-panel="docs"><div class="lcw-docs-view"><header class="lcw-page-title lcw-card"><h1>Documents</h1><p>These documents are required before LemonCheck can provide a broader assessment.</p></header>${docs.map(([title, copy]) => `<article class="lcw-doc-card lcw-card"><span class="lcw-doc-icon">${icon("docs")}</span><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(copy)}</p></div><button type="button" data-lcw-upload>${icon("upload")} Add document</button></article>`).join("")}</div></section>`;
  }

  function mapView(data) {
    return `<section class="lcw-view${currentView === "map" ? " is-active" : ""}" data-lcw-panel="map"><div class="lcw-map-view"><header class="lcw-page-title lcw-card"><h1>Property map</h1><p>Official parcel and configured overlay geometry shown over street or satellite context.</p></header><section class="lcw-map-card lcw-card"><div class="lcw-map-chips"><button class="lcw-map-chip" data-lcw-layer="flood"><i style="background:#2583d8"></i>Flood</button><button class="lcw-map-chip" data-lcw-layer="bushfire"><i style="background:#e23d3d"></i>Bushfire</button><button class="lcw-map-chip" data-lcw-layer="heritage"><i style="background:#8b5ad8"></i>Heritage</button><button class="lcw-map-chip" data-lcw-layer="planning"><i style="background:#f3aa13"></i>Planning</button><button class="lcw-map-chip" data-lcw-layer="parcel"><i style="background:#118a63"></i>Parcel</button></div><div class="lcw-map-host" data-lcw-map-host></div></section><section class="lcw-section lcw-card"><div class="lcw-section-head"><h2>Map limitations</h2></div><p style="margin:0;color:#66716d;font-size:10px;line-height:1.55">Cadastral and overlay geometry is screening information. It is not a legal survey boundary, title search, planning certificate or site-specific professional conclusion.</p></section></div></section>`;
  }

  function appHtml(data, assessment, categories, issues) {
    const counts = overallCounts(categories);
    const coverage = Math.round(finite(assessment.confidence?.score) || 0);
    return `<div class="lcw-desktop-shell" data-ux-version="${VERSION}"><aside class="lcw-sidebar"><div class="lcw-brand"><span class="lcw-brand-mark">✓</span><span>LemonCheck</span></div><nav class="lcw-side-nav">${navButton("summary", "Report summary", "summary")}${navButton("checks", "All checks", "checks")}${navButton("docs", "Documents", "docs")}${navButton("map", "Property map", "map")}</nav><section class="lcw-coverage-card"><h3>Evidence coverage</h3><div class="lcw-coverage-top"><div class="lcw-ring" style="--value:${coverage}"><strong>${coverage}%</strong></div><div><b>${counts.total} checks</b><p style="margin:4px 0 0;color:#6d7774;font-size:9px">Current planned check set</p></div></div><div class="lcw-check-counts"><span><i class="lcw-dot complete">✓</i>${counts.completed} Completed</span><span><i class="lcw-dot attention">!</i>${counts.attention} Require attention</span><span><i class="lcw-dot unavailable">·</i>${counts.unavailable} Not available</span></div><button class="lcw-link-button" data-lcw-reason style="margin-top:10px">What does this mean?</button></section><div class="lcw-side-meta"><b>Report generated</b>${new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short", timeZone: "Australia/Brisbane" }).format(new Date(data.refreshed_at || Date.now()))}<b>Sources updated</b>Current live retrieval</div><button type="button" class="lcw-download" data-lcw-print>⇩ Download PDF</button><div class="lcw-side-footer"><a href="#">How it works</a><a href="#">Privacy</a><a href="#">Terms</a><a href="#">Give feedback</a><span>© 2026 LemonCheck</span></div></aside><main class="lcw-main"><div class="lcw-main-inner"><header class="lcw-mobile-top"><button data-lcw-back aria-label="Back">‹</button><strong>LemonCheck</strong><button data-lcw-share aria-label="Share">↥</button></header><button type="button" class="lcw-back" data-lcw-back>${icon("back")} Back to search</button>${summaryView(data, assessment, categories, issues)}${checksView(categories)}${documentsView()}${mapView(data)}</div></main></div><nav class="lcw-mobile-bottom">${mobileNav("summary", "Summary", "summary")}${mobileNav("checks", "Checks", "checks")}${mobileNav("map", "Map", "map")}${mobileNav("docs", "Docs", "docs")}</nav>`;
  }

  function mountMap() {
    if (!document.documentElement.classList.contains("lcw-active")) return;
    const host = [...document.querySelectorAll('[data-lcw-map-host]')].find((node) => getComputedStyle(node.closest('.lcw-view')).display !== "none") || document.querySelector('[data-lcw-map-host]');
    const map = document.getElementById("context-property-map");
    if (host && map) {
      if (map.parentElement !== host) host.replaceChildren(map);
      mapRetries = 0;
      window.dispatchEvent(new Event("resize"));
      return;
    }
    if (mapRetries < 30) {
      mapRetries += 1;
      setTimeout(mountMap, 250);
    }
  }

  function setView(view) {
    if (!new Set(["summary", "checks", "docs", "map"]).has(view)) return;
    currentView = view;
    document.querySelectorAll("[data-lcw-panel]").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.lcwPanel === view));
    document.querySelectorAll("[data-lcw-view]").forEach((button) => button.classList.toggle("is-active", button.dataset.lcwView === view));
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(mountMap, 20);
  }

  function saveCurrent() {
    const source = document.querySelector('[data-save-property]');
    if (source) source.click();
  }

  function openCompare() {
    const source = document.querySelector('[data-open-comparison]');
    if (source) source.click();
  }

  function openIssue(index, issues) {
    const item = issues[index];
    if (!item) return;
    let dialog = document.querySelector(".lcw-dialog");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.className = "lcw-dialog";
      document.body.appendChild(dialog);
    }
    const source = item.source;
    dialog.innerHTML = `<div class="lcw-dialog-shell"><div class="lcw-dialog-head"><div><small>${escapeHtml(item.severity)}</small><h2>${escapeHtml(item.title)}</h2></div><button type="button" data-lcw-close>×</button></div><p class="lcw-dialog-copy">${escapeHtml(item.detail)}</p><div class="lcw-dialog-grid"><article><span>Impact</span><strong>${item.severity === "material" ? "High" : item.severity === "attention" ? "Medium" : "Unknown"}</strong></article><article><span>Confidence</span><strong>${source?.mode === "live" ? "High" : "Limited"}</strong></article><article><span>Source</span><strong>${escapeHtml(source?.dataset || "Evidence not supplied")}</strong></article><article><span>Retrieved</span><strong>${escapeHtml(source?.retrieved_at ? new Intl.DateTimeFormat("en-AU", { dateStyle: "medium" }).format(new Date(source.retrieved_at)) : "Not available")}</strong></article></div><p class="lcw-dialog-copy"><b>Next action:</b> ${escapeHtml(item.action)}</p><div class="lcw-dialog-actions"><button data-lcw-close>Close</button>${source?.authoritative_url ? `<a class="primary" style="display:inline-flex;align-items:center;padding:0 12px;border-radius:7px;text-decoration:none" target="_blank" rel="noopener" href="${escapeHtml(source.authoritative_url)}">Open source</a>` : ""}</div></div>`;
    dialog.querySelectorAll("[data-lcw-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));
    if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
  }

  function openCheck(key, categories) {
    const [categoryKey, indexValue] = String(key).split(":");
    const category = categories.find((item) => item.key === categoryKey);
    const check = category?.checks?.[Number(indexValue)];
    if (!check) return;
    const item = check.item;
    const synthetic = {
      severity: check.state === "issue" ? "material" : ["unavailable", "not-started"].includes(check.state) ? "pending" : "complete",
      title: check.label,
      detail: item?.summary || "This evidence has not been connected or supplied.",
      action: item?.limitations?.[0] || (item ? "Review the source evidence before relying on this check." : "Add the required evidence or obtain professional advice."),
      source: item?.source || null,
    };
    openIssue(0, [synthetic]);
  }

  function toggleLayer(keyword) {
    const control = document.querySelector("#context-property-map .context-layer-control");
    if (!control) return;
    const labels = [...control.querySelectorAll("label")];
    const matches = labels.filter((label) => {
      const text = label.textContent.toLowerCase();
      if (keyword === "parcel") return text.includes("parcel") || text.includes("lot");
      if (keyword === "planning") return text.includes("zone") || text.includes("character");
      return text.includes(keyword);
    });
    matches.forEach((label) => {
      const input = label.querySelector("input");
      if (input) input.checked = !input.checked;
    });
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function editGoal() {
    const form = document.querySelector(".lc-profile-form");
    if (!form) return;
    const goal = window.prompt("Primary goal: live_in, renovate, develop or invest", form.querySelector('[name="goal"]')?.value || "live_in");
    if (!goal) return;
    const select = form.querySelector('[name="goal"]');
    if (select && [...select.options].some((option) => option.value === goal)) select.value = goal;
    form.requestSubmit?.();
  }

  function bind(data, assessment, categories, issues) {
    document.querySelectorAll("[data-lcw-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.lcwView)));
    document.querySelectorAll("[data-lcw-back]").forEach((button) => button.addEventListener("click", () => { location.hash = "#/home"; }));
    document.querySelectorAll("[data-lcw-share]").forEach((button) => button.addEventListener("click", async () => {
      const payload = { title: data.canonical_address, text: `LemonCheck report for ${data.canonical_address}`, url: location.href };
      if (navigator.share) await navigator.share(payload).catch(() => {}); else await navigator.clipboard?.writeText(location.href).catch(() => {});
    }));
    document.querySelectorAll("[data-lcw-reason]").forEach((button) => button.addEventListener("click", () => openIssue(0, [{ severity: "information", title: "How the recommendation is formed", detail: "The recommendation prioritises critical and material mapped findings, then shows important evidence gaps separately. It is not a buying recommendation and does not replace professional due diligence.", action: "Review the priority issues, all checks and required documents before relying on the result.", source: null }])));
    document.querySelectorAll("[data-lcw-open-issue]").forEach((button) => button.addEventListener("click", () => openIssue(Number(button.dataset.lcwOpenIssue), issues)));
    document.querySelectorAll("[data-lcw-check]").forEach((row) => row.addEventListener("click", () => openCheck(row.dataset.lcwCheck, categories)));
    document.querySelectorAll("[data-lcw-category]").forEach((row) => row.addEventListener("click", () => { setView("checks"); setTimeout(() => document.querySelector(`[data-check-category="${CSS.escape(row.dataset.lcwCategory)}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }));
    document.querySelectorAll("[data-lcw-layer]").forEach((button) => button.addEventListener("click", () => toggleLayer(button.dataset.lcwLayer)));
    document.querySelectorAll("[data-lcw-edit-goal]").forEach((button) => button.addEventListener("click", editGoal));
    document.querySelectorAll("[data-lcw-print]").forEach((button) => button.addEventListener("click", () => window.print()));
    document.querySelectorAll("[data-lcw-upload]").forEach((button) => button.addEventListener("click", () => openIssue(0, [{ severity: "pending", title: "Document upload is not connected yet", detail: "The release UI supports this workflow, but document storage and analysis require the production backend.", action: "Use the concierge pilot workflow until secure uploads are available.", source: null }])));
    const propertyActions = document.querySelector(".lcw-property-card .lcw-property-main");
    if (propertyActions) {
      const controls = document.createElement("div");
      controls.style.display = "none";
      controls.innerHTML = '<button data-lcw-save-proxy></button><button data-lcw-compare-proxy></button>';
      propertyActions.appendChild(controls);
    }
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") document.querySelector(".lcw-dialog[open]")?.close(); }, { once: true });
    window.LemonCheckWorkspace = { saveCurrent, openCompare, setView };
  }

  function render(data, assessment) {
    if (location.hash.includes("/preview/full-report")) return;
    const reportPage = document.querySelector('[data-spa-page="report"]');
    if (!reportPage || !data?.property_id || !data?.canonical_address || !assessment?.objective) return;
    document.documentElement.classList.add("lcw-active");
    let app = reportPage.querySelector(".lcw-app");
    if (!app) {
      app = document.createElement("div");
      app.className = "lcw-app";
      reportPage.appendChild(app);
    }
    const categories = buildCategories(data);
    const issues = priorityIssues(data, assessment);
    app.innerHTML = appHtml(data, assessment, categories, issues);
    bind(data, assessment, categories, issues);
    setView(currentView);
    mapRetries = 0;
    setTimeout(mountMap, 30);
    window.dispatchEvent(new CustomEvent("lemoncheck:workspace-ready", { detail: { version: VERSION, propertyId: String(data.property_id) } }));
  }

  function sync() {
    if (location.hash.includes("/preview/full-report")) {
      document.documentElement.classList.remove("lcw-active");
      return;
    }
    const data = window.PROPERTY_DATA;
    const assessment = window.LEMONCHECK_ASSESSMENT;
    if (!data?.property_id || !data?.canonical_address || !assessment?.objective) return;
    const signature = JSON.stringify([data.property_id, data.canonical_address, assessment.objective?.lemonScore, assessment.deal?.score, assessment.fit?.score, assessment.development?.score, assessment.confidence?.score, assessment.flags?.length, assessment.advisories?.length, assessment.profile?.goal, currentView]);
    if (signature !== lastSignature || !document.querySelector(`[data-ux-version="${VERSION}"]`)) {
      lastSignature = signature;
      render(data, assessment);
    }
  }

  window.addEventListener("hashchange", () => {
    if (!location.hash.startsWith("#/report")) {
      document.documentElement.classList.remove("lcw-active");
      currentView = "summary";
      lastSignature = "";
    }
    setTimeout(sync, 100);
  });
  ["property-check:report-ready", "lemoncheck:assessment-ready", "lemoncheck:governance-ready", "lemoncheck:pricing-ready"].forEach((eventName) => window.addEventListener(eventName, () => setTimeout(sync, 0)));
  setInterval(sync, 400);
  setTimeout(sync, 50);
})();
