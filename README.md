# EcoWatch AI - Real Mysore Data Only

EcoWatch AI now uses live/original data only. It does not show dummy AQI, dummy industries, or generated locations.

## Data Sources

- OpenWeather Geocoding API: converts a real Mysore city/locality input into coordinates.
- OpenWeather Air Pollution API: current AQI, pollutant components, recent history, and forecast values.
- OpenStreetMap Overpass API: dropdown Mysore places and nearby named mapped industrial features / industrial land-use records.
- Leaflet/OpenStreetMap tiles: real map display.

## Important Limitation

OpenWeather and OpenStreetMap do not provide measured industry-wise AQI contribution percentages. To keep the project original-data-only, the UI shows contribution as `N/A` instead of inventing fake percentages. Pollution category is inferred only from real OSM tags such as `industrial`, `landuse`, `man_made`, or names containing terms like cement/chemical/steel.

## Run

```powershell
cd "C:\Users\vsanj\OneDrive\Documents\EcoWatchAI"
.\.venv\Scripts\Activate.ps1
$env:OPENWEATHER_API_KEY="YOUR_OPENWEATHER_KEY_HERE"
python .\backend\app.py
```

Open:

```text
http://127.0.0.1:5000
```

The dropdown is loaded from OpenStreetMap/Overpass around Mysore. In the live test it returned 243 mapped place names. You can also type a real location manually, for example:

- Mysore, Karnataka, India
- Hebbal Industrial Area, Mysore
- Belavadi, Mysore
- Nanjangud, Karnataka
- Kuvempunagar, Mysore

If the API key or internet is missing, the dashboard displays an error instead of dummy data.


## Real Industry Records

Industries shown on the map/list come only from named OpenStreetMap/Overpass records near the selected location. The backend does not use a fallback industry list. If Overpass is unavailable or rate-limited, the app shows an unavailable message instead of fake industries.

## Location-Specific Industry Lookup

When the user selects a dropdown location, the frontend now sends that place's real OpenStreetMap latitude/longitude to `/api/monitoring`. The backend then searches named industrial OSM records around that exact coordinate, calculates distance in kilometers, sorts nearest first, and returns no fake/default industry fallback.
