from flask import Flask, render_template, request

app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/place/image", methods=["POST"])
def place_image():
    file = request.files["image"]
    # later: save it under data/, then render the placement page
    return f"Got {file.filename}"


@app.route("/place/grid")
def place_grid():
    w = int(request.args["w"])
    h = int(request.args["h"])
    cell = int(request.args["cell"])
    return f"Grid {w}x{h}, cell {cell}px"