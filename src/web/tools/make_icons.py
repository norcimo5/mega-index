#!/usr/bin/env python3
"""Generate the MEGA//INDEX PWA icons (PIL). Run: python3 src/web/tools/make_icons.py
Writes src/web/icons/{icon-192,icon-512,icon-maskable-512,apple-touch-icon,favicon-32,favicon-16}.png
and favicon.ico. Emblem: gold Mega Ball inside a chamfered HUD frame with cyan/magenta glitch offsets."""
import math
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "icons")
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"

INK = (10, 18, 48)
BLUE = (0, 72, 255)
CYAN = (0, 214, 255)
MAGENTA = (255, 0, 170)
GOLD = (242, 183, 5)
GOLD_HI = (255, 230, 120)
GOLD_LO = (176, 120, 0)
BG = (250, 252, 255)


def chamfer(cx, cy, r, c):
    """Octagon-ish chamfered square: half-size r, corner cut c."""
    return [(cx - r + c, cy - r), (cx + r - c, cy - r), (cx + r, cy - r + c), (cx + r, cy + r - c),
            (cx + r - c, cy + r), (cx - r + c, cy + r), (cx - r, cy + r - c), (cx - r, cy - r + c)]


def emblem(S, scale, full_bleed):
    """Render at S px. scale = emblem half-size as a fraction of S/2."""
    img = Image.new("RGBA", (S, S), BG + (255,) if full_bleed else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = cy = S / 2
    R = S / 2 * scale
    if not full_bleed:
        d.polygon(chamfer(cx, cy, R, R * 0.28), fill=BG + (255,))
    # grid
    step = S / 16
    grid = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    for i in range(17):
        gd.line([(i * step, 0), (i * step, S)], fill=BLUE + (28,), width=max(1, S // 256))
        gd.line([(0, i * step), (S, i * step)], fill=BLUE + (28,), width=max(1, S // 256))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).polygon(chamfer(cx, cy, R, R * 0.28), fill=255) if not full_bleed else \
        ImageDraw.Draw(mask).rectangle([0, 0, S, S], fill=255)
    img.paste(grid, (0, 0), Image.composite(grid, Image.new("RGBA", (S, S)), mask))
    # glitch frames (magenta / cyan offset), then the blue frame
    w = max(2, int(S * 0.022))
    fr = R * 0.92
    off = S * 0.012
    for col, dx in ((MAGENTA, -off), (CYAN, off)):
        pts = chamfer(cx + dx, cy, fr, fr * 0.28)
        d.line(pts + [pts[0]], fill=col + (255,), width=w, joint="curve")
    pts = chamfer(cx, cy, fr, fr * 0.28)
    d.line(pts + [pts[0]], fill=BLUE + (255,), width=w, joint="curve")
    # corner ticks
    t = fr * 0.18
    for sx in (-1, 1):
        for sy in (-1, 1):
            x0, y0 = cx + sx * fr * 0.80, cy + sy * fr * 0.80
            d.line([(x0, y0), (x0 - sx * t, y0)], fill=INK + (255,), width=max(1, w // 2))
            d.line([(x0, y0), (x0, y0 - sy * t)], fill=INK + (255,), width=max(1, w // 2))
    # ball glow
    br = R * 0.56
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([cx - br * 1.12, cy - br * 1.12, cx + br * 1.12, cy + br * 1.12], fill=GOLD + (150,))
    glow = glow.filter(ImageFilter.GaussianBlur(S * 0.04))
    img.alpha_composite(glow)
    # gold ball with radial shading
    ball = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bp = ball.load()
    hx, hy = cx - br * 0.35, cy - br * 0.40
    for y in range(int(cy - br) - 1, int(cy + br) + 2):
        for x in range(int(cx - br) - 1, int(cx + br) + 2):
            dd = math.hypot(x - cx, y - cy)
            if dd <= br:
                t2 = min(1.0, math.hypot(x - hx, y - hy) / (br * 1.55))
                if t2 < 0.5:
                    k = t2 / 0.5
                    c = tuple(int(GOLD_HI[i] + (GOLD[i] - GOLD_HI[i]) * k) for i in range(3))
                else:
                    k = (t2 - 0.5) / 0.5
                    c = tuple(int(GOLD[i] + (GOLD_LO[i] - GOLD[i]) * k) for i in range(3))
                a = 255 if dd < br - 1 else int(255 * (br - dd + 1) / 2)
                bp[x, y] = c + (max(0, min(255, a)),)
    img.alpha_composite(ball)
    d = ImageDraw.Draw(img)
    d.ellipse([cx - br, cy - br, cx + br, cy + br], outline=INK + (255,), width=max(1, int(S * 0.012)))
    # white inner disc + number
    ir = br * 0.58
    d.ellipse([cx - ir, cy - ir, cx + ir, cy + ir], fill=(255, 255, 255, 255), outline=INK + (255,),
              width=max(1, int(S * 0.008)))
    font = ImageFont.truetype(FONT, int(ir * 1.05))
    txt = "24"
    for col, dx in ((MAGENTA, -S * 0.008), (CYAN, S * 0.008), (INK, 0)):
        d.text((cx + dx, cy + S * 0.004), txt, font=font, fill=col + (255,), anchor="mm")
    # scanlines over the ball
    sl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sl)
    gap = max(3, S // 64)
    for y in range(int(cy - br), int(cy + br), gap):
        sd.line([(0, y), (S, y)], fill=(255, 255, 255, 40), width=max(1, gap // 3))
    bm = Image.new("L", (S, S), 0)
    ImageDraw.Draw(bm).ellipse([cx - br, cy - br, cx + br, cy + br], fill=255)
    img.paste(sl, (0, 0), Image.composite(sl.getchannel("A"), Image.new("L", (S, S), 0), bm))
    return img


def render(size, scale, full_bleed):
    big = emblem(size * 4, scale, full_bleed)
    return big.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    out = {}
    out["icon-512.png"] = render(512, 0.98, False)
    out["icon-192.png"] = render(192, 0.98, False)
    # maskable: full-bleed background, emblem inside the central 80% safe zone circle
    out["icon-maskable-512.png"] = render(512, 0.70, True)
    out["apple-touch-icon.png"] = render(180, 0.86, True).convert("RGB")
    out["favicon-32.png"] = render(32, 1.0, False)
    out["favicon-16.png"] = render(16, 1.0, False)
    for name, im in out.items():
        im.save(os.path.join(OUT, name), optimize=True)
        print("wrote", name, im.size)
    render(64, 1.0, False).save(os.path.join(OUT, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    print("wrote favicon.ico")


if __name__ == "__main__":
    main()
