(() => {
  "use strict";

  const ROUTE = "#/preview/full-report";
  const VERSION = "LC-FULL-PREVIEW-v0.1.0";
  const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
  const money = (value) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);

  const DATA = {
    asking: 1490000,
    avmLow: 1400000,
    avmMid: 1470000,
    avmHigh: 1540000,
    riskAdjustedValue: 1455000,
    defaultOffer: 1400000,
    immediateWorksLow: 18000,
    immediateWorksHigh: 32000,
    fiveYearLow: 48000,
    fiveYearHigh: 75000,
  };

  function scoreState(score) {
    if (score >= 75) return "strong";
    if (score >= 50) return "mixed";
    return "weak";
  }

  function scoreCard(key, label, score, note) {
    return `<article class="fp-score fp-${scoreState(score)}" data-preview-score="${key}">
      <span>${label}</span><strong>${score}<small>/100</small></strong><i><b style="width:${score}%"></b></i><p>${note}</p>
    </article>`;
  }

  function evidenceBadge(status, label) {
    return `<span class="fp-evidence-badge fp-evidence-${status}">${label}</span>`;
  }

  function renderPreview() {
    document.documentElement.classList.add("full-preview-active");
    document.body.className = "full-preview-body";
    document.title = "LemonCheck Complete Report Preview";
    document.body.innerHTML = `
      <header class="fp-topbar">
        <a class="fp-brand" href="#/home" aria-label="Back to LemonCheck"><span>LC</span><b>LemonCheck</b></a>
        <div class="fp-topbar-center"><b>Complete report preview</b><span>${VERSION}</span></div>
        <div class="fp-topbar-actions"><span class="fp-simulated">Illustrative data</span><a href="#/home">Live beta</a></div>
      </header>

      <nav class="fp-section-nav" aria-label="Report sections">
        <a href="#fp-summary">Summary</a><a href="#fp-price">Price</a><a href="#fp-condition">Condition</a><a href="#fp-title">Title & planning</a><a href="#fp-fit">Fit</a><a href="#fp-development">Potential</a><a href="#fp-actions">Actions</a><a href="#fp-evidence">Evidence</a>
      </nav>

      <main class="fp-main">
        <aside class="fp-demo-banner"><b>Future-state product preview.</b> All property, price, building, legal and insurance information below is simulated to demonstrate the intended interface once licensed and uploaded data is connected.</aside>

        <section id="fp-summary" class="fp-hero fp-card">
          <div class="fp-listing-visual" role="img" aria-label="Illustrative property listing image placeholder">
            <svg viewBox="0 0 700 500" aria-hidden="true"><defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9d9d1"/><stop offset="1" stop-color="#edf4ee"/></linearGradient></defs><rect width="700" height="500" fill="url(#sky)"/><circle cx="594" cy="95" r="42" fill="#fff4c8"/><rect y="370" width="700" height="130" fill="#78947c"/><path d="M122 356h454v92H122z" fill="#f8f6ee"/><path d="M90 360l160-132h252l108 132z" fill="#354c4a"/><path d="M213 282h240v166H213z" fill="#fbfaf5"/><rect x="254" y="330" width="76" height="118" fill="#9b6e52"/><rect x="355" y="318" width="62" height="68" fill="#8cc4c8"/><rect x="142" y="378" width="70" height="70" fill="#8cc4c8"/><path d="M0 446c145-45 242-34 348 0 102-38 215-45 352-1v55H0z" fill="#47664f"/></svg>
            <div class="fp-photo-tag">Licensed listing image</div>
            <div class="fp-property-specs"><span>4 beds</span><span>2 baths</span><span>2 cars</span><span>607 m²</span></div>
          </div>

          <div class="fp-hero-content">
            <div class="fp-kicker">18 Example Street, Paddington QLD 4064</div>
            <h1>Strong shortlist. Negotiate on price and resolve two issues.</h1>
            <p class="fp-hero-summary">The property fits your lifestyle and has no major mapped hazard issue. The rear deck approval and bathroom moisture need resolution, while the asking price sits above the current risk-adjusted value.</p>
            <div class="fp-key-numbers">
              <div><span>Asking</span><strong>${money(DATA.asking)}</strong><small>Advertised price</small></div>
              <div><span>Market estimate</span><strong>${money(DATA.avmMid)}</strong><small>${money(DATA.avmLow)}–${money(DATA.avmHigh)}</small></div>
              <div><span>Your offer</span><strong data-offer-display>${money(DATA.defaultOffer)}</strong><small>Editable below</small></div>
            </div>
            <div class="fp-primary-actions"><button type="button" data-jump="fp-price">Test an offer</button><button type="button" class="secondary" data-jump="fp-actions">See next actions</button><button type="button" class="ghost">Save property</button></div>
          </div>

          <div class="fp-primary-score">
            <span>Lemon Score</span><strong>82<small>/100</small></strong><b>Generally sound</b><p>Physical, title and mapped-risk evidence combined.</p>
            <div class="fp-completeness"><span>Assessment completeness</span><b>91%</b><i><em style="width:91%"></em></i></div>
          </div>
        </section>

        <section class="fp-score-strip">
          ${scoreCard("lemon", "Lemon", 82, "Generally sound")}
          ${scoreCard("deal", "Deal", 73, "Reasonable at your offer")}
          ${scoreCard("fit", "Personal Fit", 88, "Strong match")}
          ${scoreCard("development", "Development", 61, "Useful options")}
          ${scoreCard("confidence", "Confidence", 91, "Broad evidence")}
        </section>

        <section class="fp-two-column fp-priority-grid">
          <article class="fp-card fp-priority">
            <div class="fp-section-heading"><div><span>Decision drivers</span><h2>Three things that matter now.</h2></div><b>3</b></div>
            <div class="fp-priority-list">
              <div class="fp-priority-item material"><span>1</span><div><b>Rear deck approval is not confirmed</b><p>The current improvements do not fully reconcile with the available approval record.</p><small>Ask the conveyancer to confirm approval and final inspection records before going unconditional.</small></div><em>Material</em></div>
              <div class="fp-priority-item material"><span>2</span><div><b>Moisture detected beside the rear bathroom</b><p>The building report records elevated moisture but does not identify the source.</p><small>Arrange a targeted plumbing and waterproofing investigation.</small></div><em>Material</em></div>
              <div class="fp-priority-item positive"><span>3</span><div><b>Strong match for your daily life</b><p>Commute, outdoor space, schools and renovation intent align well with your profile.</p><small>No action required. Confirm peak-hour noise during a second inspection.</small></div><em>Positive</em></div>
            </div>
          </article>

          <article class="fp-card fp-next-three">
            <div class="fp-section-heading"><div><span>Do next</span><h2>Your next three actions.</h2></div></div>
            <ol>
              <li><b>Confirm deck approval</b><span>Conveyancer · before offer becomes unconditional</span><button type="button">Copy question</button></li>
              <li><b>Investigate bathroom moisture</b><span>Building inspector / plumber · before offer</span><button type="button">Add to checklist</button></li>
              <li><b>Negotiate toward ${money(DATA.defaultOffer)}</b><span>Buyer / agent · current evidence suggests limited value above this range</span><button type="button" data-jump="fp-price">Open price analysis</button></li>
            </ol>
          </article>
        </section>

        <section id="fp-price" class="fp-card fp-section">
          <div class="fp-section-heading fp-with-action"><div><span>Price & deal</span><h2>Is the property worth the price?</h2><p>Advertised price, AVM, recent sales and known costs remain separate so you can see the assumptions.</p></div><div class="fp-deal-badge"><span>Deal Score</span><strong data-deal-score>73</strong><small>/100</small></div></div>
          <div class="fp-price-overview">
            <article><span>Advertised price</span><strong>${money(DATA.asking)}</strong><small>Licensed listing feed · updated today</small></article>
            <article><span>Automated estimate</span><strong>${money(DATA.avmMid)}</strong><small>${money(DATA.avmLow)}–${money(DATA.avmHigh)} · medium-high confidence</small></article>
            <article><span>Risk-adjusted value</span><strong>${money(DATA.riskAdjustedValue)}</strong><small>After immediate works and uncertainty allowance</small></article>
            <article><span>Latest recorded sale</span><strong>$1,080,000</strong><small>September 2021 · verified record</small></article>
          </div>

          <div class="fp-price-workbench">
            <div class="fp-offer-control">
              <label for="fp-offer">Offer you are considering</label>
              <div><span>$</span><input id="fp-offer" type="number" min="1200000" max="1700000" step="5000" value="${DATA.defaultOffer}"></div>
              <input id="fp-offer-range" type="range" min="1300000" max="1600000" step="5000" value="${DATA.defaultOffer}">
              <p data-offer-verdict>At this offer, the property sits below the risk-adjusted value with a modest negotiation buffer.</p>
            </div>
            <div class="fp-price-scale" aria-label="Price evidence range">
              <div class="fp-scale-track"><span class="comp c1" style="left:12%"><b>$1.36m</b><em>Comp 1</em></span><span class="comp c2" style="left:28%"><b>$1.41m</b><em>Comp 2</em></span><span class="comp c3" style="left:48%"><b>$1.47m</b><em>AVM</em></span><span class="comp c4" style="left:55%"><b>$1.49m</b><em>Asking</em></span><span class="offer" data-offer-marker style="left:25%"><b data-offer-marker-label>$1.40m</b><em>Your offer</em></span></div>
              <div class="fp-scale-axis"><span>$1.30m</span><span>$1.40m</span><span>$1.50m</span><span>$1.60m</span></div>
            </div>
          </div>

          <details class="fp-comps"><summary>Comparable sales used <b>3</b></summary><div class="fp-table-wrap"><table><thead><tr><th>Comparable</th><th>Sale date</th><th>Sale price</th><th>Land</th><th>Similarity</th></tr></thead><tbody><tr><td>22 Sample Street, Paddington</td><td>May 2026</td><td>$1,410,000</td><td>607 m²</td><td>High</td></tr><tr><td>8 Reference Avenue, Paddington</td><td>March 2026</td><td>$1,360,000</td><td>506 m²</td><td>Medium-high</td></tr><tr><td>31 Example Road, Red Hill</td><td>February 2026</td><td>$1,485,000</td><td>615 m²</td><td>Medium</td></tr></tbody></table></div></details>
        </section>

        <section id="fp-condition" class="fp-card fp-section">
          <div class="fp-section-heading"><div><span>Condition & ownership costs</span><h2>What will the property likely cost to own?</h2><p>Building and pest evidence is separated from estimates and insurance.</p></div></div>
          <div class="fp-cost-summary">
            <article><span>Immediate works</span><strong>${money(DATA.immediateWorksLow)}–${money(DATA.immediateWorksHigh)}</strong><small>Bathroom investigation, gutters, minor electrical works</small></article>
            <article><span>Five-year maintenance</span><strong>${money(DATA.fiveYearLow)}–${money(DATA.fiveYearHigh)}</strong><small>Modelled range, not contractor quotes</small></article>
            <article><span>Annual insurance</span><strong>$2,650–$3,400</strong><small>Two indicative address-specific quotes</small></article>
            <article><span>Rates & utilities</span><strong>$4,820 p.a.</strong><small>Council, water and estimated fixed charges</small></article>
          </div>
          <div class="fp-condition-grid">
            <div class="fp-condition-row mixed"><div><span>Bathroom moisture</span><b>Investigate</b></div><p>Elevated readings at rear bathroom wall. Source not identified.</p><small>Building report pages 18–19 · medium confidence</small></div>
            <div class="fp-condition-row strong"><div><span>Structure and foundations</span><b>No major defect found</b></div><p>Minor settlement cracking only; inspector did not recommend engineering review.</p><small>Building report pages 7–11 · high confidence</small></div>
            <div class="fp-condition-row strong"><div><span>Termites and timber pests</span><b>No active termites found</b></div><p>No active termites observed. Previous treatment zone noted.</p><small>Pest report pages 4–8 · high confidence</small></div>
            <div class="fp-condition-row mixed"><div><span>Roof and drainage</span><b>Maintenance due</b></div><p>Gutter corrosion and local ponding. Roof void was fully accessed.</p><small>Building report pages 12–14 · high confidence</small></div>
          </div>
        </section>

        <section id="fp-title" class="fp-card fp-section">
          <div class="fp-section-heading"><div><span>Title, contract & planning</span><h2>Can you use and change the property as expected?</h2></div></div>
          <div class="fp-status-grid">
            <article class="good"><span>Title</span><strong>Single freehold lot</strong><p>No registered mortgage or caveat shown in the supplied title search.</p>${evidenceBadge("verified", "Verified")}</article>
            <article class="warn"><span>Building approvals</span><strong>Deck approval unresolved</strong><p>Current rear deck is not clearly matched to the approval history.</p>${evidenceBadge("action", "Action required")}</article>
            <article class="good"><span>Easements</span><strong>Rear drainage easement</strong><p>3 m drainage easement affects the rear boundary but not the dwelling footprint.</p>${evidenceBadge("verified", "Verified")}</article>
            <article class="good"><span>Planning</span><strong>Character residential</strong><p>Extension is plausible; demolition and major facade changes are constrained.</p>${evidenceBadge("current", "Current scheme")}</article>
          </div>
          <div class="fp-plan-map"><div class="fp-plan-map-bg"></div><svg viewBox="0 0 800 360" aria-hidden="true"><path d="M130 65L608 76L650 294L170 312Z" fill="rgba(33,153,116,.13)" stroke="#1d8b70" stroke-width="5"/><path d="M140 244L638 227L650 294L170 312Z" fill="rgba(84,95,190,.13)" stroke="#5656cb" stroke-width="4" stroke-dasharray="10 8"/><rect x="268" y="118" width="222" height="130" rx="8" fill="rgba(255,255,255,.72)" stroke="#173d39" stroke-width="3"/></svg><div class="fp-plan-legend"><span><i class="parcel"></i>Parcel</span><span><i class="easement"></i>Drainage easement</span><span><i class="dwelling"></i>Dwelling</span></div></div>
        </section>

        <section id="fp-fit" class="fp-card fp-section">
          <div class="fp-section-heading fp-with-action"><div><span>Personal Fit & location</span><h2>How well does it suit your life?</h2><p>Calculated for your “live in + renovate” profile.</p></div><div class="fp-fit-badge"><strong>88</strong><span>Strong fit</span></div></div>
          <div class="fp-fit-grid">
            <article><span>Work commute</span><strong>24 min</strong><small>Typical weekday drive · 31 min by public transport</small><b>Strong</b></article>
            <article><span>Schools</span><strong>3 nearby</strong><small>Within 2 km · catchment status checked</small><b>Strong</b></article>
            <article><span>Walkability</span><strong>78/100</strong><small>Groceries, cafés and parks within 15 minutes</small><b>Strong</b></article>
            <article><span>Road noise</span><strong>Moderate</strong><small>Elevated daytime level at front boundary</small><b class="mixed">Check again</b></article>
            <article><span>Outdoor space</span><strong>Good</strong><small>Usable rear yard with afternoon shade</small><b>Strong</b></article>
            <article><span>Renovation fit</span><strong>Good</strong><small>Internal changes feasible; external character controls apply</small><b class="mixed">Qualified</b></article>
          </div>
        </section>

        <section id="fp-development" class="fp-card fp-section">
          <div class="fp-section-heading fp-with-action"><div><span>Development Potential</span><h2>What could realistically be improved?</h2><p>Opportunity after planning, geometry, easements, servicing and basic feasibility constraints.</p></div><div class="fp-potential-score"><strong>61</strong><span>Useful options</span></div></div>
          <div class="fp-opportunity-grid">
            <article class="recommended"><span>Most realistic</span><h3>Rear extension and internal reconfiguration</h3><p>Likely compatible with the site and buyer goals, subject to character and deck-approval resolution.</p><strong>Indicative uplift: $180k–$280k</strong><small>Indicative project cost: $260k–$390k</small></article>
            <article><span>Possible</span><h3>Secondary dwelling</h3><p>Site width and servicing appear workable, but the rear easement reduces siting flexibility.</p><strong>Feasibility: medium</strong><small>Planner and services review required</small></article>
            <article class="not-recommended"><span>Low fit</span><h3>Demolition and rebuild</h3><p>Character controls and current market economics make this a poor initial strategy.</p><strong>Feasibility: low</strong><small>Not recommended for this buyer profile</small></article>
          </div>
        </section>

        <section id="fp-actions" class="fp-card fp-section">
          <div class="fp-section-heading"><div><span>Action plan</span><h2>What to do at each buying stage.</h2></div></div>
          <div class="fp-action-timeline">
            <article><span>1</span><div><b>Before your next inspection</b><ul><li>Recheck road noise during peak hour.</li><li>Inspect bathroom wall and adjoining rooms.</li><li>Confirm rear-yard access and drainage flow.</li></ul></div></article>
            <article><span>2</span><div><b>Before offering</b><ul><li>Ask agent for deck approval and final inspection records.</li><li>Arrange moisture-source investigation.</li><li>Use the price evidence to anchor below ${money(DATA.asking)}.</li></ul></div></article>
            <article><span>3</span><div><b>Before going unconditional</b><ul><li>Conveyancer confirms deck approval, easement and contract disclosures.</li><li>Obtain final insurance terms for the exact address.</li><li>Review building and pest clarifications in writing.</li></ul></div></article>
            <article><span>4</span><div><b>Before settlement</b><ul><li>Confirm agreed repairs or price adjustments.</li><li>Complete pre-settlement inspection.</li><li>Transfer warranties, reports and approval records into your property file.</li></ul></div></article>
          </div>
        </section>

        <section id="fp-evidence" class="fp-card fp-section fp-evidence-section">
          <div class="fp-section-heading fp-with-action"><div><span>Evidence & confidence</span><h2>Why the assessment is 91% complete.</h2><p>Every conclusion retains its source, retrieval date, authority and limitations.</p></div><div class="fp-evidence-score"><strong>91%</strong><span>Broad evidence</span></div></div>
          <div class="fp-evidence-progress"><i><b style="width:91%"></b></i><div><span>Connected and current</span><span>Outstanding</span></div></div>
          <div class="fp-evidence-modules">
            <article><span>Property identity</span><b>Complete</b><small>Queensland address, parcel and title records</small></article>
            <article><span>Planning & hazards</span><b>Complete</b><small>Council and state spatial sources</small></article>
            <article><span>Market & pricing</span><b>Complete</b><small>Licensed AVM, listing and sales data</small></article>
            <article><span>Building & pest</span><b>Complete</b><small>Uploaded reports with page-level extraction</small></article>
            <article><span>Contract & approvals</span><b class="mixed">Partial</b><small>Deck approval remains unresolved</small></article>
            <article><span>Insurance & costs</span><b>Complete</b><small>Two address-specific quotes and council charges</small></article>
            <article><span>Location & fit</span><b>Complete</b><small>Travel, amenity, noise and profile evidence</small></article>
            <article><span>Professional review</span><b class="mixed">Pending</b><small>Conveyancer response not yet uploaded</small></article>
          </div>
          <details class="fp-source-register"><summary>Open complete source register <b>28 sources</b></summary><div class="fp-table-wrap"><table><thead><tr><th>Source</th><th>Used for</th><th>Authority</th><th>Freshness</th></tr></thead><tbody><tr><td>Queensland cadastral service</td><td>Address, lot and parcel</td><td>Official</td><td>Current</td></tr><tr><td>Brisbane City Plan</td><td>Zoning and overlays</td><td>Official</td><td>Current</td></tr><tr><td>Licensed pricing provider</td><td>AVM, listing and sales</td><td>Commercial</td><td>Today</td></tr><tr><td>Building and pest report</td><td>Physical condition</td><td>Professional report</td><td>12 days old</td></tr><tr><td>Title search and contract</td><td>Ownership and approvals</td><td>Legal record</td><td>Current</td></tr><tr><td>Insurance quotes</td><td>Availability and premium</td><td>Commercial quotes</td><td>3 days old</td></tr></tbody></table></div></details>
        </section>

        <footer class="fp-footer"><div><b>LemonCheck full-product preview</b><span>Illustrative values only · ${VERSION}</span></div><p>This screen demonstrates the proposed product once licensed property, pricing, document, insurance and location data are connected. It is not an assessment of a real property and is not financial, legal, building or planning advice.</p><a href="#/home">Return to live beta</a></footer>
      </main>`;

    bindPreview();
  }

  function calculateDeal(offer) {
    const gapRatio = (DATA.riskAdjustedValue - offer) / DATA.avmMid;
    return clamp(Math.round(50 + gapRatio * 560));
  }

  function updateOffer(value) {
    const offer = Number(value);
    if (!Number.isFinite(offer)) return;
    const score = calculateDeal(offer);
    document.querySelectorAll("[data-offer-display]").forEach((element) => { element.textContent = money(offer); });
    document.querySelectorAll("[data-deal-score]").forEach((element) => { element.textContent = String(score); });
    const scoreCardElement = document.querySelector('[data-preview-score="deal"]');
    if (scoreCardElement) {
      scoreCardElement.className = `fp-score fp-${scoreState(score)}`;
      const strong = scoreCardElement.querySelector("strong");
      const bar = scoreCardElement.querySelector("i b");
      const note = scoreCardElement.querySelector("p");
      if (strong) strong.innerHTML = `${score}<small>/100</small>`;
      if (bar) bar.style.width = `${score}%`;
      if (note) note.textContent = score >= 75 ? "Attractive at this offer" : score >= 50 ? "Reasonable at this offer" : "Price looks unfavourable";
    }
    const position = clamp(((offer - 1300000) / 300000) * 100, 0, 100);
    const marker = document.querySelector("[data-offer-marker]");
    const label = document.querySelector("[data-offer-marker-label]");
    if (marker) marker.style.left = `${position}%`;
    if (label) label.textContent = `$${(offer / 1000000).toFixed(2)}m`;
    const verdict = document.querySelector("[data-offer-verdict]");
    if (verdict) {
      const difference = DATA.riskAdjustedValue - offer;
      verdict.textContent = difference >= 50000
        ? `This offer leaves ${money(difference)} below the current risk-adjusted value and supports a stronger Deal Score.`
        : difference >= 0
          ? `This offer is close to the current risk-adjusted value, with limited buffer for additional unknown costs.`
          : `This offer is ${money(Math.abs(difference))} above the current risk-adjusted value. The Deal Score falls until stronger evidence supports the premium.`;
    }
  }

  function bindPreview() {
    document.querySelectorAll("[data-jump]").forEach((button) => button.addEventListener("click", () => document.getElementById(button.dataset.jump)?.scrollIntoView({ behavior: "smooth", block: "start" })));
    const input = document.getElementById("fp-offer");
    const range = document.getElementById("fp-offer-range");
    input?.addEventListener("input", () => { range.value = input.value; updateOffer(input.value); });
    range?.addEventListener("input", () => { input.value = range.value; updateOffer(range.value); });
    updateOffer(DATA.defaultOffer);
  }

  function route() {
    if (location.hash === ROUTE) renderPreview();
  }

  window.addEventListener("hashchange", () => {
    if (location.hash === ROUTE) renderPreview();
    else if (document.documentElement.classList.contains("full-preview-active")) location.reload();
  });
  route();
})();