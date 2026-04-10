from pathlib import Path
import json

from flask import Flask, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_FILE = BASE_DIR / "data" / "emissions.json"
FRONTEND_DIR = BASE_DIR / "frontend"

app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")


def load_data():
    with DATA_FILE.open("r", encoding="utf-8") as file:
        return json.load(file)


def aqi_status(aqi):
    if aqi <= 100:
        return "Good"
    if aqi <= 200:
        return "Moderate"
    return "Poor"


def compliance_status(aqi):
    if aqi > 300:
        return "Violation"
    if aqi > 200:
        return "Warning"
    return "Compliant"


def recommendations(aqi):
    if aqi > 300:
        return ["Reduce emissions immediately", "Install high-efficiency filters", "Trigger compliance inspection"]
    if aqi > 200:
        return ["Reduce emissions", "Install filters", "Increase monitoring frequency"]
    if aqi > 100:
        return ["Optimize fuel usage", "Inspect filter performance"]
    return ["Maintain current controls"]


def predict_next_values(history, steps=3):
    if len(history) < 2:
        return [history[-1]] * steps

    changes = [history[i] - history[i - 1] for i in range(1, len(history))]
    avg_trend = sum(changes[-3:]) / min(3, len(changes))
    predictions = []
    next_value = history[-1]

    for _ in range(steps):
        next_value = round(next_value + avg_trend)
        predictions.append(max(0, next_value))

    return predictions


def has_anomaly(history):
    if len(history) < 2:
        return False
    latest_jump = history[-1] - history[-2]
    previous_changes = [abs(history[i] - history[i - 1]) for i in range(1, len(history) - 1)]
    baseline = (sum(previous_changes) / len(previous_changes)) if previous_changes else 0
    return latest_jump >= 40 or (baseline > 0 and latest_jump > baseline * 2.5)


def demo_seed(text):
    return sum(ord(char) for char in text) or 1


def generated_demo_area(location_name):
    seed = demo_seed(location_name)
    start = 65 + (seed % 120)
    trend = (seed % 9) - 2
    spike = 48 if seed % 5 == 0 else 0
    history = [max(35, start + (index * trend) + ((index % 3) * 3)) for index in range(6)]
    history.append(max(35, history[-1] + trend + spike + 6))

    return {
        "name": location_name,
        "zoneX": 12 + (seed % 76),
        "zoneY": 18 + ((seed * 7) % 64),
        "aqiHistory": history,
        "currentAqi": history[-1],
        "generated": True,
    }


def find_area(data, location_name):
    normalized = location_name.lower()
    exact = next(
        (item for item in data["residentialAreas"] if item["name"].lower() == normalized),
        None,
    )
    return exact or generated_demo_area(location_name)


@app.get("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.get("/api/monitoring")
def monitoring():
    location = request.args.get("location", "Residential Area").strip() or "Residential Area"
    data = load_data()
    area = find_area(data, location)

    history = area["aqiHistory"]
    current_aqi = area.get("currentAqi", history[-1])
    anomaly = has_anomaly(history)

    return jsonify(
        {
            "location": area,
            "industries": data["industries"],
            "currentAqi": current_aqi,
            "status": aqi_status(current_aqi),
            "compliance": compliance_status(current_aqi),
            "recommendations": recommendations(current_aqi),
            "prediction": predict_next_values(history),
            "anomaly": anomaly,
            "message": "Unusual pollution spike detected" if anomaly else "No unusual spike detected",
        }
    )


if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
