# Issue 003 promo card 1: the sector paradox.
# Nominal supply down $3.41B while constant-price depositor flow ran +$1.33B.
#
#   python outputs/render_sector_paradox_promo.py
#   -> public/reports/charts-social/twitter-promo-sector-paradox.{svg,png}
#
# Figures: content/reports/2026-06-june.mdx sections 02 and 04.

from promo_common import (
    COBALT,
    INK,
    LINE,
    MONO,
    MUTED,
    SERIF,
    SLATE,
    TERRACOTTA,
    footer,
    header,
    wrap_svg,
    write_and_render,
)

# (protocol, net constant-price flow in USD millions, display label)
FLOWS = [
    ("Aave V3", 845, "+$845M"),
    ("SparkLend", 415, "+$415M"),
    ("Compound V3", 59, "+$59M"),
    ("Morpho", 20, "+$20M"),
    ("Fluid", 16, "+$16M"),
    ("Euler V2", -21, "−$21M"),
]

BAR_X = 250
BAR_MAX_W = 560  # Aave V3 at 845
SCALE = BAR_MAX_W / 845


def build() -> str:
    parts = [
        header(
            "STATE OF DEFI LENDING ON ETHEREUM  &#183;  SECTOR OVERVIEW",
            [
                "Sector supply fell $3.4 billion in dollars",
                "while depositors added $1.33 billion in tokens",
            ],
        )
    ]

    # Split stat panels
    parts.append(
        f'<text x="60" y="252" font-family="{MONO}" font-size="11" letter-spacing="2" fill="{MUTED}">NOMINAL SUPPLY  &#183;  JUNE 30</text>'
    )
    parts.append(
        f'<text x="60" y="322" font-family="{SERIF}" font-size="64" font-weight="700" fill="{COBALT}">$29.23B</text>'
    )
    parts.append(
        f'<text x="60" y="354" font-family="{SERIF}" font-size="16" font-style="italic" fill="{SLATE}">down $3.41B (−10.4%) from May 31</text>'
    )

    parts.append(f'<line x1="600" y1="236" x2="600" y2="360" stroke="{LINE}" stroke-width="1"/>')

    parts.append(
        f'<text x="640" y="252" font-family="{MONO}" font-size="11" letter-spacing="2" fill="{MUTED}">CONSTANT-PRICE FLOW  &#183;  JUNE 2026</text>'
    )
    parts.append(
        f'<text x="640" y="322" font-family="{SERIF}" font-size="64" font-weight="700" fill="{TERRACOTTA}">+$1.33B</text>'
    )
    parts.append(
        f'<text x="640" y="354" font-family="{SERIF}" font-size="16" font-style="italic" fill="{SLATE}">5 of 6 protocols positive</text>'
    )

    # Bottom band: per-protocol ranking
    parts.append(
        f'<text x="60" y="404" font-family="{MONO}" font-size="11" letter-spacing="2" fill="{MUTED}">NET CONSTANT-PRICE FLOW BY PROTOCOL  &#183;  JUNE 2026</text>'
    )
    y = 428
    for name, value, label in FLOWS:
        bar_w = max(round(abs(value) * SCALE), 3)
        if value >= 0:
            bar = f'<rect x="{BAR_X}" y="{y - 11}" width="{bar_w}" height="12" fill="{COBALT}"/>'
            color = INK
        else:
            bar = f'<rect x="{BAR_X - bar_w}" y="{y - 11}" width="{bar_w}" height="12" fill="{TERRACOTTA}"/>'
            color = TERRACOTTA
        parts.append(
            f'<text x="60" y="{y}" font-family="{SERIF}" font-size="15" fill="{INK}">{name}</text>'
        )
        parts.append(bar)
        parts.append(
            f'<text x="1140" y="{y}" font-family="{MONO}" font-size="13" fill="{color}" font-weight="600" text-anchor="end">{label}</text>'
        )
        y += 25

    parts.append(
        footer(
            [
                "The mark-to-market wedge in June 2026. Constant-price = token quantity change, holding prices fixed at the snapshot.",
                "Nominal = dollar value at spot prices.",
            ]
        )
    )
    return wrap_svg("\n  ".join(parts))


if __name__ == "__main__":
    write_and_render("twitter-promo-sector-paradox", build())
