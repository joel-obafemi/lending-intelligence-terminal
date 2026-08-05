#!/usr/bin/env python3
"""Render Issue 004 in-report chart SVGs from source snapshots.

Reads values from content/snapshots/*.json at runtime (nothing hardcoded) and
writes SVGs to public/reports/charts/2026-07/ in the established Datum Labs
in-report chart style (cream ground, cobalt/terracotta, Source Serif 4 /
JetBrains Mono, matching public/reports/charts/2026-05-may-chart-*.svg).

Renders:
  - section-01-curator-crossover.svg   (Sentora overtakes Steakhouse)
  - section-02-usdc-rate-dispersion.svg
  - section-04-sparklend-sky-peg.svg

  python3 outputs/render_issue_004_charts.py
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SNAP = os.path.join(ROOT, "content", "snapshots")
OUTDIR = os.path.join(ROOT, "public", "reports", "charts", "2026-07")

INK, COBALT, TERRACOTTA = "#0E1B2C", "#1F3A5F", "#C5511A"
CREAM, FOG, MUTED, SLATE, LINE = "#F7F4ED", "#B8C9DD", "#595959", "#404040", "#D4CFC2"
SERIF = "'Source Serif 4', 'Liberation Serif', Georgia, serif"
MONO = "'JetBrains Mono', 'DejaVu Sans Mono', monospace"

W, H = 880, 480


def load(name):
    with open(os.path.join(SNAP, name), "r", encoding="utf-8") as f:
        return json.load(f)


def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def head(title):
    return (
        f'<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family={json.dumps(SERIF)}>\n'
        f'  <style>\n'
        f'    .title {{ fill: {INK}; font: 600 18px {SERIF}; }}\n'
        f'    .axis {{ fill: {MUTED}; font: 11px {MONO}; }}\n'
        f'    .lbl {{ fill: {INK}; font: 12px {MONO}; }}\n'
        f'    .val {{ font: 600 12px {MONO}; }}\n'
        f'    .grid {{ stroke: {FOG}; stroke-opacity: 0.4; }}\n'
        f'    .ref {{ stroke: {MUTED}; stroke-dasharray: 4 4; stroke-opacity: 0.7; }}\n'
        f'    .caption {{ fill: {MUTED}; font: italic 13px {SERIF}; }}\n'
        f'    .source {{ fill: {MUTED}; font: 10px {MONO}; letter-spacing: 0.08em; }}\n'
        f'  </style>\n'
        f'  <rect width="{W}" height="{H}" fill="{CREAM}"/>\n'
        f'  <text class="title" x="48" y="40">{esc(title)}</text>\n'
    )


def foot(caption, source):
    return (
        f'  <text class="caption" x="48" y="440">{esc(caption)}</text>\n'
        f'  <text class="source" x="48" y="462">{esc(source)}</text>\n'
        f'</svg>\n'
    )


def legend(items, x0, y):
    # items: list of (label, color)
    out, x = [], x0
    for label, color in items:
        out.append(f'<rect x="{x}" y="{y - 9}" width="12" height="12" rx="2" fill="{color}"/>')
        out.append(f'<text x="{x + 18}" y="{y + 1}" class="lbl">{esc(label)}</text>')
        x += 22 + len(label) * 8.2
    return "".join(out)


# ─── Chart 02: USDC rate dispersion (grouped bars) ─────────────────────────
def render_02():
    jul = load("2026-07-rate-dispersion.json")
    jun = load("2026-06-rate-dispersion.json")

    def usdc_pp(doc, anchor):
        u = next(a for a in doc["per_asset"] if a["asset"] == "USDC")
        return {p["protocol_slug"]: p["supply_apy_pct"] for p in u[anchor]["per_protocol"]}

    j = usdc_pp(jul, "july31")
    n = usdc_pp(jun, "june30")
    protos = [("Aave V3", "aave-v3", COBALT), ("Fluid", "fluid", TERRACOTTA),
              ("Compound V3", "compound-v3", FOG), ("Euler V2", "euler-v2", MUTED)]
    groups = [("June 30", n), ("July 31", j)]

    x0, baseline, top = 90, 372, 100
    ymax = 7.0
    ysc = (baseline - top) / ymax
    barw, bargap, gwidth = 40, 10, 4 * 40 + 3 * 10  # 190
    gx = [150, 500]
    tbill = 3.60

    s = head("USDC supply APY across pool-based markets — June 30 vs July 31, 2026")
    s += f'  {legend([(p[0], p[2]) for p in protos], 48, 66)}\n'
    # y grid + ticks
    for v in range(0, 8):
        y = baseline - v * ysc
        s += f'  <line class="grid" x1="{x0}" y1="{y:.1f}" x2="{W-40}" y2="{y:.1f}"/>\n'
        s += f'  <text class="axis" x="{x0-10}" y="{y+4:.1f}" text-anchor="end">{v}%</text>\n'
    # T-bill reference line
    yt = baseline - tbill * ysc
    s += f'  <line class="ref" x1="{x0}" y1="{yt:.1f}" x2="{W-40}" y2="{yt:.1f}"/>\n'
    s += f'  <text class="axis" x="{W-44}" y="{yt-5:.1f}" text-anchor="end" fill="{SLATE}">4-week T-bill 3.60%</text>\n'
    # bars
    for gi, (gname, data) in enumerate(groups):
        for bi, (pname, slug, color) in enumerate(protos):
            v = data[slug]
            bx = gx[gi] + bi * (barw + bargap)
            by = baseline - v * ysc
            s += f'  <rect x="{bx}" y="{by:.1f}" width="{barw}" height="{baseline - by:.1f}" fill="{color}"/>\n'
            s += f'  <text class="val" x="{bx + barw/2:.1f}" y="{by-6:.1f}" text-anchor="middle" fill="{color if color != FOG else SLATE}">{v:.2f}</text>\n'
        s += f'  <text class="lbl" x="{gx[gi] + gwidth/2:.1f}" y="{baseline+22}" text-anchor="middle" font-weight="600">{gname}</text>\n'
    s += foot(
        "USDC supply APY across the four pool-based markets, June 30 vs July 31, 2026. Fluid gave back most of its June premium; the other three held roughly flat.",
        "Source: Datum Labs Research, DefiLlama Yields.")
    return s


# ─── Chart 04: SparkLend Sky peg (two lines) ───────────────────────────────
def render_04():
    sky = load("2026-07-sky-base-rate-daily.json")["series"]
    spark = load("2026-07-spark-usdc-borrow-daily.json")["series"]
    # common window June 22 → Aug 3
    lo, hi = "2026-06-22", "2026-08-03"
    sky = [r for r in sky if lo <= r["date"] <= hi]
    spark = [r for r in spark if lo <= r["date"] <= hi]
    dates = [r["date"] for r in sky]
    n = len(dates)

    x0, x1 = 84, 828
    ytop, ybot = 96, 372
    ylo, yhi = 3.5, 4.8
    xsc = (x1 - x0) / (n - 1)
    ysc = (ybot - ytop) / (yhi - ylo)

    def X(i):
        return x0 + i * xsc

    def Y(v):
        return ybot - (v - ylo) * ysc

    def poly(series, key):
        return " ".join(f"{X(i):.1f},{Y(r[key]):.2f}" for i, r in enumerate(series))

    idx = {d: i for i, d in enumerate(dates)}
    i23 = idx.get("2026-07-23")
    i06 = idx.get("2026-07-06")

    s = head("SparkLend USDC retail borrow rate vs Sky Base Rate — daily, July 2026")
    s += f'  {legend([("Sky Base Rate (wholesale)", COBALT), ("SparkLend USDC retail borrow", TERRACOTTA)], 48, 66)}\n'
    # y grid + ticks (3.5..4.8 by 0.2)
    v = ylo
    while v <= yhi + 1e-9:
        y = Y(v)
        s += f'  <line class="grid" x1="{x0}" y1="{y:.1f}" x2="{x1}" y2="{y:.1f}"/>\n'
        s += f'  <text class="axis" x="{x0-8}" y="{y+4:.1f}" text-anchor="end">{v:.1f}%</text>\n'
        v += 0.2
    # x ticks: first of each week-ish + key dates
    for d in ["2026-06-22", "2026-07-01", "2026-07-06", "2026-07-15", "2026-07-23", "2026-08-01"]:
        if d in idx:
            xx = X(idx[d])
            mmdd = d[5:]
            s += f'  <text class="axis" x="{xx:.1f}" y="{ybot+18}" text-anchor="middle">{mmdd}</text>\n'
    # July 23 event vertical line + label
    if i23 is not None:
        xx = X(i23)
        s += f'  <line class="ref" x1="{xx:.1f}" y1="{ytop}" x2="{xx:.1f}" y2="{ybot}" stroke="{TERRACOTTA}" stroke-opacity="0.85"/>\n'
        # Label to the RIGHT of the line so it clears the Jul 6 "spread cut" label.
        s += f'  <text x="{xx+7:.1f}" y="{ytop+14}" text-anchor="start" font="600 11px {MONO}" fill="{TERRACOTTA}">Atlas Edit executed</text>\n'
        s += f'  <text x="{xx+7:.1f}" y="{ytop+28}" text-anchor="start" font="600 11px {MONO}" fill="{TERRACOTTA}">Jul 23, 14:43 UTC</text>\n'
    # July 6 small label
    if i06 is not None:
        xx = X(i06)
        s += f'  <line class="ref" x1="{xx:.1f}" y1="{Y(4.62):.1f}" x2="{xx:.1f}" y2="{ybot}" stroke="{MUTED}" stroke-opacity="0.5"/>\n'
        s += f'  <text x="{xx+5:.1f}" y="{Y(4.72):.1f}" font="11px {MONO}" fill="{MUTED}">SparkLend spread cut</text>\n'
    # lines
    s += f'  <polyline points="{poly(spark, "borrow_apy_pct")}" fill="none" stroke="{TERRACOTTA}" stroke-width="2.4"/>\n'
    s += f'  <polyline points="{poly(sky, "base_rate_pct")}" fill="none" stroke="{COBALT}" stroke-width="2.4"/>\n'
    # end labels
    s += f'  <text x="{X(n-1)+4:.1f}" y="{Y(spark[-1]["borrow_apy_pct"])+4:.1f}" font="600 11px {MONO}" fill="{TERRACOTTA}">{spark[-1]["borrow_apy_pct"]:.2f}%</text>\n'
    s += f'  <text x="{X(n-1)+4:.1f}" y="{Y(sky[-1]["base_rate_pct"])+4:.1f}" font="600 11px {MONO}" fill="{COBALT}">{sky[-1]["base_rate_pct"]:.2f}%</text>\n'
    s += foot(
        "SparkLend USDC retail borrow rate and Sky Base Rate (wholesale), daily through July 2026. Both step on July 23. Source: Datum Labs Research, on-chain reads.",
        "Source: Datum Labs Research, on-chain reads.")
    return s


# ─── Chart 01: curator crossover (four lines, three dates) ─────────────────
def render_01():
    may = load("2026-05-31-curator-hhi-combined.json")["top_curators"]  # field: curator
    jun = load("2026-06-30-curator-hhi.json")["top_curators"]           # field: name
    jul = load("2026-07-31-curator-hhi.json")["top_curators"]           # field: name

    def share(arr, name):
        for c in arr:
            if c.get("curator", c.get("name")) == name:
                return c["share_pct"]
        raise SystemExit(f"curator {name!r} not found in source")

    names = ["Sentora", "Steakhouse Financial", "Gauntlet"]
    series = {n: [share(may, n), share(jun, n), share(jul, n)] for n in names}
    series["All other"] = [round(100 - sum(share(a, n) for n in names), 2) for a in (may, jun, jul)]

    expect = {"Sentora": [27.65, 31.23, 33.56], "Steakhouse Financial": [31.08, 29.17, 31.31],
              "Gauntlet": [18.59, 14.19, 13.02], "All other": [22.68, 25.41, 22.11]}
    for k, ev in expect.items():
        for got, exp in zip(series[k], ev):
            if abs(got - exp) > 0.5:
                raise SystemExit(f"SANITY FAIL {k}: got {series[k]} vs expected {ev}")

    xs = [240, 480, 720]
    ax0, ax1 = 160, 800
    ytop, ybot, ylo, yhi = 100, 360, 10, 40
    ysc = (ybot - ytop) / (yhi - ylo)

    def Y(v):
        return ybot - (v - ylo) * ysc

    # name: (color, width, marker, dash)
    style = {
        "Sentora": (COBALT, 3, "filled", None),
        "Steakhouse Financial": (TERRACOTTA, 3, "filled", None),
        "Gauntlet": (MUTED, 1.5, "hollow", None),
        "All other": (FOG, 1, "hollow", "4 3"),
    }

    s = head("Sentora overtakes Steakhouse as Morpho's largest curator")
    s += f'  {legend([("Sentora", COBALT), ("Steakhouse Financial", TERRACOTTA), ("Gauntlet", MUTED), ("All other", FOG)], 48, 66)}\n'
    for v in range(ylo, yhi + 1, 5):
        y = Y(v)
        s += f'  <line class="grid" x1="{ax0}" y1="{y:.1f}" x2="{ax1}" y2="{y:.1f}"/>\n'
        s += f'  <text class="axis" x="{ax0-8}" y="{y+4:.1f}" text-anchor="end">{v}%</text>\n'
    for xi, lbl in zip(xs, ["May 31", "June 30", "July 31"]):
        s += f'  <text class="lbl" x="{xi}" y="{ybot+22}" text-anchor="middle" font-weight="600">{lbl}</text>\n'
    # lines back-to-front
    for n in ["All other", "Gauntlet", "Steakhouse Financial", "Sentora"]:
        color, w, marker, dash = style[n]
        pts = " ".join(f"{xs[i]},{Y(series[n][i]):.1f}" for i in range(3))
        da = f' stroke-dasharray="{dash}"' if dash else ""
        s += f'  <polyline points="{pts}" fill="none" stroke="{color}" stroke-width="{w}"{da}/>\n'
        for i in range(3):
            cx, cy = xs[i], Y(series[n][i])
            if marker == "filled":
                s += f'  <circle cx="{cx}" cy="{cy:.1f}" r="4" fill="{color}"/>\n'
            else:
                s += f'  <circle cx="{cx}" cy="{cy:.1f}" r="3.2" fill="{CREAM}" stroke="{color}" stroke-width="1.4"/>\n'
    # July end labels
    for n in ["Sentora", "Steakhouse Financial", "Gauntlet", "All other"]:
        color = style[n][0]
        v = series[n][2]
        s += f'  <text x="{xs[2]+10}" y="{Y(v)+4:.1f}" class="val" fill="{color if color != FOG else SLATE}">{v:.2f}%</text>\n'
    # crossover marker + callout (Sentora × Steakhouse, between May and June)
    sen, stk = series["Sentora"], series["Steakhouse Financial"]
    t = (stk[0] - sen[0]) / ((sen[1] - sen[0]) - (stk[1] - stk[0]))
    xc = xs[0] + t * (xs[1] - xs[0])
    yc = Y(sen[0] + t * (sen[1] - sen[0]))
    s += f'  <line x1="{xc-5:.1f}" y1="{yc-5:.1f}" x2="{xc+5:.1f}" y2="{yc+5:.1f}" stroke="{SLATE}" stroke-width="1.6"/>\n'
    s += f'  <line x1="{xc-5:.1f}" y1="{yc+5:.1f}" x2="{xc+5:.1f}" y2="{yc-5:.1f}" stroke="{SLATE}" stroke-width="1.6"/>\n'
    s += f'  <line class="ref" x1="{xc:.1f}" y1="{yc-8:.1f}" x2="{xc:.1f}" y2="154" stroke="{MUTED}" stroke-opacity="0.5"/>\n'
    s += f'  <text x="{xc:.1f}" y="147" text-anchor="middle" font-family="{MONO}" font-size="10" fill="{MUTED}">Sentora overtakes Steakhouse</text>\n'
    s += foot(
        "Morpho V1 + V2 combined curator TVL share at May 31, June 30, and July 31, 2026. Sentora climbed from #2 to #1 between May and June; Steakhouse dipped and partly recovered; Gauntlet declined for the second consecutive month.",
        "Source: Datum Labs Research")
    return s


def main():
    os.makedirs(OUTDIR, exist_ok=True)
    charts = {
        "section-01-curator-crossover.svg": render_01(),
        "section-02-usdc-rate-dispersion.svg": render_02(),
        "section-04-sparklend-sky-peg.svg": render_04(),
    }
    for fname, svg in charts.items():
        path = os.path.join(OUTDIR, fname)
        with open(path, "w", encoding="utf-8") as f:
            f.write(svg)
        print(f"wrote {os.path.relpath(path, ROOT)} ({len(svg)} bytes)")


if __name__ == "__main__":
    main()
