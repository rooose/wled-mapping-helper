import json
import re
from pathlib import Path

import requests
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

# only positions.json lives here; the picture stays in the browser
DATA = Path(__file__).parent / "data"
DATA.mkdir(exist_ok=True)

HOST_RE = re.compile(r"[A-Za-z0-9._-]+(:\d+)?")


# ---------- the page ----------

@app.route("/")
def index():
    return render_template("index.html")


# ---------- saved positions ----------

@app.route("/api/positions", methods=["GET", "POST"])
def positions():
    path = DATA / "positions.json"
    if request.method == "POST":
        path.write_text(json.dumps(request.get_json(), indent=2))
        return jsonify(ok=True)
    if path.exists():
        return jsonify(json.loads(path.read_text()))
    return jsonify(None)


# ---------- WLED helpers ----------

def clean_ip(ip):
    ip = (ip or "").strip()
    if not HOST_RE.fullmatch(ip):
        raise ValueError("That doesn't look like an IP address or hostname")
    return ip


@app.route("/api/wled/info")
def wled_info():
    try:
        ip = clean_ip(request.args.get("ip"))
        r = requests.get(f"http://{ip}/json/info", timeout=3)
        r.raise_for_status()
        info = r.json()
        return jsonify(ok=True,
                       count=info["leds"]["count"],
                       version=info.get("ver"),
                       name=info.get("name"))
    except Exception as e:
        return jsonify(ok=False, error=str(e)), 502


@app.route("/api/wled/light", methods=["POST"])
def wled_light():
    """Light only LED `index` (white), everything else black."""
    try:
        body = request.get_json()
        ip = clean_ip(body["ip"])
        index = int(body["index"])
        count = int(body["count"])
        payload = {
            "on": True,
            "seg": [{"id": 0, "i": [0, count, "000000", index, "FFFFFF"]}],
        }
        r = requests.post(f"http://{ip}/json/state", json=payload, timeout=3)
        r.raise_for_status()
        return jsonify(ok=True)
    except Exception as e:
        return jsonify(ok=False, error=str(e)), 502


@app.route("/api/wled/restore", methods=["POST"])
def wled_restore():
    """Unfreeze the segment so WLED effects run again."""
    try:
        ip = clean_ip(request.get_json()["ip"])
        payload = {"seg": [{"id": 0, "frz": False}]}
        r = requests.post(f"http://{ip}/json/state", json=payload, timeout=3)
        r.raise_for_status()
        return jsonify(ok=True)
    except Exception as e:
        return jsonify(ok=False, error=str(e)), 502
