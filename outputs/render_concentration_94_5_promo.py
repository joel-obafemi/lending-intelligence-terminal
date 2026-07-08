# Issue 003 promo card 3: the 94.5% / 5.5% concentration split.
# Aave V3 + SparkLend absorbed 94.5% of June's net sector inflow.
#
#   python outputs/render_concentration_94_5_promo.py
#   -> public/reports/charts-social/twitter-promo-concentration-94-5.{svg,png}
#
# Figures: content/reports/2026-06-june.mdx section 04.

from promo_common import (
    COBALT,
    INK,
    MONO,
    MUTED,
    SERIF,
    TERRACOTTA,
    footer,
    header,
    wrap_svg,
    write_and_render,
)

# (protocol, share of net sector inflow in pp, display label, top-two flag)
SHARES = [
    ("Aave V3", 63.4, "63.4%", True),
    ("SparkLend", 31.1, "31.1%", True),
    ("Compound V3", 4.4, "4.4%", False),
    ("Morpho", 1.5, "1.5%", False),
    ("Fluid", 1.2, "1.2%", False),
    ("Euler V2", -1.6, "−1.6%", False),
]

BAR_X = 300
BAR_MAX_W = 640  # Aave V3 at 63.4
SCALE = BAR_MAX_W / 63.4


def build() -> str:
    parts = [
        header(
            "STATE OF DEFI LENDING ON ETHEREUM  &#183;  SECTOR OVERVIEW",
            ["Two protocols absorbed 94.5% of June’s sector inflow"],
        )
    ]

    parts.append(
        f'<text x="60" y="238" font-family="{MONO}" font-size="11" letter-spacing="2" fill="{MUTED}">SHARE OF NET CONSTANT-PRICE SECTOR INFLOW  &#183;  JUNE 2026</text>'
    )

    y = 288
    for name, value, label, top_two in SHARES:
        bar_w = max(round(abs(value) * SCALE), 4)
        fill = TERRACOTTA if top_two else COBALT
        weight = "700" if top_two else "400"
        if value >= 0:
            bar = f'<rect x="{BAR_X}" y="{y - 16}" width="{bar_w}" height="22" fill="{fill}"/>'
            pct_color = TERRACOTTA if top_two else COBALT
        else:
            bar = f'<rect x="{BAR_X - bar_w}" y="{y - 16}" width="{bar_w}" height="22" fill="{TERRACOTTA}"/>'
            pct_color = TERRACOTTA
        parts.append(
            f'<text x="60" y="{y}" font-family="{SERIF}" font-size="18" font-weight="{weight}" fill="{INK}">{name}</text>'
        )
        parts.append(bar)
        parts.append(
            f'<text x="1140" y="{y}" font-family="{MONO}" font-size="15" fill="{pct_color}" font-weight="600" text-anchor="end">{label}</text>'
        )
        y += 45

    parts.append(
        footer(
            [
                "The concentration mechanism at protocol scale. Aave V3 and SparkLend absorbed 94.5% of net inflow while holding",
                "73.9% of stock. Concentration accelerated by 20.6 percentage points.",
            ]
        )
    )
    return wrap_svg("\n  ".join(parts))


if __name__ == "__main__":
    write_and_render("twitter-promo-concentration-94-5", build())
