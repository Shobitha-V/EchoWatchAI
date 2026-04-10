from datetime import datetime, timedelta, timezone
import json
import math
import os
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from flask import Flask, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR
OPENWEATHER_KEY = os.getenv("OPENWEATHER_API_KEY", "").strip()

app = Flask(__name__, static_folder=None)

AQI_SCORE = {1: 50, 2: 100, 3: 150, 4: 250, 5: 350}
AQI_STATUS = {1: "Good", 2: "Fair", 3: "Moderate", 4: "Poor", 5: "Very Poor"}


def fetch_json(url, params=None, method="GET", payload=None, timeout=12):
    if params:
        url = f"{url}?{urlencode(params)}"
    data = None if payload is None else payload.encode("utf-8")
    request_obj = Request(url, data=data, method=method, headers={"User-Agent": "EcoWatchAI/1.0"})
    if payload is not None:
        request_obj.add_header("Content-Type", "application/x-www-form-urlencoded")
    with urlopen(request_obj, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def require_openweather_key():
    if not OPENWEATHER_KEY:
        raise RuntimeError("OPENWEATHER_API_KEY is not set. Set it before starting Flask.")


def geocode_location(location):
    require_openweather_key()
    normalized = location.lower()
    candidates = []
    if not any(token in normalized for token in ["mysore", "mysuru", "karnataka", "india"]):
        candidates.append(f"{location}, Mysore, Karnataka, India")
    candidates.append(location)

    for candidate in candidates:
        try:
            results = fetch_json(
                "https://api.openweathermap.org/geo/1.0/direct",
                {"q": candidate, "limit": 5, "appid": OPENWEATHER_KEY},
            )
        except Exception:
            continue
        mysore_match = next(
            (
                item for item in results
                if "karnataka" in str(item.get("state", "")).lower()
                or (11.9 <= float(item.get("lat", 0)) <= 12.7 and 76.2 <= float(item.get("lon", 0)) <= 77.0)
            ),
            None,
        )
        first = mysore_match or (results[0] if results else None)
        if first:
            pieces = [first.get("name"), first.get("state"), first.get("country")]
            return {"name": ", ".join([item for item in pieces if item]), "lat": first["lat"], "lon": first["lon"], "source": "OpenWeather Geocoding API"}
    raise RuntimeError(f"No real OpenWeather geocoding result found for '{location}'.")


def openweather_air_current(lat, lon):
    require_openweather_key()
    return fetch_json(
        "https://api.openweathermap.org/data/2.5/air_pollution",
        {"lat": lat, "lon": lon, "appid": OPENWEATHER_KEY},
    )


def openweather_air_forecast(lat, lon):
    require_openweather_key()
    return fetch_json(
        "https://api.openweathermap.org/data/2.5/air_pollution/forecast",
        {"lat": lat, "lon": lon, "appid": OPENWEATHER_KEY},
    )


def openweather_air_history(lat, lon):
    require_openweather_key()
    end = datetime.now(timezone.utc)
    start = end - timedelta(hours=24)
    return fetch_json(
        "https://api.openweathermap.org/data/2.5/air_pollution/history",
        {"lat": lat, "lon": lon, "start": int(start.timestamp()), "end": int(end.timestamp()), "appid": OPENWEATHER_KEY},
    )


def scaled_aqi(openweather_aqi):
    return AQI_SCORE.get(int(openweather_aqi), 0)


def aqi_status(openweather_aqi):
    return AQI_STATUS.get(int(openweather_aqi), "Unknown")


def compliance_status(aqi_score):
    if aqi_score > 300:
        return "Violation"
    if aqi_score > 200:
        return "Warning"
    return "Compliant"


def recommendations(aqi_score):
    if aqi_score > 300:
        return ["Reduce emissions immediately", "Install high-efficiency filters", "Start compliance inspection", "Restrict heavy industrial activity"]
    if aqi_score > 200:
        return ["Reduce emissions", "Install filters", "Increase monitoring frequency"]
    if aqi_score > 100:
        return ["Inspect filter performance", "Optimize fuel usage", "Monitor PM2.5 and NO2 closely"]
    return ["Maintain current controls", "Continue routine monitoring"]


def has_anomaly(values):
    if len(values) < 3:
        return False
    latest_jump = values[-1] - values[-2]
    previous = [abs(values[i] - values[i - 1]) for i in range(1, len(values) - 1)]
    baseline = sum(previous) / len(previous)
    return latest_jump >= 75 or (baseline > 0 and latest_jump > baseline * 2.5)


def pollution_level_from_tags(tags):
    text = " ".join(str(value).lower() for value in tags.values())
    high_words = ["cement", "chemical", "steel", "power", "foundry", "asphalt", "tyre", "tire"]
    medium_words = ["industrial", "works", "factory", "manufacturing", "warehouse"]
    if any(word in text for word in high_words):
        return "High"
    if any(word in text for word in medium_words):
        return "Medium"
    return "Low"


def distance_km(lat1, lon1, lat2, lon2):
    earth_radius_km = 6371
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    return earth_radius_km * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter",
]


def fetch_overpass(query, timeout=25):
    last_error = None
    for endpoint in OVERPASS_ENDPOINTS:
        try:
            return fetch_json(endpoint, method="POST", payload=f"data={query}", timeout=timeout)
        except Exception as error:
            last_error = error
    raise RuntimeError(f"All Overpass endpoints failed: {last_error}")


def overpass_places(lat=12.3051828, lon=76.6553609, radius=30000):
    query = f"""
    [out:json][timeout:18];
    (
      node(around:{radius},{lat},{lon})["place"~"^(city|town|suburb|neighbourhood|quarter|locality|village)$"]["name"];
      way(around:{radius},{lat},{lon})["place"~"^(city|town|suburb|neighbourhood|quarter|locality|village)$"]["name"];
      relation(around:{radius},{lat},{lon})["place"~"^(city|town|suburb|neighbourhood|quarter|locality|village)$"]["name"];
    );
    out center tags 250;
    """
    response = fetch_overpass(query, timeout=25)
    places = []
    seen = set()
    for element in response.get("elements", []):
        tags = element.get("tags", {})
        name = tags.get("name")
        if not name:
            continue
        center = element.get("center", {})
        item_lat = element.get("lat", center.get("lat"))
        item_lon = element.get("lon", center.get("lon"))
        if item_lat is None or item_lon is None:
            continue
        display_name = f"{name}, Mysore"
        key = display_name.lower()
        if key in seen:
            continue
        seen.add(key)
        places.append({"name": display_name, "lat": item_lat, "lon": item_lon, "source": "OpenStreetMap/Overpass"})
    places.sort(key=lambda item: item["name"].lower())
    return places


def overpass_industries(lat, lon, radius=7000):
    # Use a bounding box instead of a broad around() search; it is faster and still returns real OSM records.
    delta = min(max(radius / 111000, 0.08), 0.23)
    south = lat - delta
    north = lat + delta
    west = lon - delta
    east = lon + delta
    bbox = f"{south},{west},{north},{east}"
    query = f"""
    [out:json][timeout:20];
    (
      nwr["landuse"="industrial"]["name"]({bbox});
      nwr["man_made"="works"]["name"]({bbox});
      nwr["industrial"]["name"]({bbox});
      nwr["building"="industrial"]["name"]({bbox});
      nwr["factory"]["name"]({bbox});
    );
    out center tags 40;
    """
    response = fetch_overpass(query, timeout=22)
    industries = []
    seen = set()
    for element in response.get("elements", []):
        tags = element.get("tags", {})
        name = tags.get("name") or tags.get("operator")
        center = element.get("center", {})
        item_lat = element.get("lat", center.get("lat"))
        item_lon = element.get("lon", center.get("lon"))
        if not name or item_lat is None or item_lon is None:
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        distance = distance_km(lat, lon, item_lat, item_lon)
        if distance > radius / 1000:
            continue
        industries.append(
            {
                "name": name,
                "lat": item_lat,
                "lon": item_lon,
                "pollutionLevel": pollution_level_from_tags(tags),
                "contribution": "N/A",
                "distanceKm": round(distance, 2),
                "source": "OpenStreetMap/Overpass",
                "osmType": element.get("type"),
                "osmId": element.get("id"),
                "tags": {key: tags[key] for key in sorted(tags)[:8]},
            }
        )
    industries.sort(key=lambda item: item["distanceKm"])
    return industries[:12]


def build_air_payload(location):
    current = openweather_air_current(location["lat"], location["lon"])
    current_item = current["list"][0]
    current_openweather = current_item["main"]["aqi"]
    current_score = scaled_aqi(current_openweather)

    history_items = openweather_air_history(location["lat"], location["lon"]).get("list", [])[-7:]
    history = [scaled_aqi(item["main"]["aqi"]) for item in history_items]
    if not history:
        history = [current_score]

    forecast_items = openweather_air_forecast(location["lat"], location["lon"]).get("list", [])[:3]
    prediction = [scaled_aqi(item["main"]["aqi"]) for item in forecast_items]

    return {
        "location": location,
        "currentAqi": current_score,
        "openWeatherAqi": current_openweather,
        "status": aqi_status(current_openweather),
        "components": current_item.get("components", {}),
        "history": history,
        "prediction": prediction,
        "dataSource": "OpenWeather Air Pollution API",
    }


@app.get("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.get("/<path:path>")
def frontend_assets(path):
    if path in {"style.css", "script.js"}:
        return send_from_directory(FRONTEND_DIR, path)
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.get("/api/places")
def places():
    try:
        return jsonify({"places": overpass_places(), "source": "OpenStreetMap/Overpass"})
    except Exception as error:
        return jsonify({"error": str(error), "places": []}), 502


@app.get("/api/monitoring")
def monitoring():
    location_query = request.args.get("location", "Mysore, Karnataka, India").strip() or "Mysore, Karnataka, India"
    try:
        lat = request.args.get("lat", "").strip()
        lon = request.args.get("lon", "").strip()
        if lat and lon:
            location = {"name": location_query, "lat": float(lat), "lon": float(lon), "source": "OpenStreetMap/Overpass dropdown"}
        else:
            location = geocode_location(location_query)
        air = build_air_payload(location)
        industry_error = None
        try:
            industries = overpass_industries(location["lat"], location["lon"])
        except Exception as error:
            industries = []
            industry_error = str(error)
        history = air["history"]
        current_score = air["currentAqi"]
        anomaly = has_anomaly(history)
        return jsonify(
            {
                "location": location,
                "industries": industries,
                "currentAqi": current_score,
                "openWeatherAqi": air["openWeatherAqi"],
                "status": air["status"],
                "compliance": compliance_status(current_score),
                "components": air["components"],
                "history": history,
                "prediction": air["prediction"],
                "recommendations": recommendations(current_score),
                "anomaly": anomaly,
                "message": "Unusual pollution spike detected" if anomaly else "No unusual spike detected",
                "dataSource": air["dataSource"],
                "industrySource": "OpenStreetMap/Overpass" if industries else "Unavailable",
                "industryError": industry_error,
                "apiKeyConfigured": bool(OPENWEATHER_KEY),
                "note": "Industry contribution is N/A because OpenWeather/OSM do not provide measured source-apportionment data.",
            }
        )
    except Exception as error:
        return jsonify({"error": str(error), "apiKeyConfigured": bool(OPENWEATHER_KEY)}), 502


if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)










