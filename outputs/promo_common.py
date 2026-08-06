# Shared design system for Datum Labs promo cards (1200 x 675).
# Layout language matches the Issue 002 cards in
# public/reports/charts-social/ (LRT-88, SparkLend both-positive).
#
# PNG raster: cairosvg when the cairo DLL is available; otherwise falls back
# to the repo's Chromium path (scripts/render-social-png.ts via playwright),
# which is what produced the Issue 002 PNGs on this machine.

import os
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
OUT_DIR = REPO / "public" / "reports" / "charts-social"

# Two themes share the same semantic slots so the per-card scripts don't
# change: "report" is the cream/cobalt/terracotta report system; "brand"
# is the white/royal-blue/navy system from the datumlab.xyz site and the
# Issue book mockups (halftone-D covers). Select with PROMO_THEME=brand;
# brand renders write a "-brand" suffix so both sets coexist on disk.
import os as _os

_THEMES = {
    "report": {
        "COBALT": "#1F3A5F",
        "CREAM": "#F7F4ED",
        "TERRACOTTA": "#C5511A",
        "INK": "#0E1B2C",
        "SLATE": "#404040",
        "MUTED": "#595959",
        "LINE": "#D4CFC2",
        "FOG": "#B8C9DD",
        "TINT": "#F5E0CF",
    },
    "brand": {
        "COBALT": "#101A3C",   # navy: bars, structure, top bar
        "CREAM": "#F6F6F3",    # paper white
        "TERRACOTTA": "#4A6CF7",  # royal blue: accents, highlights
        "INK": "#101A3C",
        "SLATE": "#3D4358",
        "MUTED": "#5A607A",
        "LINE": "#D9DCE8",
        "FOG": "#B9C4F9",
        "TINT": "#E4EAFE",
    },
}

THEME = _os.environ.get("PROMO_THEME", "report")
_T = _THEMES[THEME]

COBALT = _T["COBALT"]
CREAM = _T["CREAM"]
TERRACOTTA = _T["TERRACOTTA"]
INK = _T["INK"]
SLATE = _T["SLATE"]
MUTED = _T["MUTED"]
LINE = _T["LINE"]
FOG = _T["FOG"]
TINT = _T["TINT"]

# Pass 6 feedback: simpler UI-sans typography across the cards (titles,
# numbers, labels), like the dashboard's Methodology page. The SERIF /
# MONO names are kept so the per-card scripts don't change; MONO keeps
# its letterspaced-uppercase role (kickers, footer) in the same sans.
SANS = "'Segoe UI', 'Inter', 'Helvetica Neue', Arial, sans-serif"
SERIF = SANS
MONO = SANS

ISSUE_LABEL = "ISSUE 004"
MONTH_LABEL = "JULY 2026"
FOOTER_URL = "DATUMLABS.XYZ/LENDING-TERMINAL"
FOOTER_TAG = "REPORTS  &#183;  2026-07-JULY"

# The Datum Labs logo ships embedded in the Issue 002 cards; reuse it rather
# than duplicating the base64 blob in every script.
LOGO_SOURCE_SVG = OUT_DIR / "twitter-promo-lrt-aave-v3-88.svg"


def logo_data_uri() -> str:
    svg = LOGO_SOURCE_SVG.read_text(encoding="utf-8")
    m = re.search(r'xlink:href="(data:image/png;base64,[^"]+)"', svg)
    if not m:
        raise RuntimeError(f"logo data URI not found in {LOGO_SOURCE_SVG}")
    return m.group(1)


def header(kicker: str, title_lines: list[str]) -> str:
    parts = [
        f'<rect width="1200" height="675" fill="{CREAM}"/>',
        f'<rect width="1200" height="76" fill="{COBALT}"/>',
        f'<text x="60" y="46" font-family="{MONO}" font-size="13" letter-spacing="2.4" fill="{CREAM}" font-weight="500">DATUM LABS RESEARCH</text>',
        f'<text x="660" y="46" font-family="{MONO}" font-size="13" letter-spacing="2.4" text-anchor="middle" font-weight="500">'
        f'<tspan fill="{TERRACOTTA}" font-weight="600">{ISSUE_LABEL}</tspan>'
        f'<tspan fill="{CREAM}" opacity="0.7">  &#183;  {MONTH_LABEL}</tspan></text>',
        f'<image x="1086" y="12" width="52" height="52" xlink:href="{logo_data_uri()}"/>',
        f'<rect x="0" y="76" width="840" height="4" fill="{COBALT}"/>',
        f'<rect x="840" y="76" width="360" height="4" fill="{TERRACOTTA}"/>',
        f'<text x="60" y="125" font-family="{MONO}" font-size="11" letter-spacing="2.42" fill="{TERRACOTTA}" font-weight="500">{kicker}</text>',
    ]
    y = 170
    for line in title_lines:
        parts.append(
            f'<text x="60" y="{y}" font-family="{SERIF}" font-size="32" font-weight="700" fill="{INK}">{line}</text>'
        )
        y += 38
    return "\n  ".join(parts)


def footer(caption_lines: list[str], divider_y: int = 583) -> str:
    parts = [
        f'<line x1="60" y1="{divider_y}" x2="1140" y2="{divider_y}" stroke="{LINE}" stroke-width="1"/>'
    ]
    y = divider_y + 23
    for line in caption_lines:
        parts.append(
            f'<text x="60" y="{y}" font-family="{SERIF}" font-size="14" font-style="italic" fill="{SLATE}">{line}</text>'
        )
        y += 21
    parts.append(
        f'<text x="60" y="657" font-family="{MONO}" font-size="11" letter-spacing="1.32" fill="{COBALT}" font-weight="500">{FOOTER_URL}</text>'
    )
    parts.append(
        f'<text x="1140" y="657" font-family="{MONO}" font-size="10" letter-spacing="1.26" text-anchor="end" fill="{MUTED}">{FOOTER_TAG}</text>'
    )
    return "\n  ".join(parts)


def wrap_svg(body: str) -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<svg xmlns="http://www.w3.org/2000/svg"\n'
        '     xmlns:xlink="http://www.w3.org/1999/xlink"\n'
        '     viewBox="0 0 1200 675" width="1200" height="675">\n'
        f"  {body}\n"
        "</svg>\n"
    )


def write_and_render(name: str, svg: str) -> None:
    if THEME != "report":
        name = f"{name}-{THEME}"
    svg_path = OUT_DIR / f"{name}.svg"
    png_path = OUT_DIR / f"{name}.png"
    svg_path.write_text(svg, encoding="utf-8")
    print(f"wrote {svg_path}")
    try:
        import cairosvg

        cairosvg.svg2png(url=str(svg_path), write_to=str(png_path), scale=2)
        print(f"wrote {png_path} (cairosvg)")
    except (ImportError, OSError):
        print("cairosvg unavailable, rasterising via Chromium")
        # PLAYWRIGHT_BROWSERS_PATH=0 keeps the browser inside node_modules,
        # where nested process spawns can always see it. One-time setup:
        #   PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium
        env = dict(os.environ, PLAYWRIGHT_BROWSERS_PATH="0")
        result = subprocess.run(
            f'npx tsx scripts/render-social-png.ts "{svg_path}" "{png_path}"',
            shell=True,
            cwd=REPO,
            env=env,
        )
        if result.returncode != 0:
            sys.exit(result.returncode)
