# Build the transparent character cut-out used by every plugin asset.
# The white background is removed by flooding from the border, then edges are
# softened so the anti-aliased outline keeps its own alpha instead of a halo.
from collections import deque
from PIL import Image, ImageFilter
import os

# Paths are resolved from this file's location, so the checkout can live anywhere.
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "artwork", "source", "whale-maid-source.jpg")
OUT = os.path.join(ROOT, "artwork", "build")
os.makedirs(OUT, exist_ok=True)

THR = 16          # per-channel distance from pure white that still counts as background
EDGE_BAND = 1.15  # how far a soft edge may bleed, in pixels
CANVAS = 240      # square art board shared by all six states
PAD = 6           # transparent margin kept around the character

im = Image.open(SRC).convert("RGB")
W, H = im.size
px = im.load()


def is_white(p):
    r, g, b = p
    return r >= 255 - THR and g >= 255 - THR and b >= 255 - THR


# --- border flood: everything reachable from outside through white pixels ---
outside = bytearray(W * H)
q = deque()
for x in range(W):
    for y in (0, H - 1):
        i = y * W + x
        if not outside[i] and is_white(px[x, y]):
            outside[i] = 1
            q.append((x, y))
for y in range(H):
    for x in (0, W - 1):
        i = y * W + x
        if not outside[i] and is_white(px[x, y]):
            outside[i] = 1
            q.append((x, y))
while q:
    x, y = q.popleft()
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nx, ny = x + dx, y + dy
        if 0 <= nx < W and 0 <= ny < H:
            i = ny * W + nx
            if not outside[i] and is_white(px[nx, ny]):
                outside[i] = 1
                q.append((nx, ny))

# --- alpha: 0 outside, 255 inside, partial where the outline is anti-aliased ---
alpha = Image.new("L", (W, H), 255)
ap = alpha.load()
for y in range(H):
    row = y * W
    for x in range(W):
        if outside[row + x]:
            ap[x, y] = 0
            continue
        # A pixel touching the removed background is an edge pixel unless it is
        # already fully opaque artwork. Fade it by how far it is from pure white.
        edge = False
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H and outside[ny * W + nx]:
                edge = True
                break
        if not edge:
            continue
        r, g, b = px[x, y]
        distance = 255 - min(r, g, b)          # 0 for pure white, 255 for opaque ink
        fraction = min(1.0, distance / 64.0)
        ap[x, y] = int(round(255 * fraction))

# Feather by one pixel: removes the harsh one-pixel stair-step of the JPEG outline.
alpha = alpha.filter(ImageFilter.GaussianBlur(0.6))
# Trim isolated specks: erode then grown back keeps the silhouette, drops dust.
alpha = alpha.point(lambda v: 0 if v < 28 else (255 if v > 200 else v))

art = im.convert("RGBA")
art.putalpha(alpha)

bbox = art.getbbox()
art = art.crop(bbox)
cw, ch = art.size

scale = min((CANVAS - 2 * PAD) / cw, (CANVAS - 2 * PAD) / ch)
nw, nh = max(1, int(round(cw * scale))), max(1, int(round(ch * scale)))
art = art.resize((nw, nh), Image.LANCZOS)

board = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
board.paste(art, ((CANVAS - nw) // 2, (CANVAS - nh) // 2), art)
board.save(os.path.join(OUT, "base.png"))

# Visual check sheet: the cut-out over magenta shows every halo or leftover pixel.
check = Image.new("RGB", board.size, (255, 0, 255))
check.paste(board, (0, 0), board)
check.save(os.path.join(OUT, "check-magenta.png"))

check2 = Image.new("RGB", board.size, (24, 26, 32))
check2.paste(board, (0, 0), board)
check2.save(os.path.join(OUT, "check-dark.png"))

print("source=%dx%d crop=%dx%d scaled=%dx%d board=%dx%d" % (W, H, cw, ch, nw, nh, CANVAS, CANVAS))
