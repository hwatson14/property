(() => {
  "use strict";

  const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
  const metricById = (data, id) => (data.metrics || []).find((item) => item.metric_id === id);
  const isDetected = (data, id) => metricById(data, id)?.status === "detected";
  const isUnresolved = (item) => !item || item.status === "not_assessed" || item.source?.mode === "unavailable";

  function valueLooksMaterial(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "boolean") return value;
    const text = String(value).trim().toLowerCase();
    if (!text) return false;
    return !new Set([
      "0", "0.0", "false", "no", "none", "n", "not affected", "not detected",
      "null", "na", "n/a", "nil", "no matching records returned"
    ]).has(text);
  }

  function floodGroupIsMaterial(data, id) {
    const item = metricById(data, id);
    if (!item || item.status !== "detected") return false;
    if (!Array.isArray(item.value)) return true;
    return item.value.some((entry) => valueLooksMaterial(entry?.value ?? entry));
  }

  function calculateScores(data) {
    const planningContributions = [
      ["State heritage overlay", isDetected(data, "planning.heritage.state") ? 30 : 0],
      ["Local heritage overlay", isDetected(data, "planning.heritage.reference") ? 25 : 0],
      ["Pre-1911 overlay", isDetected(data, "planning.heritage.entry_date") ? 15 : 0],
      ["Dwelling-house character overlay", isDetected(data, "planning.character") ? 12 : 0],
    ];

    const hazardContributions = [
      ["Overland-flow records", floodGroupIsMaterial(data, "flood.fpa.overland_flow") ? 25 : 0],
      ["River or creek records", floodGroupIsMaterial(data, "flood.flag.overland_flow") ? 30 : 0],
      ["Storm-tide or coastal records", floodGroupIsMaterial(data, "flood.flag.large_allotment") ? 30 : 0],
      ["Bushfire overlay", isDetected(data, "constraint.bushfire") ? 25 : 0],
      ["Waterway corridor overlay", isDetected(data, "constraint.waterway_corridor") ? 15 : 0],
    ];

    const parcelCount = Number(metricById(data, "property.parcel_count")?.value || data.parcels?.length || 0);
    const parcelContributions = [
      ["Multiple parcels", parcelCount > 1 ? Math.min(30, (parcelCount - 1) * 15) : 0],
      ["Mapped easement intersection", isDetected(data, "constraint.mapped_secondary_interests") ? 35 : 0],
      ["Parcel area unresolved", isUnresolved(metricById(data, "property.parcel_area")) ? 15 : 0],
    ];

    const planning = clamp(planningContributions.reduce((sum, [, value]) => sum + value, 0));
    const hazard = clamp(hazardContributions.reduce((sum, [, value]) => sum + value, 0));
    const parcel = clamp(parcelContributions.reduce((sum, [, value]) => sum + value, 0));
    const unresolved = Number(data.summary?.unresolved || 0);
    const unknownPenalty = Math.min(25, unresolved * 7);
    const overall = clamp(Math.round((hazard * 0.42) + (planning * 0.33) + (parcel * 0.25) + unknownPenalty));
    const sourceConfidence = clamp(Number(data.summary?.coverage || 0));
    const assessmentBreadth = 40;

    const active = [...planningContributions, ...hazardContributions, ...parcelContributions]
      .filter(([, value]) => value > 0)
      .sort((a, b) => b[1] - a[1]);

    return {
      overall,
      planning,
      hazard,
      parcel,
      sourceConfidence,
      assessmentBreadth,
      unknownPenalty,
      active,
      band: overall < 20 ? "Few mapped flags" : overall < 40 ? "Some follow-up" : overall < 60 ? "Material complexity" : overall < 80 ? "High complexity" : "Major screening flags",
    };
  }

  function scoreCard(label, score, explanation) {
    return `
      <article class="prototype-score-card">
        <div class="prototype-score-card-head"><span>${label}</span><strong>${score}<small>/100</small></strong></div>
        <div class="prototype-score-track" aria-hidden="true"><i style="width:${score}%"></i></div>
        <p>${explanation}</p>
      </article>`;
  }

  function renderScores(data) {
    const reportPage = document.querySelector('[data-spa-page="report"]');
    const hero = reportPage?.querySelector(".report-hero");
    if (!reportPage || !hero) return;
    reportPage.querySelector(".prototype-scores-section")?.remove();

    const scores = calculateScores(data);
    data.prototype_scores = scores;
    const flags = scores.active.length
      ? scores.active.slice(0, 5).map(([label, value]) => `<li><span>${label}</span><b>+${value}</b></li>`).join("")
      : "<li><span>No weighted mapped flags detected in the currently connected datasets.</span><b>0</b></li>";

    const section = document.createElement("section");
    section.className = "prototype-scores-section";
    section.innerHTML = `
      <div class="container">
        <div class="prototype-score-heading">
          <div>
            <span class="prototype-label">Experimental screening model</span>
            <h2>Prototype property scores.</h2>
            <p>These scores convert the mapped public-data findings into an early screening view. They are not calibrated against purchase outcomes and are not a buying recommendation.</p>
          </div>
          <div class="prototype-overall-score">
            <span>Prototype Lemon Risk</span>
            <strong>${scores.overall}<small>/100</small></strong>
            <b>${scores.band}</b>
            <em>Higher means more mapped issues or unknowns need follow-up.</em>
          </div>
        </div>
        <div class="prototype-score-grid">
          ${scoreCard("Planning complexity", scores.planning, "Heritage, character and pre-1911 mapped controls.")}
          ${scoreCard("Hazard indicators", scores.hazard, "Flood, bushfire and waterway screening records.")}
          ${scoreCard("Parcel complexity", scores.parcel, "Multiple parcels, mapped easements and missing parcel facts.")}
          ${scoreCard("Source confidence", scores.sourceConfidence, "Share of displayed metrics returned from live configured sources.")}
          ${scoreCard("Assessment breadth", scores.assessmentBreadth, "Current prototype scope versus a complete purchase assessment.")}
        </div>
        <details class="prototype-score-method">
          <summary>How the prototype score is calculated</summary>
          <div class="prototype-score-method-grid">
            <div>
              <h3>Current weighted flags</h3>
              <ul>${flags}</ul>
              ${scores.unknownPenalty ? `<p class="prototype-unknown-penalty">Unresolved-source allowance: <b>+${scores.unknownPenalty}</b></p>` : ""}
            </div>
            <div>
              <h3>Current overall weighting</h3>
              <p><b>42%</b> hazard indicators · <b>33%</b> planning complexity · <b>25%</b> parcel complexity, plus an unresolved-source allowance.</p>
              <p>The model currently excludes building condition, pest, contract review, title search, valuation, insurance, body corporate, maintenance cost and buyer fit. Assessment breadth is therefore capped at 40/100.</p>
            </div>
          </div>
        </details>
      </div>`;
    hero.insertAdjacentElement("afterend", section);
  }

  function layerStyle(role) {
    const styles = {
      parcel: { color: "#087f5b", weight: 4, fillColor: "#34d399", fillOpacity: 0.16 },
      planning: { color: "#5b5bd6", weight: 2.5, fillColor: "#7c83ff", fillOpacity: 0.09, dashArray: "7 5" },
      heritage: { color: "#a53f67", weight: 2.5, fillColor: "#d66a96", fillOpacity: 0.10, dashArray: "4 4" },
      constraint: { color: "#a85b00", weight: 2.5, fillColor: "#f59e0b", fillOpacity: 0.10, dashArray: "8 5" },
    };
    return styles[role] || { color: "#475569", weight: 2, fillColor: "#94a3b8", fillOpacity: 0.08 };
  }

  function renderContextMap(data) {
    const oldMap = document.getElementById("property-map");
    const panel = document.querySelector(".report-map-panel");
    if (!oldMap || !panel) return;

    window.__propertyCheckLeafletMap?.remove();
    window.__propertyCheckLeafletMap = null;
    document.getElementById("leaflet-property-map")?.remove();
    panel.querySelector(".map-source-note")?.remove();

    if (!window.L) {
      oldMap.style.display = "block";
      panel.insertAdjacentHTML("beforeend", '<p class="map-source-note map-source-note-warning">Context map could not load. The original source-geometry view remains visible.</p>');
      return;
    }

    oldMap.style.display = "none";
    const mapElement = document.createElement("div");
    mapElement.id = "leaflet-property-map";
    mapElement.setAttribute("role", "img");
    mapElement.setAttribute("aria-label", `Context map for ${data.canonical_address}`);
    oldMap.insertAdjacentElement("afterend", mapElement);

    const map = window.L.map(mapElement, { zoomControl: true, scrollWheelZoom: false, preferCanvas: true });
    window.__propertyCheckLeafletMap = map;

    const street = window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });
    const satellite = window.L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19,
      attribution: "Imagery &copy; Esri and contributors",
    });
    street.addTo(map);

    const overlayControl = {};
    const propertyBounds = [];
    (data.map_layers || []).forEach((layer) => {
      if (!layer.geometry) return;
      const feature = { type: "Feature", properties: { label: layer.label }, geometry: layer.geometry };
      const rendered = window.L.geoJSON(feature, {
        style: () => layerStyle(layer.style_role),
        pointToLayer: (_feature, latlng) => window.L.circleMarker(latlng, { radius: 6, ...layerStyle(layer.style_role) }),
        onEachFeature: (_feature, leafletLayer) => leafletLayer.bindTooltip(layer.label || layer.category || "Mapped source geometry", { sticky: true }),
      });
      const key = `${layer.category}: ${layer.label}`;
      overlayControl[key] = rendered;
      if (layer.style_role === "parcel") {
        rendered.addTo(map);
        const bounds = rendered.getBounds?.();
        if (bounds?.isValid()) propertyBounds.push(bounds);
      }
    });

    if (Number.isFinite(data.latitude) && Number.isFinite(data.longitude)) {
      const marker = window.L.circleMarker([data.latitude, data.longitude], {
        radius: 7, color: "#ffffff", weight: 3, fillColor: "#062f2b", fillOpacity: 1,
      }).bindTooltip("Resolved address point");
      marker.addTo(map);
      overlayControl["Resolved address point"] = marker;
    }

    window.L.control.layers({ "Street map": street, "Satellite imagery": satellite }, overlayControl, { collapsed: false }).addTo(map);
    window.L.control.scale({ metric: true, imperial: false }).addTo(map);

    if (propertyBounds.length) {
      const combined = propertyBounds.reduce((bounds, next) => bounds.extend(next), propertyBounds[0]);
      map.fitBounds(combined.pad(0.22), { maxZoom: 18 });
    } else if (Number.isFinite(data.latitude) && Number.isFinite(data.longitude)) {
      map.setView([data.latitude, data.longitude], 17);
    } else {
      map.setView([-27.47, 153.03], 12);
    }

    panel.insertAdjacentHTML("beforeend", `
      <p class="map-source-note"><b>What you are seeing:</b> street or satellite imagery provides context only. Parcel and overlay outlines come from the official Queensland and Brisbane source geometries listed in the report. No listing photographs are used.</p>`);
    const heading = panel.querySelector(".panel-heading p");
    if (heading) heading.textContent = "Real map context with official parcel and overlay geometries. Switch between street and satellite views.";

    window.setTimeout(() => map.invalidateSize(), 100);
  }

  function enhance(data) {
    if (!data?.metrics?.length) return;
    renderScores(data);
    renderContextMap(data);
  }

  window.addEventListener("property-check:report-ready", (event) => enhance(event.detail));
  window.addEventListener("hashchange", () => window.setTimeout(() => enhance(window.PROPERTY_DATA), 250));
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => window.setTimeout(() => enhance(window.PROPERTY_DATA), 250));
  } else {
    window.setTimeout(() => enhance(window.PROPERTY_DATA), 250);
  }
})();
