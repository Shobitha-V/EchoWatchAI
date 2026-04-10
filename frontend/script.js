const levelColors = {
  High: "#d9480f",
  Medium: "#f08c00",
  Low: "#2f9e44",
  User: "#14301f",
};

const fallbackRawData = {
  residentialAreas: [
    {
      name: "Residential Area",
      zoneX: 48,
      zoneY: 54,
      aqiHistory: [118, 126, 134, 143, 151, 168, 232],
      currentAqi: 232,
    },
    {
      name: "School Zone",
      zoneX: 18,
      zoneY: 62,
      aqiHistory: [74, 79, 83, 88, 91, 97, 104],
      currentAqi: 104,
    },
    {
      name: "Market Colony",
      zoneX: 62,
      zoneY: 46,
      aqiHistory: [142, 148, 153, 166, 181, 194, 207],
      currentAqi: 207,
    },
    {
      name: "Riverside Homes",
      zoneX: 30,
      zoneY: 28,
      aqiHistory: [58, 63, 61, 66, 72, 76, 82],
      currentAqi: 82,
    },
    {
      name: "Workers Township",
      zoneX: 80,
      zoneY: 72,
      aqiHistory: [210, 224, 238, 251, 279, 296, 318],
      currentAqi: 318,
    },
  ],
  industries: [
    { name: "North Steel Works", zoneX: 67, zoneY: 30, pollutionLevel: "High", contribution: 32 },
    { name: "GreenChem Processing", zoneX: 76, zoneY: 58, pollutionLevel: "Medium", contribution: 18 },
    { name: "Urban Cement Plant", zoneX: 36, zoneY: 72, pollutionLevel: "High", contribution: 28 },
    { name: "Lakeview Textile Mill", zoneX: 22, zoneY: 43, pollutionLevel: "Low", contribution: 8 },
    { name: "Metro Power Unit", zoneX: 50, zoneY: 20, pollutionLevel: "Medium", contribution: 14 },
    { name: "East Packaging Factory", zoneX: 58, zoneY: 78, pollutionLevel: "Low", contribution: 6 },
  ],
};

let map;
let mapLayer;
let mapNoteControl;
let aqiChart;

const form = document.querySelector("#locationForm");
const locationInput = document.querySelector("#locationInput");
const mapElement = document.querySelector("#map");
const chartCanvas = document.querySelector("#aqiChart");

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  }[char]));
}

function aqiStatus(aqi) {
  if (aqi <= 100) return "Good";
  if (aqi <= 200) return "Moderate";
  return "Poor";
}

function complianceStatus(aqi) {
  if (aqi > 300) return "Violation";
  if (aqi > 200) return "Warning";
  return "Compliant";
}

function recommendationsFor(aqi) {
  if (aqi > 300) return ["Reduce emissions immediately", "Install high-efficiency filters", "Trigger compliance inspection"];
  if (aqi > 200) return ["Reduce emissions", "Install filters", "Increase monitoring frequency"];
  if (aqi > 100) return ["Optimize fuel usage", "Inspect filter performance"];
  return ["Maintain current controls"];
}

function predictNextValues(history, steps = 3) {
  if (history.length < 2) return Array(steps).fill(history[0] || 0);
  const changes = history.slice(1).map((value, index) => value - history[index]);
  const recentChanges = changes.slice(-3);
  const averageTrend = recentChanges.reduce((sum, value) => sum + value, 0) / recentChanges.length;
  const predictions = [];
  let nextValue = history[history.length - 1];

  for (let i = 0; i < steps; i += 1) {
    nextValue = Math.max(0, Math.round(nextValue + averageTrend));
    predictions.push(nextValue);
  }

  return predictions;
}

function hasAnomaly(history) {
  if (history.length < 2) return false;
  const latestJump = history[history.length - 1] - history[history.length - 2];
  const previousChanges = history.slice(1, -1).map((value, index) => Math.abs(value - history[index]));
  const baseline = previousChanges.length
    ? previousChanges.reduce((sum, value) => sum + value, 0) / previousChanges.length
    : 0;
  return latestJump >= 40 || (baseline > 0 && latestJump > baseline * 2.5);
}

function normalizePoint(point) {
  return {
    ...point,
    zoneX: point.zoneX ?? 50,
    zoneY: point.zoneY ?? 50,
  };
}

function demoSeed(text) {
  return [...text].reduce((sum, char) => sum + char.charCodeAt(0), 0) || 1;
}

function generatedDemoArea(locationName) {
  const seed = demoSeed(locationName);
  const start = 65 + (seed % 120);
  const trend = (seed % 9) - 2;
  const spike = seed % 5 === 0 ? 48 : 0;
  const history = Array.from({ length: 6 }, (_, index) => Math.max(35, start + index * trend + (index % 3) * 3));
  history.push(Math.max(35, history[history.length - 1] + trend + spike + 6));

  return {
    name: locationName,
    zoneX: 12 + (seed % 76),
    zoneY: 18 + ((seed * 7) % 64),
    aqiHistory: history,
    currentAqi: history[history.length - 1],
    generated: true,
  };
}

function findArea(locationName) {
  return fallbackRawData.residentialAreas.find(
    (item) => item.name.toLowerCase() === locationName.toLowerCase()
  ) || generatedDemoArea(locationName);
}

function buildFallbackResponse(locationName) {
  const area = findArea(locationName);
  const currentAqi = area.currentAqi || area.aqiHistory[area.aqiHistory.length - 1];
  const anomaly = hasAnomaly(area.aqiHistory);

  return {
    location: area,
    industries: fallbackRawData.industries,
    currentAqi,
    status: aqiStatus(currentAqi),
    compliance: complianceStatus(currentAqi),
    recommendations: recommendationsFor(currentAqi),
    prediction: predictNextValues(area.aqiHistory),
    anomaly,
    message: anomaly ? "Unusual pollution spike detected" : "No unusual spike detected",
    dataSource: area.generated ? "generated fictional demo-world data" : "fictional demo-world data",
  };
}

function markerStyle(point) {
  const normalized = normalizePoint(point);
  return `left:${normalized.zoneX}%; top:${normalized.zoneY}%;`;
}

function zoneToLatLng(point) {
  const normalized = normalizePoint(point);
  const demoCenter = { lat: 12.9716, lng: 77.5946 };
  const scale = 0.0012;
  return [
    demoCenter.lat + (50 - normalized.zoneY) * scale,
    demoCenter.lng + (normalized.zoneX - 50) * scale,
  ];
}

function markerIcon(color, size = 24) {
  return L.divIcon({
    className: "demo-leaflet-marker",
    html: `<span style="background:${color}; width:${size}px; height:${size}px"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function initLeafletMap() {
  if (!window.L) return false;

  if (!map) {
    map = L.map("map", { scrollWheelZoom: true }).setView([12.9716, 77.5946], 13);
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

function renderFallbackMap(data) {
  const industryMarkers = data.industries.map((industry) => {
    const color = levelColors[industry.pollutionLevel];
    return `
      <button class="fallback-marker" style="${markerStyle(industry)} background:${color}" title="${escapeHtml(industry.name)}">
        <span>${escapeHtml(industry.name)}<br>${industry.pollutionLevel} | ${industry.contribution}% AQI</span>
      </button>
    `;
  }).join("");

  mapElement.innerHTML = `
    <div class="fallback-map" aria-label="Fictional industrial zone map">
      <div class="map-rings"></div>
      <div class="zone-label north">Factory Belt</div>
      <div class="zone-label center">Residential Area</div>
      <div class="zone-label south">Service Corridor</div>
      <button class="fallback-marker user-marker" style="${markerStyle(data.location)} background:${levelColors.User}" title="${escapeHtml(data.location.name)}">
        <span>${escapeHtml(data.location.name)}<br>AQI ${data.currentAqi}${data.location.generated ? "<br>Generated demo location" : ""}</span>
      </button>
      ${industryMarkers}
      <p class="fallback-map-note">Fictional demo-world map: marker positions use dummy x/y values, not real geography.</p>
    </div>
  `;
}

function renderMap(data) {
  if (!initLeafletMap()) {
    renderFallbackMap(data);
    return;
  }

  L.circle(zoneToLatLng(data.location), {
    radius: 12,
    color: "#14301f",
    weight: 2,
    fillColor: "#14301f",
    fillOpacity: 0.08,
  }).addTo(mapLayer);

  L.marker(zoneToLatLng(data.location), {
    icon: markerIcon(levelColors.User, 30),
  }).bindPopup(
    `<strong>${escapeHtml(data.location.name)}</strong><br>AQI: ${data.currentAqi}<br>Status: ${data.status}${data.location.generated ? "<br>Generated demo location" : ""}`
  ).addTo(mapLayer).openPopup();

  data.industries.forEach((industry) => {
    L.marker(zoneToLatLng(industry), {
      icon: markerIcon(levelColors[industry.pollutionLevel]),
    }).bindPopup(
      `<strong>${escapeHtml(industry.name)}</strong><br>${industry.pollutionLevel} pollution<br>Contribution: ${industry.contribution}% AQI`
    ).addTo(mapLayer);
  });

  if (mapNoteControl) {
    mapNoteControl.remove();
  }
  mapNoteControl = L.control({ position: "bottomleft" });
  mapNoteControl.onAdd = function mapNote() {
    const note = L.DomUtil.create("div", "leaflet-demo-note");
    note.textContent = "Real map view with dummy prototype emission data";
    return note;
  };
  mapNoteControl.addTo(map);

  map.setView(zoneToLatLng(data.location), 13);
  map.invalidateSize();
}

function renderMetrics(data) {
  document.querySelector("#currentAqi").textContent = data.currentAqi;
  document.querySelector("#aqiStatus").textContent = data.status;
  document.querySelector("#compliance").textContent = data.compliance;
  document.querySelector("#anomalyState").textContent = data.anomaly ? "Spike" : "Normal";
  document.querySelector("#anomalyMessage").textContent = data.message;
}

function renderIndustries(industries) {
  const list = document.querySelector("#industryList");
  list.innerHTML = industries.map((industry) => {
    const color = levelColors[industry.pollutionLevel];
    return `
      <article class="industry-card">
        <i class="dot" style="background:${color}"></i>
        <div>
          <h3>${escapeHtml(industry.name)}</h3>
          <p>${industry.pollutionLevel} pollution | Zone ${industry.zoneX}, ${industry.zoneY}</p>
        </div>
        <span class="pill" style="background:${color}">${industry.contribution}% AQI</span>
      </article>
    `;
  }).join("");
}

function renderRecommendations(recommendations) {
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
  const xStep = (width - padding * 2) / (allValues.length - 1);
  const yFor = (value) => height - padding - ((value - min) / (max - min || 1)) * (height - padding * 2);
  const xFor = (index) => padding + index * xStep;

  ctx.strokeStyle = "rgba(20, 48, 31, 0.18)";
  ctx.lineWidth = 1;
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

    values.forEach((value, index) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(xFor(index + offset), yFor(value), 4, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  drawLine(history, 0, "#14301f");
  drawLine([history[history.length - 1], ...predictions], history.length - 1, "#d9480f", true);

  ctx.fillStyle = "#627066";
  ctx.font = "12px Space Grotesk, sans-serif";
  labels.forEach((label, index) => {
    ctx.fillText(label.replace("Forecast", "F"), xFor(index) - 18, height - 14);
  });
  ctx.fillText(`AQI range ${Math.round(min)}-${Math.round(max)}`, padding, 18);
  ctx.fillStyle = "#14301f";
  ctx.fillText("Past AQI", width - 178, 18);
  ctx.fillStyle = "#d9480f";
  ctx.fillText("Predicted AQI", width - 100, 18);
}

function renderChart(data) {
  const history = data.location.aqiHistory;
  const predictions = data.prediction;
  const labels = [
    ...history.map((_, index) => `Past ${history.length - index - 1}`),
    ...predictions.map((_, index) => `Forecast ${index + 1}`),
  ];

  if (!window.Chart) {
    drawFallbackChart(labels, history, predictions);
    return;
  }

  const actualData = [...history, ...Array(predictions.length).fill(null)];
  const forecastData = [...Array(history.length - 1).fill(null), history[history.length - 1], ...predictions];

  if (aqiChart) {
    aqiChart.destroy();
  }

  aqiChart = new Chart(chartCanvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Past AQI",
          data: actualData,
          borderColor: "#14301f",
          backgroundColor: "rgba(20, 48, 31, 0.12)",
          fill: true,
          tension: 0.36,
          pointRadius: 4,
        },
        {
          label: "Predicted AQI",
          data: forecastData,
          borderColor: "#d9480f",
          backgroundColor: "rgba(217, 72, 15, 0.12)",
          borderDash: [8, 6],
          fill: false,
          tension: 0.36,
          pointRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { font: { family: "Space Grotesk" } } },
      },
      scales: {
        y: {
          beginAtZero: false,
          title: { display: true, text: "AQI" },
        },
      },
    },
  });
}

function renderDashboard(data) {
  renderMetrics(data);
  renderMap(data);
  renderIndustries(data.industries);
  renderRecommendations(data.recommendations);
  renderChart(data);
}

async function loadDashboard(location = "Residential Area") {
  try {
    const response = await fetch(`/api/monitoring?location=${encodeURIComponent(location)}`);
    if (!response.ok) throw new Error("API unavailable");
    const data = await response.json();
    renderDashboard(data);
  } catch (error) {
    renderDashboard(buildFallbackResponse(location));
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  loadDashboard(locationInput.value.trim() || "Residential Area");
});

loadDashboard();






