# Generate the six companion-state assets and the plugin icon.
# The character is one transparent raster; each state differs by recolouring the
# raster plus a small set of vector effects, so every state stays visually distinct.
from collections import deque
import base64
import io
import math
import os

from PIL import Image, ImageEnhance, ImageFilter

# Paths are resolved from this file's location, so the checkout can live anywhere.
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "artwork", "source", "whale-maid-source.jpg")
BUILD = os.path.join(ROOT, "artwork", "build")
ASSETS = os.path.join(ROOT, "assets")
os.makedirs(BUILD, exist_ok=True)
os.makedirs(ASSETS, exist_ok=True)

THR = 16
SIZE = 480          # rendered pixel size of one state asset
PAD = 14            # transparent margin inside the square board
BOARD = 240.0       # svg user units; the raster is embedded at this geometry

WHALE = {"tail": (0.86, 0.60), "belly": (0.97, 0.98), "eye": (0.30, 0.42), "blush": (0.74, 0.62)}


def cutout():
    im = Image.open(SRC).convert("RGB")
    w, h = im.size
    px = im.load()

    def is_white(p):
        r, g, b = p
        return r >= 255 - THR and g >= 255 - THR and b >= 255 - THR

    outside = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            i = y * w + x
            if not outside[i] and is_white(px[x, y]):
                outside[i] = 1
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            i = y * w + x
            if not outside[i] and is_white(px[x, y]):
                outside[i] = 1
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h:
                i = ny * w + nx
                if not outside[i] and is_white(px[nx, ny]):
                    outside[i] = 1
                    q.append((nx, ny))

    alpha = Image.new("L", (w, h), 255)
    ap = alpha.load()
    for y in range(h):
        for x in range(w):
            if outside[y * w + x]:
                ap[x, y] = 0
                continue
            edge = False
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and outside[ny * w + nx]:
                    edge = True
                    break
            if not edge:
                continue
            r, g, b = px[x, y]
            ap[x, y] = int(round(255 * min(1.0, (255 - min(r, g, b)) / 64.0)))

    alpha = alpha.filter(ImageFilter.GaussianBlur(0.6)).point(lambda v: 0 if v < 28 else (255 if v > 200 else v))
    alpha = keep_main_silhouette(alpha)
    art = im.convert("RGBA")
    art.putalpha(alpha)
    return art.crop(art.getbbox())


def keep_main_silhouette(alpha, threshold=40, grow=2):
    """Drop detached fragments (the source JPEG floats small blue hearts nearby)
    and keep only the character. A short dilation restores anti-aliased edges."""
    w, h = alpha.size
    solid = bytearray(1 if value >= threshold else 0 for value in alpha.tobytes())
    labels = [0] * (w * h)
    best_label, best_size, current = 0, 0, 0
    for start in range(w * h):
        if not solid[start] or labels[start]:
            continue
        current += 1
        labels[start] = current
        size = 0
        stack = [start]
        while stack:
            index = stack.pop()
            size += 1
            x, y = index % w, index // w
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    neighbour = ny * w + nx
                    if solid[neighbour] and not labels[neighbour]:
                        labels[neighbour] = current
                        stack.append(neighbour)
        if size > best_size:
            best_label, best_size = current, size

    keep = bytearray(labels[index] == best_label for index in range(w * h))
    for _ in range(grow):
        grown = bytearray(keep)
        for y in range(h):
            for x in range(w):
                index = y * w + x
                if keep[index]:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and keep[ny * w + nx]:
                        grown[index] = 1
                        break
        keep = grown

    mask = Image.frombytes("L", (w, h), bytes(255 if flag else 0 for flag in keep))
    mask = mask.filter(ImageFilter.MaxFilter(3))
    out = alpha.copy()
    out.paste(0, (0, 0), Image.eval(mask, lambda value: 255 - value))
    return out


def board_from(art):
    cw, ch = art.size
    scale = min((SIZE - 2 * PAD) / cw, (SIZE - 2 * PAD) / ch)
    nw, nh = max(1, int(round(cw * scale))), max(1, int(round(ch * scale)))
    resized = art.resize((nw, nh), Image.LANCZOS)
    board = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    board.paste(resized, ((SIZE - nw) // 2, (SIZE - nh) // 2), resized)
    return board


def recolour(board, saturation, brightness, contrast, tint=None, blur=0.0):
    rgb = board.convert("RGB")
    rgb = ImageEnhance.Color(rgb).enhance(saturation)
    rgb = ImageEnhance.Brightness(rgb).enhance(brightness)
    rgb = ImageEnhance.Contrast(rgb).enhance(contrast)
    if tint is not None:
        overlay = Image.new("RGB", rgb.size, tint)
        rgb = Image.blend(rgb, overlay, 0.22)
    if blur:
        rgb = rgb.filter(ImageFilter.GaussianBlur(blur))
    out = rgb.convert("RGBA")
    out.putalpha(board.getchannel("A"))
    return out


def data_uri(image):
    """Encode one state raster.

    The artwork is flat cel-shaded illustration, so a 256-colour palette with
    Floyd-Steinberg dithering is visually indistinguishable from full RGBA at widget
    size while being several times smaller; that keeps the embedded client bundle small.
    """
    palette = image.convert("RGBA").quantize(colors=256, method=Image.FASTOCTREE, dither=Image.FLOYDSTEINBERG)
    buffer = io.BytesIO()
    palette.save(buffer, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii"), buffer.tell()


def star(cx, cy, outer, inner, points=4, rotation=-90):
    coords = []
    for index in range(points * 2):
        radius = outer if index % 2 == 0 else inner
        angle = math.radians(rotation + index * 180.0 / points)
        coords.append("%.2f,%.2f" % (cx + radius * math.cos(angle), cy + radius * math.sin(angle)))
    return "M" + "L".join(coords) + "Z"


def z_glyph(cx, cy, height, width, skew):
    half_h, half_w = height / 2.0, width / 2.0
    top_left, top_right = cx - half_w + skew, cy - half_h
    bottom_left, bottom_right = cx - half_w, cy + half_h
    return (
        "M%.2f %.2fL%.2f %.2fL%.2f %.2fL%.2f %.2fL%.2f %.2fL%.2f %.2fZ"
        % (
            top_left, top_right,
            cx + half_w + skew, top_right,
            bottom_left, bottom_right,
            cx + half_w, bottom_right,
            top_left, top_right,
            top_left + skew, top_right,
        )
    )


def bubble(cx, cy, radius):
    dot = radius * 0.42
    out = []
    for index, factor in enumerate((0.42, 0.62, 0.86)):
        r = radius * factor
        x = cx - radius * 0.72 + index * radius * 0.72
        out.append('<circle cx="%.2f" cy="%.2f" r="%.2f" fill="#dbe6ff" opacity="0.95"/>' % (x, cy, dot))
    return "".join(out)


HEART = (
    "M0 3.2C0 1.4 1.5 0 3.3 0c1 0 2 .5 2.7 1.3C6.7.5 7.7 0 8.7 0 10.5 0 12 1.4 12 3.2c0 3.4-5.4 6.6-6 6.6s-6-3.2-6-6.6Z"
)

def hearts(entries, colour="#6f9bff"):
    """Small floating hearts; the source JPEG's own hearts are removed with the
    detached fragments, so they are redrawn here as clean vectors."""
    out = []
    for x, y, scale, opacity in entries:
        out.append(
            '<g transform="translate(%.2f %.2f) scale(%.2f)"><path d="%s" fill="%s" opacity="%.2f"/></g>'
            % (x, y, scale, HEART, colour, opacity)
        )
    return "".join(out)


STATES = {
    # name: (saturation, brightness, contrast, tint, blur, overlay svg, accent)
    "resting": (
        1.0, 1.0, 1.0, None, 0.0,
        hearts(((20, 78, 1.5, 0.85), (34, 108, 1.05, 0.6), (208, 104, 1.3, 0.7))),
        "#6f9bff",
    ),
    "working": (
        1.06, 1.05, 1.02, None, 0.0,
        # A soft halo plus an unmistakable badge: at widget size the difference from
        # resting has to survive scaling down to roughly 150 px.
        '<ellipse cx="120" cy="120" rx="104" ry="104" fill="#8fd0ff" opacity="0.10"/>'
        '<g>'
        + "".join(
            '<path d="%s" fill="#8fd0ff" opacity="%.2f"/>' % (star(x, y, r, r * 0.3, 4), o)
            for x, y, r, o in ((30, 70, 7.0, 0.95), (44, 122, 5.0, 0.8), (22, 156, 3.6, 0.6), (60, 42, 4.4, 0.75))
        )
        + "</g>"
        + '<g transform="translate(206 44)">'
        + '<circle r="17" fill="#f4f9ff" opacity="0.95" stroke="#5f9fe0" stroke-width="2"/>'
        + "".join(
            '<rect x="-2.2" y="-11" width="4.4" height="8" rx="1.4" fill="#2f4f7f" transform="rotate(%d)"/>' % (index * 45)
            for index in range(8)
        )
        + '<circle r="4.4" fill="#2f4f7f"/>'
        + "</g>",
        "#8fd0ff",
    ),
    "waiting": (
        0.9, 0.99, 0.98, None, 0.0,
        bubble(186, 60, 13),
        "#dbe6ff",
    ),
    "celebrate": (
        1.12, 1.08, 1.05, None, 0.0,
        '<g>'
        + "".join(
            '<path d="%s" fill="#ffd86b" opacity="%.2f"/>' % (star(x, y, r, r * 0.32, 5), o)
            for x, y, r, o in ((28, 52, 9.0, 1.0), (206, 44, 7.0, 0.9), (56, 30, 5.0, 0.8), (188, 168, 5.6, 0.75), (216, 96, 4.2, 0.6))
        )
        + "".join(
            '<circle cx="%.2f" cy="%.2f" r="%.2f" fill="%s" opacity="%.2f"/>' % (x, y, r, c, o)
            for x, y, r, c, o in ((40, 92, 3.0, "#8fd0ff", 0.9), (200, 70, 2.6, "#ff9ec4", 0.85), (70, 196, 3.4, "#ffd86b", 0.8), (164, 208, 2.4, "#8fd0ff", 0.7))
        )
        + "</g>",
        "#ffd86b",
    ),
    "sleeping": (
        0.72, 0.88, 0.97, (78, 96, 168), 0.25,
        '<g fill="#dbe9ff">'
        + '<path d="%s" opacity="0.95"/>' % z_glyph(198, 50, 26, 19, 4.8)
        + '<path d="%s" opacity="0.82"/>' % z_glyph(216, 80, 18, 13, 3.4)
        + '<path d="%s" opacity="0.62"/>' % z_glyph(186, 94, 12.5, 9.0, 2.3)
        + "</g>",
        "#dbe9ff",
    ),
    "error": (
        0.34, 0.92, 0.96, (150, 158, 176), 0.0,
        '<g>'
        '<circle cx="190" cy="52" r="16" fill="#f0f3f8" opacity="0.97" stroke="#8d99ae" stroke-width="2"/>'
        '<rect x="187.6" y="41.5" width="4.8" height="13" rx="2.4" fill="#5b6575"/>'
        '<circle cx="190" cy="60.5" r="2.7" fill="#5b6575"/>'
        "</g>",
        "#8d99ad",
    ),
}


def build_assets():
    art = cutout()
    board = board_from(art)
    board.convert("RGBA").save(os.path.join(BUILD, "base-480.png"))
    # 240px master keeps the offline preview and icon crisp at their own sizes.
    board.resize((240, 240), Image.LANCZOS).save(os.path.join(BUILD, "base-240.png"))

    report = []
    for name, (sat, bri, con, tint, blur, overlay, _accent) in STATES.items():
        state = recolour(board, sat, bri, con, tint, blur)
        uri, byte_count = data_uri(state)
        svg = (
            '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
            'viewBox="0 0 %g %g" width="%d" height="%d" role="img" aria-hidden="true">'
            '<image x="0" y="0" width="%g" height="%g" xlink:href="%s"/>%s</svg>'
            % (BOARD, BOARD, SIZE, SIZE, BOARD, BOARD, uri, overlay)
        )
        path = os.path.join(ASSETS, name + ".svg")
        with open(path, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(svg)
        report.append((name, os.path.getsize(path), byte_count))

    # Plugin-manager icon: a compact bust of the character on a brand disc. The
    # settings list draws it as small as 16 px, so the icon is a tight circular crop
    # with a light plate behind and the whale tail as a small brand mark.
    icon_board = recolour(board, 1.05, 1.07, 1.03)
    # board is the SIZE-sized master (480 px), so the head sits near (240, 140) and the
    # crop below is the head plus shoulders expressed in that same coordinate space.
    icon_crop = icon_board.crop((80, 16, 400, 256))
    icon_portrait = icon_crop.resize((260, 195), Image.LANCZOS)
    icon_uri, _ = data_uri(icon_portrait)
    icon = (
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        'viewBox="0 0 240 240" width="240" height="240" role="img" aria-label="Whale maid companion">'
        '<defs>'
        '<linearGradient id="disc" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0" stop-color="#f2f7ff"/><stop offset="1" stop-color="#c2d7ff"/>'
        "</linearGradient>"
        '<clipPath id="bust"><circle cx="120" cy="118" r="104"/></clipPath>'
        "</defs>"
        '<rect x="0" y="0" width="240" height="240" rx="54" fill="url(#disc)"/>'
        '<g clip-path="url(#bust)">'
        '<image x="-10" y="30" width="260" height="195" xlink:href="%s"/>'
        "</g>"
        '<circle cx="120" cy="118" r="104" fill="none" stroke="#ffffff" stroke-width="4" opacity="0.9"/>'
        '<g transform="translate(186 196) rotate(-14) scale(3.4)">'
        '<path d="%s" fill="#2b5fd9"/>'
        '<path d="M-1.1 3.6a3.4 3.4 0 0 1 6.8 0q0 .5-.2 1H-1q-.2-.5-.1-1Z" fill="#ffffff" opacity="0.92"/>'
        '<circle cx="3.6" cy="3.4" r="1.05" fill="#2b5fd9" opacity="0.9"/>'
        '<circle cx="6.2" cy="3.6" r="0.8" fill="#2b5fd9" opacity="0.75"/>'
        "</g></svg>"
    ) % (icon_uri, HEART)
    with open(os.path.join(ASSETS, "icon.svg"), "w", encoding="utf-8", newline="\n") as handle:
        handle.write(icon)

    for name, size, raw in report:
        print("asset %-10s svg=%7d bytes (raster %d)" % (name, size, raw))
    print("icon  %-10s svg=%7d bytes" % ("icon.svg", os.path.getsize(os.path.join(ASSETS, "icon.svg"))))


if __name__ == "__main__":
    build_assets()
