(() => {
  "use strict";

  const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
  const metricById = (data, id) => (data.metrics || []).find((item) => item.metric_id === id);
  const isDetected = (data, id) => metricById(data, id)?.status === "detected";
  const isUnresolved = (item) => !item || item.status === "not_assessed" || item.source?.mode === "unavailable";
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);

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
      overall, planning, hazard, parcel, sourceConfidence, assessmentBreadth, unknownPenalty, active,
      band: overall < 20 ? "Few mapped flags" : overall < 40 ? "Some follow-up" : overall < 60 ? "Material complexity" : overall < 80 ? "High complexity" : "Major screening flags",
    };
  }

  function scoreCard(label, score, explanation) {
    return `<article class="prototype-score-card">
      <div class="prototype-score-card-head"><span>${label}</span><strong>${score}<small>/100</small></strong></div>
      <div class="prototype-score-track" aria-hidden="true"><i style="width:${score}%"></i></div><p>${explanation}</p>
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
      ? scores.active.slice(0, 5).map(([label, value]) => `<li><span>${escapeHtml(label)}</span><b>+${value}</b></li>`).join("")
      : "<li><span>No weighted mapped flags detected in the currently connected datasets.</span><b>0</b></li>";
    const section = document.createElement("section");
    section.className = "prototype-scores-section";
    section.innerHTML = `<div class="container">
      <div class="prototype-score-heading"><div><span class="prototype-label">Experimental screening model</span><h2>Prototype property scores.</h2>
      <p>These scores convert mapped public-data findings into an early screening view. They are not calibrated against purchase outcomes and are not a buying recommendation.</p></div>
      <div class="prototype-overall-score"><span>Prototype Lemon Risk</span><strong>${scores.overall}<small>/100</small></strong><b>${scores.band}</b><em>Higher means more mapped issues or unknowns need follow-up.</em></div></div>
      <div class="prototype-score-grid">
        ${scoreCard("Planning complexity", scores.planning, "Heritage, character and pre-1911 mapped controls.")}
        ${scoreCard("Hazard indicators", scores.hazard, "Flood, bushfire and waterway screening records.")}
        ${scoreCard("Parcel complexity", scores.parcel, "Multiple parcels, mapped easements and missing parcel facts.")}
        ${scoreCard("Source confidence", scores.sourceConfidence, "Share of displayed metrics returned from live configured sources.")}
        ${scoreCard("Assessment breadth", scores.assessmentBreadth, "Current prototype scope versus a complete purchase assessment.")}
      </div>
      <details class="prototype-score-method"><summary>How the prototype score is calculated</summary><div class="prototype-score-method-grid"><div><h3>Current weighted flags</h3><ul>${flags}</ul>
      ${scores.unknownPenalty ? `<p class="prototype-unknown-penalty">Unresolved-source allowance: <b>+${scores.unknownPenalty}</b></p>` : ""}</div>
      <div><h3>Current overall weighting</h3><p><b>42%</b> hazard indicators · <b>33%</b> planning complexity · <b>25%</b> parcel complexity, plus an unresolved-source allowance.</p>
      <p>The model currently excludes building condition, pest, contract review, title search, valuation, insurance, body corporate, maintenance cost and buyer fit. Assessment breadth is therefore capped at 40/100.</p></div></div></details>
    </div>`;
    hero.insertAdjacentElement("afterend", section);
  }

  const BASEMAPS = {
    street: {
      label: "Street map",
      attribution: 'Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
      tile: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
    },
    satellite: {
      label: "Satellite imagery",
      attribution: 'Imagery © <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a> and imagery contributors',
      tile: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
    },
  };

  const mapRuntime = { mode: "street", data: null, resizeObserver: null };
  const mercatorLatitude = (latitude) => clamp(Number(latitude), -85.05112878, 85.05112878);
  function worldPoint(longitude, latitude, zoom) {
    const scale = 256 * (2 ** zoom);
    const latRad = mercatorLatitude(latitude) * Math.PI / 180;
    return {
      x: ((Number(longitude) + 180) / 360) * scale,
      y: (1 - (Math.log(Math.tan(latRad) + (1 / Math.cos(latRad))) / Math.PI)) * 0.5 * scale,
    };
  }

  function collectGeometryPoints(geometry, output = []) {
    const collect = (value) => {
      if (!Array.isArray(value)) return;
      if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
        output.push([Number(value[0]), Number(value[1])]);
      } else value.forEach(collect);
    };
    collect(geometry?.coordinates);
    return output;
  }

  function geometryPaths(geometry) {
    if (!geometry) return [];
    if (geometry.type === "Polygon") return geometry.coordinates.map((ring) => ({ points: ring, closed: true }));
    if (geometry.type === "MultiPolygon") return geometry.coordinates.flatMap((polygon) => polygon.map((ring) => ({ points: ring, closed: true })));
    if (geometry.type === "LineString") return [{ points: geometry.coordinates, closed: false }];
    if (geometry.type === "MultiLineString") return geometry.coordinates.map((line) => ({ points: line, closed: false }));
    return [];
  }

  function mapView(data, width, height) {
    const parcelPoints = [];
    (data.map_layers || []).filter((layer) => layer.style_role === "parcel").forEach((layer) => collectGeometryPoints(layer.geometry, parcelPoints));
    const points = parcelPoints.length ? parcelPoints : [];
    if (!points.length) (data.map_layers || []).forEach((layer) => collectGeometryPoints(layer.geometry, points));
    if (Number.isFinite(data.longitude) && Number.isFinite(data.latitude)) points.push([data.longitude, data.latitude]);
    if (!points.length) points.push([153.03, -27.47]);
    for (let zoom = 19; zoom >= 12; zoom -= 1) {
      const world = points.map(([lon, lat]) => worldPoint(lon, lat, zoom));
      const xs = world.map((point) => point.x); const ys = world.map((point) => point.y);
      const spanX = Math.max(...xs) - Math.min(...xs); const spanY = Math.max(...ys) - Math.min(...ys);
      if (spanX <= width * 0.68 && spanY <= height * 0.68) {
        return { zoom, centerX: (Math.min(...xs) + Math.max(...xs)) / 2, centerY: (Math.min(...ys) + Math.max(...ys)) / 2 };
      }
    }
    const fallback = points.map(([lon, lat]) => worldPoint(lon, lat, 12));
    return { zoom: 12, centerX: fallback.reduce((sum, point) => sum + point.x, 0) / fallback.length, centerY: fallback.reduce((sum, point) => sum + point.y, 0) / fallback.length };
  }

  function pathStyle(role) {
    const styles = {
      parcel: { stroke: "#087f5b", width: 4, fill: "rgba(52,211,153,.18)", dash: "" },
      planning: { stroke: "#5656cb", width: 2.5, fill: "rgba(124,131,255,.10)", dash: "7 5" },
      heritage: { stroke: "#a53f67", width: 2.5, fill: "rgba(214,106,150,.11)", dash: "4 4" },
      constraint: { stroke: "#a85b00", width: 2.5, fill: "rgba(245,158,11,.12)", dash: "8 5" },
    };
    return styles[role] || { stroke: "#475569", width: 2, fill: "rgba(148,163,184,.10)", dash: "" };
  }

  function drawRasterContextMap(data, mode = mapRuntime.mode) {
    const mapElement = document.getElementById("context-property-map");
    if (!mapElement) return;
    mapRuntime.mode = mode;
    mapRuntime.data = data;
    const width = Math.max(320, mapElement.clientWidth || 720);
    const height = mapElement.clientHeight || (window.innerWidth < 600 ? 360 : 460);
    const view = mapView(data, width, height);
    const topLeft = { x: view.centerX - width / 2, y: view.centerY - height / 2 };
    const tileSize = 256;
    const firstX = Math.floor(topLeft.x / tileSize); const lastX = Math.floor((topLeft.x + width) / tileSize);
    const firstY = Math.floor(topLeft.y / tileSize); const lastY = Math.floor((topLeft.y + height) / tileSize);
    const tileCount = 2 ** view.zoom;
    const basemap = BASEMAPS[mode] || BASEMAPS.street;

    const tileLayer = document.createElement("div"); tileLayer.className = "context-map-tiles";
    for (let tileY = firstY; tileY <= lastY; tileY += 1) {
      if (tileY < 0 || tileY >= tileCount) continue;
      for (let tileX = firstX; tileX <= lastX; tileX += 1) {
        const wrappedX = ((tileX % tileCount) + tileCount) % tileCount;
        const image = document.createElement("img");
        image.className = "context-tile"; image.alt = ""; image.loading = "eager"; image.decoding = "async";
        image.src = basemap.tile(view.zoom, wrappedX, tileY);
        image.style.left = `${Math.round(tileX * tileSize - topLeft.x)}px`; image.style.top = `${Math.round(tileY * tileSize - topLeft.y)}px`;
        image.addEventListener("error", () => image.classList.add("context-tile-missing"));
        tileLayer.appendChild(image);
      }
    }

    const overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    overlay.setAttribute("class", "context-map-overlay"); overlay.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const selectedLayers = new Set([...mapElement.querySelectorAll('[data-context-layer]:checked')].map((input) => input.dataset.contextLayer));
    (data.map_layers || []).forEach((layer) => {
      if (selectedLayers.size && !selectedLayers.has(layer.layer_id)) return;
      const style = pathStyle(layer.style_role);
      geometryPaths(layer.geometry).forEach(({ points, closed }) => {
        const coordinates = points.map(([lon, lat]) => {
          const point = worldPoint(lon, lat, view.zoom);
          return [point.x - topLeft.x, point.y - topLeft.y];
        });
        if (!coordinates.length) return;
        const d = coordinates.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ") + (closed ? " Z" : "");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d); path.setAttribute("data-layer-id", layer.layer_id); path.setAttribute("stroke", style.stroke);
        path.setAttribute("stroke-width", String(style.width)); path.setAttribute("fill", closed ? style.fill : "none");
        path.setAttribute("vector-effect", "non-scaling-stroke"); if (style.dash) path.setAttribute("stroke-dasharray", style.dash);
        const title = document.createElementNS("http://www.w3.org/2000/svg", "title"); title.textContent = layer.label || layer.category || "Official mapped geometry";
        path.appendChild(title); overlay.appendChild(path);
      });
    });
    if (Number.isFinite(data.longitude) && Number.isFinite(data.latitude)) {
      const point = worldPoint(data.longitude, data.latitude, view.zoom);
      const marker = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      marker.setAttribute("cx", String(point.x - topLeft.x)); marker.setAttribute("cy", String(point.y - topLeft.y)); marker.setAttribute("r", "7"); marker.setAttribute("class", "context-address-marker");
      overlay.appendChild(marker);
    }

    let chrome = mapElement.querySelector(".context-map-chrome");
    if (!chrome) {
      chrome = document.createElement("div"); chrome.className = "context-map-chrome";
      chrome.innerHTML = `<div class="context-basemap-switch" aria-label="Basemap"><button type="button" data-basemap="street">Street</button><button type="button" data-basemap="satellite">Satellite</button></div><div class="context-layer-control"></div><div class="context-map-attribution"></div>`;
    }
    const layerControl = chrome.querySelector(".context-layer-control");
    if (!layerControl.dataset.ready) {
      layerControl.dataset.ready = "true";
      layerControl.innerHTML = `<strong>Official outlines</strong>${(data.map_layers || []).map((layer) => `<label><input type="checkbox" data-context-layer="${escapeHtml(layer.layer_id)}" ${layer.style_role === "parcel" ? "checked" : ""}><span style="--layer-colour:${pathStyle(layer.style_role).stroke}"></span>${escapeHtml(layer.label || layer.category)}</label>`).join("")}`;
      layerControl.addEventListener("change", () => drawRasterContextMap(data, mapRuntime.mode));
    }
    chrome.querySelectorAll("[data-basemap]").forEach((button) => {
      button.classList.toggle("active", button.dataset.basemap === mode);
      button.onclick = () => drawRasterContextMap(data, button.dataset.basemap);
    });
    chrome.querySelector(".context-map-attribution").innerHTML = `${basemap.attribution} · Official outlines: Queensland Government and Brisbane City Council`;
    mapElement.replaceChildren(tileLayer, overlay, chrome);
  }

  function renderContextMap(data) {
    const oldMap = document.getElementById("property-map");
    const panel = document.querySelector(".report-map-panel");
    if (!oldMap || !panel) return;
    document.getElementById("context-property-map")?.remove(); panel.querySelector(".map-source-note")?.remove();
    oldMap.style.display = "none";
    const mapElement = document.createElement("div"); mapElement.id = "context-property-map"; mapElement.setAttribute("role", "img"); mapElement.setAttribute("aria-label", `Context map for ${data.canonical_address}`);
    oldMap.insertAdjacentElement("afterend", mapElement);
    panel.insertAdjacentHTML("beforeend", `<p class="map-source-note"><b>Image sources:</b> Street context is from OpenStreetMap. Satellite context is Esri World Imagery. Parcel and overlay outlines come from the official Queensland and Brisbane geometries listed in the report. No listing photographs are used.</p>`);
    const heading = panel.querySelector(".panel-heading p"); if (heading) heading.textContent = "Real street or satellite context with official parcel and overlay geometries.";
    drawRasterContextMap(data, "street");
    mapRuntime.resizeObserver?.disconnect();
    mapRuntime.resizeObserver = new ResizeObserver(() => window.requestAnimationFrame(() => drawRasterContextMap(data, mapRuntime.mode)));
    mapRuntime.resizeObserver.observe(mapElement);
  }

  function enhance(data) {
    if (!data?.metrics?.length) return;
    renderScores(data); renderContextMap(data);
  }
  window.addEventListener("property-check:report-ready", (event) => enhance(event.detail));
  window.addEventListener("hashchange", () => window.setTimeout(() => enhance(window.PROPERTY_DATA), 250));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => window.setTimeout(() => enhance(window.PROPERTY_DATA), 250));
  else window.setTimeout(() => enhance(window.PROPERTY_DATA), 250);
})();