(() => {
  "use strict";

  const VERSION = "LC-MAP-v0.2.0";
  const BASEMAPS = {
    street: {
      tile: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
      attribution: 'Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
    },
    satellite: {
      tile: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
      attribution: 'Imagery © <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a> and contributors',
    },
  };
  let mode = "street";
  let selectedLayers = new Set();
  let resizeTimer = null;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);

  function visibleHost() {
    return [...document.querySelectorAll('[data-lcw-map-host]')].find((host) => {
      const panel = host.closest('[data-lcw-panel]');
      return panel && panel.classList.contains('is-active');
    }) || document.querySelector('[data-lcw-map-host]');
  }

  function worldPoint(longitude, latitude, zoom) {
    const scale = 256 * (2 ** zoom);
    const lat = clamp(Number(latitude), -85.05112878, 85.05112878) * Math.PI / 180;
    return {
      x: ((Number(longitude) + 180) / 360) * scale,
      y: (1 - (Math.log(Math.tan(lat) + (1 / Math.cos(lat))) / Math.PI)) * 0.5 * scale,
    };
  }

  function collectGeometryPoints(geometry, output = []) {
    const walk = (value) => {
      if (!Array.isArray(value)) return;
      if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) output.push([Number(value[0]), Number(value[1])]);
      else value.forEach(walk);
    };
    walk(geometry?.coordinates);
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
      if (spanX <= width * 0.72 && spanY <= height * 0.72) {
        return { zoom, centerX: (Math.min(...xs) + Math.max(...xs)) / 2, centerY: (Math.min(...ys) + Math.max(...ys)) / 2 };
      }
    }
    const fallback = points.map(([lon, lat]) => worldPoint(lon, lat, 12));
    return { zoom: 12, centerX: fallback.reduce((sum, point) => sum + point.x, 0) / fallback.length, centerY: fallback.reduce((sum, point) => sum + point.y, 0) / fallback.length };
  }

  function styleFor(role) {
    return {
      parcel: { stroke: "#118a63", width: 4, fill: "rgba(17,138,99,.14)", dash: "" },
      planning: { stroke: "#f3aa13", width: 2.4, fill: "rgba(243,170,19,.10)", dash: "7 5" },
      heritage: { stroke: "#8b5ad8", width: 2.4, fill: "rgba(139,90,216,.11)", dash: "4 4" },
      constraint: { stroke: "#e23d3d", width: 2.4, fill: "rgba(226,61,61,.10)", dash: "8 5" },
    }[role] || { stroke: "#64748b", width: 2, fill: "rgba(100,116,139,.10)", dash: "" };
  }

  function initialiseSelection(data) {
    if (selectedLayers.size) return;
    (data.map_layers || []).forEach((layer) => {
      if (layer.style_role === "parcel" || layer.visible_by_default) selectedLayers.add(layer.layer_id);
    });
  }

  function render() {
    if (!document.documentElement.classList.contains("lcw-active")) return;
    const data = window.PROPERTY_DATA;
    const host = visibleHost();
    if (!data?.property_id || !host) return;
    initialiseSelection(data);

    const width = Math.max(320, host.clientWidth || 720);
    const height = Math.max(220, host.clientHeight || (innerWidth < 760 ? 220 : 290));
    const view = mapView(data, width, height);
    const topLeft = { x: view.centerX - width / 2, y: view.centerY - height / 2 };
    const tileSize = 256;
    const firstX = Math.floor(topLeft.x / tileSize); const lastX = Math.floor((topLeft.x + width) / tileSize);
    const firstY = Math.floor(topLeft.y / tileSize); const lastY = Math.floor((topLeft.y + height) / tileSize);
    const tileCount = 2 ** view.zoom;
    const basemap = BASEMAPS[mode];

    const map = document.createElement("div");
    map.id = "context-property-map";
    map.dataset.mapVersion = VERSION;
    map.setAttribute("role", "img");
    map.setAttribute("aria-label", `Official context map for ${data.canonical_address}`);

    const tiles = document.createElement("div");
    tiles.className = "context-map-tiles";
    for (let tileY = firstY; tileY <= lastY; tileY += 1) {
      if (tileY < 0 || tileY >= tileCount) continue;
      for (let tileX = firstX; tileX <= lastX; tileX += 1) {
        const wrappedX = ((tileX % tileCount) + tileCount) % tileCount;
        const image = document.createElement("img");
        image.className = "context-tile";
        image.alt = "";
        image.loading = "eager";
        image.decoding = "async";
        image.src = basemap.tile(view.zoom, wrappedX, tileY);
        image.style.left = `${Math.round(tileX * tileSize - topLeft.x)}px`;
        image.style.top = `${Math.round(tileY * tileSize - topLeft.y)}px`;
        image.addEventListener("error", () => image.classList.add("context-tile-missing"));
        tiles.appendChild(image);
      }
    }

    const overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    overlay.setAttribute("class", "context-map-overlay");
    overlay.setAttribute("viewBox", `0 0 ${width} ${height}`);
    (data.map_layers || []).forEach((layer) => {
      if (!selectedLayers.has(layer.layer_id)) return;
      const style = styleFor(layer.style_role);
      geometryPaths(layer.geometry).forEach(({ points, closed }) => {
        const coordinates = points.map(([lon, lat]) => {
          const point = worldPoint(lon, lat, view.zoom);
          return [point.x - topLeft.x, point.y - topLeft.y];
        });
        if (!coordinates.length) return;
        const d = coordinates.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ") + (closed ? " Z" : "");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);
        path.setAttribute("data-layer-id", layer.layer_id);
        path.setAttribute("stroke", style.stroke);
        path.setAttribute("stroke-width", String(style.width));
        path.setAttribute("fill", closed ? style.fill : "none");
        path.setAttribute("vector-effect", "non-scaling-stroke");
        if (style.dash) path.setAttribute("stroke-dasharray", style.dash);
        const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
        title.textContent = layer.label || layer.category || "Official mapped geometry";
        path.appendChild(title);
        overlay.appendChild(path);
      });
    });
    if (Number.isFinite(data.longitude) && Number.isFinite(data.latitude)) {
      const point = worldPoint(data.longitude, data.latitude, view.zoom);
      const marker = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      marker.setAttribute("cx", String(point.x - topLeft.x));
      marker.setAttribute("cy", String(point.y - topLeft.y));
      marker.setAttribute("r", "7");
      marker.setAttribute("class", "context-address-marker");
      overlay.appendChild(marker);
    }

    const chrome = document.createElement("div");
    chrome.className = "context-map-chrome";
    chrome.innerHTML = `<div class="context-basemap-switch"><button type="button" data-basemap="street" class="${mode === "street" ? "active" : ""}">Street</button><button type="button" data-basemap="satellite" class="${mode === "satellite" ? "active" : ""}">Satellite</button></div><div class="context-layer-control"><strong>Map layers</strong>${(data.map_layers || []).map((layer) => `<label><input type="checkbox" data-layer-id="${escapeHtml(layer.layer_id)}" ${selectedLayers.has(layer.layer_id) ? "checked" : ""}><span style="--layer-colour:${styleFor(layer.style_role).stroke}"></span>${escapeHtml(layer.label || layer.category)}</label>`).join("")}</div><div class="context-map-attribution">${basemap.attribution} · Official outlines: Queensland Government and Brisbane City Council</div>`;
    chrome.querySelectorAll("[data-basemap]").forEach((button) => button.addEventListener("click", () => { mode = button.dataset.basemap; render(); }));
    chrome.querySelectorAll("[data-layer-id]").forEach((input) => input.addEventListener("change", () => {
      if (input.checked) selectedLayers.add(input.dataset.layerId); else selectedLayers.delete(input.dataset.layerId);
      render();
    }));

    map.append(tiles, overlay, chrome);
    host.replaceChildren(map);
  }

  window.addEventListener("lemoncheck:workspace-ready", () => setTimeout(render, 20));
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-lcw-view]")) setTimeout(render, 450);
  }, true);
  window.addEventListener("hashchange", () => setTimeout(render, 150));
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 120);
  });
  setInterval(() => {
    if (document.documentElement.classList.contains("lcw-active") && !visibleHost()?.querySelector("#context-property-map")) render();
  }, 700);
})();
