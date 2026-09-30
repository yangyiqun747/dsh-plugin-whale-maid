# Render each state asset as a flat PNG for visual review.
# The character raster comes out of the SVG itself; the small vector effects
# (hearts, stars, gear, bubble, Z marks, badge) are redrawn here so the review sheet
# matches what the browser composites. The scanned markup is exactly what
# tools/make-assets.py emits: path, circle, ellipse, rect, and translate/scale/rotate
# groups around them.
import base64
import io
import math
import os
import re

from PIL import Image, ImageDraw

# Paths are resolved from this file's location, so the checkout can live anywhere.
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ASSETS = os.path.join(ROOT, "assets")
BUILD = os.path.join(ROOT, "artwork", "build")
NAMES = ["resting", "working", "waiting", "celebrate", "sleeping", "error"]
CELL = 240
COLS = 3
SCALE = 4  # supersample so the vector edges stay smooth at 240 px


def colour(value):
    value = value.strip()
    if value.startswith("#"):
        value = value[1:]
        if len(value) == 3:
            value = "".join(ch * 2 for ch in value)
        return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4)) + (255,)
    return (255, 0, 255, 255)


def with_alpha(rgba, fraction):
    return (rgba[0], rgba[1], rgba[2], int(round(rgba[3] * fraction)))


def attributes(text):
    return {key: value for key, value in re.findall(r'([\w:-]+)\s*=\s*"([^"]*)"', text)}


def points_of(d):
    """Parse the M/L/Z polygon commands used by every effect in these assets."""
    tokens = re.findall(r"[MLZmlz]|-?\d+\.?\d*", d)
    points, current, command, index = [], (0.0, 0.0), None, 0
    while index < len(tokens):
        token = tokens[index]
        if token in "MLZmlz":
            command = token
            index += 1
            continue
        x, y = float(tokens[index]), float(tokens[index + 1])
        index += 2
        if command in ("m", "l"):
            x, y = current[0] + x, current[1] + y
        current = (x, y)
        points.append((x, y))
    return points


def transform_of(text):
    """Return (translate, scale) for one <g transform=...>."""
    translate = (0.0, 0.0)
    scale = 1.0
    for name, value in re.findall(r'(translate|scale)\(([^)]*)\)', text):
        numbers = [float(part) for part in value.replace(",", " ").split()]
        if name == "translate":
            translate = (numbers[0], numbers[1] if len(numbers) > 1 else 0.0)
        elif name == "scale":
            scale = numbers[0]
    return translate[0], translate[1], scale


def rotation_of(text):
    found = re.search(r'rotate\(([-\d.]+)\)', text)
    return float(found.group(1)) if found else 0.0


def draw_leaf(draw, tag, attrs, to_device, inherited):
    """Draw one leaf; SVG paint and opacity inherit from the enclosing <g>."""
    fill = colour(attrs.get("fill") or inherited.get("fill") or "#000000")
    alpha = float(attrs.get("opacity", 1.0)) * float(inherited.get("opacity", 1.0))
    if tag == "path":
        draw.polygon([to_device(x, y) for x, y in points_of(attrs.get("d", ""))], fill=with_alpha(fill, alpha))
    elif tag == "circle":
        cx, cy = to_device(float(attrs.get("cx", 0)), float(attrs.get("cy", 0)))
        r = float(attrs["r"]) * to_device.length
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=with_alpha(fill, alpha))
    elif tag == "ellipse":
        cx, cy = to_device(float(attrs.get("cx", 0)), float(attrs.get("cy", 0)))
        rx, ry = float(attrs["rx"]) * to_device.length, float(attrs["ry"]) * to_device.length
        draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=with_alpha(fill, alpha))
    elif tag == "rect":
        x, y = float(attrs.get("x", 0)), float(attrs.get("y", 0))
        w, h = float(attrs["width"]), float(attrs["height"])
        corners = [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]
        draw.polygon([to_device(px, py) for px, py in corners], fill=with_alpha(fill, alpha))


def render(name):
    with open(os.path.join(ASSETS, name + ".svg"), "r", encoding="utf-8") as handle:
        svg = handle.read()
    raster = re.search(r'xlink:href="data:image/png;base64,([^"]+)"', svg)
    image = Image.open(io.BytesIO(base64.b64decode(raster.group(1)))).convert("RGBA")
    image = image.resize((CELL * SCALE, CELL * SCALE), Image.LANCZOS)
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")

    image_tag = re.search(r'<image [^>]*/>', svg)
    body = svg[image_tag.end(): svg.rindex("</svg>")]

    # Walk the markup with an explicit transform + paint stack: each <g> records the
    # mapping from local user units to the device grid and the paint its children inherit.
    stack = [{"tx": 0.0, "ty": 0.0, "scale": 1.0, "rotation": 0.0, "fill": None, "opacity": 1.0}]
    for match in re.finditer(r'<(/?)([a-zA-Z][\w:-]*)((?:[^>"]|"[^"]*")*?)(/?)>', body):
        closing, tag, raw, self_closing = match.group(1), match.group(2), match.group(3), match.group(4)
        attrs = attributes(raw)
        if tag == "g":
            if closing:
                if len(stack) > 1:
                    stack.pop()
                continue
            tx, ty, scale = transform_of(attrs.get("transform", ""))
            parent = stack[-1]
            combined = {
                "tx": parent["tx"] + tx * parent["scale"],
                "ty": parent["ty"] + ty * parent["scale"],
                "scale": parent["scale"] * scale,
                "rotation": parent["rotation"] + rotation_of(attrs.get("transform", "")),
                "fill": attrs.get("fill") or parent["fill"],
                "opacity": float(attrs.get("opacity", 1.0)) * parent["opacity"],
            }
            if not self_closing:
                stack.append(combined)
            continue
        if closing or tag not in ("path", "circle", "ellipse", "rect"):
            continue
        current = stack[-1]

        def make_device(tx=current["tx"], ty=current["ty"], scale=current["scale"], rotation=current["rotation"]):
            angle = math.radians(rotation)
            cos_a, sin_a = math.cos(angle), math.sin(angle)

            def to_device(x, y):
                rx, ry = x * cos_a - y * sin_a, x * sin_a + y * cos_a
                return (tx + rx * scale) * SCALE, (ty + ry * scale) * SCALE
            to_device.length = scale * SCALE
            return to_device

        draw_leaf(draw, tag, attrs, make_device(), current)

    return Image.alpha_composite(image, overlay).resize((CELL, CELL), Image.LANCZOS)


sheet = Image.new("RGB", (CELL * COLS, CELL * 2), (247, 248, 250))
for index, name in enumerate(NAMES):
    art = render(name)
    tile = Image.new("RGB", (CELL, CELL), (247, 248, 250))
    tile.paste(art, (0, 0), art)
    sheet.paste(tile, ((index % COLS) * CELL, (index // COLS) * CELL))
sheet.save(os.path.join(BUILD, "states-with-effects.png"))
print("wrote", os.path.join(BUILD, "states-with-effects.png"))
