const levelColors = {
  High: "#d9480f",
  Medium: "#f08c00",
  Low: "#2f9e44",
  User: "#14301f",
};

let map;
let mapLayer;
let mapNoteControl;
let aqiChart;
const placeLookup = new Map();

const form = document.querySelector("#locationForm");
const locationInput = document.querySelector("#locationInput");
const mapElement = document.querySelector("#map");
const chartCanvas = document.querySelector("#aqiChart");
const locationOptions = document.querySelector("#locationOptions");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  }[char]));
}

function markerIcon(color, size = 24) {
  return L.divIcon({
    className: "demo-leaflet-marker",
    html: `<span style="background:${color}; width:${size}px; height:${size}px"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function showError(errorMessage) {
  document.querySelector("#currentAqi").textContent = "--";
  document.querySelector("#aqiStatus").textContent = "Live data unavailable";
  document.querySelector("#compliance").textContent = "--";
  document.querySelector("#anomalyState").textContent = "Error";
  document.querySelector("#anomalyMessage").textContent = errorMessage;
  document.querySelector("#dataSource").textContent = "No dummy data shown. Configure the OpenWeather key and keep internet access enabled.";
  document.querySelector("#industryList").innerHTML = `<p class="empty-state">No real industry data loaded.</p>`;
  document.querySelector("#pollutants").innerHTML = "";
  document.querySelector("#recommendations").innerHTML = "";
  if (aqiChart) {
    aqiChart.destroy();
    aqiChart = null;
  }
}

function initLeafletMap(data) {
  if (!window.L) return false;

  const center = [data.location.lat, data.location.lon];
  if (!map) {
    map = L.map("map", { scrollWheelZoom: true }).setView(center, 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
  }

  if (mapLayer) {
    mapLayer.remove();
  }
  mapLayer = L.layerGroup().addTo(map);
  return true;
}

function renderMap(data) {
  if (!initLeafletMap(data)) {
    showError("Leaflet could not load. Check internet access for map scripts.");
    return;
  }

  const center = [data.location.lat, data.location.lon];
  L.circle(center, {
    radius: 1800,
    color: "#14301f",
    weight: 2,
    fillColor: "#14301f",
    fillOpacity: 0.08,
  }).addTo(mapLayer);

  L.marker(center, { icon: markerIcon(levelColors.User, 30) })
    .bindPopup(`<strong>${escapeHtml(data.location.name)}</strong><br>AQI: ${data.currentAqi}<br>Status: ${data.status}<br>OpenWeather scale: ${data.openWeatherAqi}/5`)
    .addTo(mapLayer)
    .openPopup();

  (data.industries || []).forEach((industry) => {
    if (!industry.lat || !industry.lon) return;
    const color = levelColors[industry.pollutionLevel] || levelColors.Low;
    L.marker([industry.lat, industry.lon], { icon: markerIcon(color) })
      .bindPopup(`<strong>${escapeHtml(industry.name)}</strong><br>${industry.pollutionLevel} mapped pollution category<br>Contribution: ${escapeHtml(industry.contribution)}<br>Source: ${escapeHtml(industry.source)}<br>OSM: ${escapeHtml(industry.osmType || "")} ${escapeHtml(industry.osmId || "")}`)
      .addTo(mapLayer);
  });

  if (mapNoteControl) {
    mapNoteControl.remove();
  }
  mapNoteControl = L.control({ position: "bottomleft" });
  mapNoteControl.onAdd = function mapNote() {
    const note = L.DomUtil.create("div", "leaflet-demo-note");
    note.textContent = "Leaflet + OpenStreetMap view; AQI from OpenWeather when configured";
    return note;
  };
  mapNoteControl.addTo(map);

  map.setView(center, 12);
  map.invalidateSize();
}

function selectedPlaceCoordinates(location) {
  return placeLookup.get(location.trim().toLowerCase());
}

function monitoringUrl(location) {
  const params = new URLSearchParams({ location });
  const coordinates = selectedPlaceCoordinates(location);
  if (coordinates) {
    params.set("lat", coordinates.lat);
    params.set("lon", coordinates.lon);
  }
  return `/api/monitoring?${params.toString()}`;
}

function renderMetrics(data) {
  document.querySelector("#currentAqi").textContent = data.currentAqi;
  document.querySelector("#aqiStatus").textContent = `${data.status} | OpenWeather AQI ${data.openWeatherAqi}/5`;
  document.querySelector("#compliance").textContent = data.compliance;
  document.querySelector("#anomalyState").textContent = data.anomaly ? "Spike" : "Normal";
  document.querySelector("#anomalyMessage").textContent = data.message;
  document.querySelector("#dataSource").textContent = `Air data: ${data.dataSource}. Industries: ${data.industrySource}${data.industryError ? ` (${data.industryError})` : ""}. API key configured: ${data.apiKeyConfigured ? "Yes" : "No"}.`;
}

function renderIndustries(industries = []) {
  const list = document.querySelector("#industryList");
  if (!industries.length) {
    list.innerHTML = `<p class="empty-state">No real mapped industries returned for this location right now.</p>`;
    return;
  }
  list.innerHTML = industries.map((industry) => {
    const color = levelColors[industry.pollutionLevel] || levelColors.Low;
    return `
      <article class="industry-card">
        <i class="dot" style="background:${color}"></i>
        <div>
          <h3>${escapeHtml(industry.name)}</h3>
          <p>${industry.pollutionLevel} mapped OSM category | ${Number(industry.distanceKm).toFixed(2)} km away | ${Number(industry.lat).toFixed(3)}, ${Number(industry.lon).toFixed(3)}</p>
        </div>
        <span class="pill" style="background:${color}">${escapeHtml(industry.contribution)}</span>
      </article>
    `;
  }).join("");
}

function renderPollutants(components = {}) {
  const labels = ["pm2_5", "pm10", "no2", "so2", "co", "o3"];
  document.querySelector("#pollutants").innerHTML = labels.map((key) => {
    const value = components[key];
    return `<span class="pollutant-chip"><b>${key.toUpperCase()}</b>${value === undefined ? "--" : Number(value).toFixed(1)}</span>`;
  }).join("");
}

function renderRecommendations(recommendations = []) {
  document.querySelector("#recommendations").innerHTML = recommendations
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
}

function drawFallbackChart(labels, history, predictions) {
  const ctx = chartCanvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const width = chartCanvas.clientWidth || 720;
  const height = 300;
  chartCanvas.width = width * dpr;
  chartCanvas.height = height * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const padding = 42;
  const allValues = [...history, ...predictions];
  const min = Math.min(...allValues) - 20;
  const max = Math.max(...allValues) + 20;
  const xStep = (width - padding * 2) / Math.max(1, allValues.length - 1);
  const yFor = (value) => height - padding - ((value - min) / (max - min || 1)) * (height - padding * 2);
  const xFor = (index) => padding + index * xStep;

  ctx.strokeStyle = "rgba(20, 48, 31, 0.18)";
  for (let i = 0; i < 5; i += 1) {
    const y = padding + i * ((height - padding * 2) / 4);
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  function drawLine(values, offset, color, dashed = false) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.setLineDash(dashed ? [8, 6] : []);
    ctx.beginPath();
    values.forEach((value, index) => {
      const x = xFor(index + offset);
      const y = yFor(value);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawLine(history, 0, "#14301f");
  drawLine([history[history.length - 1], ...predictions], Math.max(0, history.length - 1), "#d9480f", true);
  ctx.fillStyle = "#627066";
  ctx.font = "12px Space Grotesk, sans-serif";
  labels.forEach((label, index) => ctx.fillText(label.replace("Forecast", "F"), xFor(index) - 18, height - 14));
}

function renderChart(data) {
  const history = data.history || [];
  const predictions = data.prediction || [];
  const labels = [
    ...history.map((_, index) => `Past ${history.length - index - 1}`),
    ...predictions.map((_, index) => `Forecast ${index + 1}`),
  ];

  if (!window.Chart) {
    drawFallbackChart(labels, history, predictions);
    return;
  }

  const actualData = [...history, ...Array(predictions.length).fill(null)];
  const forecastData = [...Array(Math.max(0, history.length - 1)).fill(null), history[history.length - 1], ...predictions];

  if (aqiChart) aqiChart.destroy();
  aqiChart = new Chart(chartCanvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Recent AQI", data: actualData, borderColor: "#14301f", backgroundColor: "rgba(20, 48, 31, 0.12)", fill: true, tension: 0.36, pointRadius: 4 },
        { label: "Forecast AQI", data: forecastData, borderColor: "#d9480f", backgroundColor: "rgba(217, 72, 15, 0.12)", borderDash: [8, 6], fill: false, tension: 0.36, pointRadius: 4 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { font: { family: "Space Grotesk" } } } },
      scales: { y: { beginAtZero: true, title: { display: true, text: "AQI score" } } },
    },
  });
}

function renderDashboard(data) {
  renderMetrics(data);
  renderMap(data);
  renderIndustries(data.industries);
  renderPollutants(data.components);
  renderRecommendations(data.recommendations);
  renderChart(data);
}

async function loadDashboard(location = "Mysore, Karnataka, India") {
  try {
    const response = await fetch(monitoringUrl(location));
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Real API data unavailable");
    renderDashboard(payload);
  } catch (error) {
    showError(error.message);
  }
}

async function loadPlaceOptions() {
  try {
    const response = await fetch("/api/places");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Places unavailable");
    const unique = new Map();
    placeLookup.clear();
    unique.set("mysore, karnataka, india", "Mysore, Karnataka, India");
    placeLookup.set("mysore, karnataka, india", { lat: "12.3051828", lon: "76.6553609" });
    payload.places.forEach((place) => {
      if (!place.name || place.lat === undefined || place.lon === undefined) return;
      const key = place.name.toLowerCase();
      unique.set(key, place.name);
      placeLookup.set(key, { lat: String(place.lat), lon: String(place.lon) });
    });
    locationOptions.innerHTML = [...unique.values()]
      .map((name) => `<option value="${escapeHtml(name)}"></option>`)
      .join("");
  } catch (error) {
    locationOptions.innerHTML = `<option value="Mysore, Karnataka, India"></option>`;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  loadDashboard(locationInput.value.trim() || "Mysore, Karnataka, India");
});

loadPlaceOptions();
loadDashboard();





