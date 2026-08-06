# Issue 004 promo card 1: Aave V3 carried the sector.
# Aave V3 +$649M net constant-price flow was 117% of the sector's +$553M;
# the other five covered protocols combined for -$96M.
#
#   python outputs/render_aave_carried_promo.py
#   -> public/reports/charts-social/twitter-promo-aave-carried.{svg,png}
#
# Figures: content/reports/2026-07-july.mdx sections 01 and 03.

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
    ("Aave V3", 649, "+$649M"),
    ("Morpho V1", 135, "+$135M"),
    ("Fluid", 26, "+$26M"),
    ("Compound V3", -23, "−$23M"),
    ("Euler V2", -31, "−$31M"),
    ("SparkLend", -203, "−$203M"),
]

ZERO_X = 360
POS_MAX_W = 470  # Aave V3 at 649
SCALE = POS_MAX_W / 649


def build() -> str:
    parts = [
        header(
            "STATE OF DEFI LENDING ON ETHEREUM  &#183;  SECTOR FLOW",
            [
                "Aave V3 was the only major protocol",
                "that grew on Ethereum in July",
            ],
        )
    ]

    # Split stat panels
    parts.append(
        f'<text x="60" y="252" font-family="{MONO}" font-size="11" letter-spacing="2" fill="{MUTED}">AAVE V3 NET FLOW  &#183;  JULY 2026</text>'
    )
    parts.append(
        f'<text x="60" y="322" font-family="{SERIF}" font-size="64" font-weight="700" fill="{COBALT}">+$649M</text>'
    )
    parts.append(
        f'<text x="60" y="354" font-family="{SERIF}" font-size="16" font-style="italic" fill="{SLATE}">117% of net sector inflow</text>'
    )

    parts.append(f'<line x1="600" y1="236" x2="600" y2="360" stroke="{LINE}" stroke-width="1"/>')

    parts.append(
        f'<text x="640" y="252" font-family="{MONO}" font-size="11" letter-spacing="2" fill="{MUTED}">OTHER FIVE PROTOCOLS  &#183;  JULY 2026</text>'
    )
    parts.append(
        f'<text x="640" y="322" font-family="{SERIF}" font-size="64" font-weight="700" fill="{TERRACOTTA}">−$96M</text>'
    )
    parts.append(
        f'<text x="640" y="354" font-family="{SERIF}" font-size="16" font-style="italic" fill="{SLATE}">the sector contracts without Aave V3</text>'
    )

    # Bottom band: per-protocol ranking, diverging from a zero baseline
    parts.append(
        f'<text x="60" y="404" font-family="{MONO}" font-size="11" letter-spacing="2" fill="{MUTED}">NET CONSTANT-PRICE FLOW BY PROTOCOL  &#183;  JULY 2026</text>'
    )
    parts.append(f'<line x1="{ZERO_X}" y1="417" x2="{ZERO_X}" y2="557" stroke="{LINE}" stroke-width="1"/>')
    y = 428
    for name, value, label in FLOWS:
        bar_w = max(round(abs(value) * SCALE), 3)
        if value >= 0:
            bar = f'<rect x="{ZERO_X}" y="{y - 11}" width="{bar_w}" height="12" fill="{COBALT}"/>'
            color = INK
        else:
            bar = f'<rect x="{ZERO_X - bar_w}" y="{y - 11}" width="{bar_w}" height="12" fill="{TERRACOTTA}"/>'
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
                "Sector total +$553M in July, down from +$1.33B in June. Constant-price = token-quantity change, prices held at the July 31 snapshot.",
                "The inflow was collateral: weETH +$285M, sUSDe +$145M, WBTC +$124M. USDC shed $20M.",
            ]
        )
    )
    return wrap_svg("\n  ".join(parts))


if __name__ == "__main__":
    write_and_render("twitter-promo-aave-carried", build())
