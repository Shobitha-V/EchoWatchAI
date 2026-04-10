<<<<<<< HEAD
﻿# EcoWatch AI - Industrial Emission Monitoring System

A simple Flask + HTML/CSS/JavaScript prototype that monitors dummy industrial emissions, calculates AQI status, predicts the next AQI values, detects spikes, and visualizes the result with Leaflet and Chart.js.

## Project Structure

```text
EcoWatchAI/
  backend/
    app.py
    requirements.txt
  data/
    emissions.json
  frontend/
    index.html
    style.css
    script.js
```

## Features

- Location input for `Residential Area`
- Fictional demo-world map with user location and nearby industries
- Pollution color coding: red high, orange medium, green low
- Dummy JSON dataset with 6 industries and 1 residential area
- Current AQI, Good/Moderate/Poor status, compliance warning/violation
- Industry list with pollution level and AQI contribution
- Chart.js graph for past AQI and next 3 predicted values
- Average-trend AQI prediction
- Sudden AQI spike detection
- AQI-based recommendations

## Setup

```powershell
cd "C:\Users\vsanj\OneDrive\Documents\EcoWatchAI"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r .\backend\requirements.txt
python .\backend\app.py
```

Open this URL in your browser:

```text
http://127.0.0.1:5000
```

## API

```text
GET /api/monitoring?location=Residential%20Area
```

The API returns location, industries, current AQI, status, compliance, recommendations, prediction, and anomaly message.

## If the dashboard looked empty

The frontend now has fallback demo data and fallback rendering. That means it can still display AQI values, industry details, a map-style marker view, recommendations, and a line graph even if Flask is not running or CDN scripts fail.

Best option: run with Flask so `/api/monitoring` is used.

Quick visual option: open `frontend/index.html` directly in a browser. The page will use local demo fallback data.

## Solution Mapping

1. User input

The location input is in `frontend/index.html`. It defaults to `Residential Area` and calls `loadDashboard()` in `frontend/script.js`.

2. Map visualization

The dashboard uses a self-contained fictional map-style panel. It does not use real-world latitude/longitude or OpenStreetMap tiles. Markers are placed with dummy zone coordinates from the JSON data. Marker colors are:

- Red: High pollution
- Orange: Medium pollution
- Green: Low pollution
- Dark green: User/residential location

3. Dummy dataset

The main dataset is `data/emissions.json` and contains:

- 1 residential area
- 6 industries
- Past AQI values
- Current AQI value
- Industry pollution levels
- AQI contribution percentages

The same fictional data is embedded in `frontend/script.js` as a fallback so the UI still works if the Flask API is not running.

4. AQI system

`backend/app.py` and `frontend/script.js` calculate:

- Current AQI
- Good / Moderate / Poor status
- Compliance / Warning / Violation status

Rules used:

- AQI <= 100: Good
- AQI <= 200: Moderate
- AQI > 200: Poor
- AQI > 200: Warning
- AQI > 300: Violation

5. Industry list

`frontend/script.js` renders every nearby industry with:

- Name
- Pollution level
- Contribution to AQI

6. Graph

The dashboard first tries Chart.js. If Chart.js is unavailable, it draws the line graph directly on the HTML canvas. The graph shows:

- Past AQI
- Predicted AQI for the next 3 values

7. AI logic

AQI prediction uses average recent trend logic:

- It calculates recent AQI changes
- Averages the last 3 changes
- Adds that trend forward for 3 forecast points

Anomaly detection checks for a sudden latest AQI jump. With the current dummy data, AQI jumps from 168 to 232, so the dashboard shows:

`Unusual pollution spike detected`

8. Recommendations

Recommendations change with AQI. Since the dummy current AQI is 232, the dashboard shows actions such as:

- Reduce emissions
- Install filters
- Increase monitoring frequency


## Multiple Dummy Locations

The app now supports these predefined fictional locations:

- Residential Area
- School Zone
- Market Colony
- Riverside Homes
- Workers Township

Users can also type any custom location name. If the typed name is not in the dummy dataset, the app generates a deterministic fictional demo location with its own dummy AQI history, current AQI, prediction, compliance status, anomaly result, and map position.

This is still a dummy-world prototype. It does not use real-world locations or real pollution data.

## Map Note

The dashboard uses Leaflet again for a better interactive map feel: zoom, pan, colored markers, and popups are available. It still uses fictional `zoneX` / `zoneY` dummy-world coordinates rather than real latitude/longitude or real map tiles.
=======
# EchoWatchAI
AI-based industrial emission monitoring system that analyzes AQI, detects pollution sources, predicts future air quality, and provides alerts using simulated environmental data.
>>>>>>> 9be4cf011b0d6de4f0bda8ba7731db657407bc79
