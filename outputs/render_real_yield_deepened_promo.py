# Issue 004 promo card 3: the Real Yield Spread deepened.
# Blended stablecoin supply APY 2.85% vs a 4-week T-bill of 3.60% -> RYS -75 bps
# at July 31, the second consecutive month materially negative.
#
#   python outputs/render_real_yield_deepened_promo.py
#   -> public/reports/charts-social/twitter-promo-real-yield-deepened.{svg,png}
#
# Figures: content/reports/2026-07-july.mdx sections 01 and 02. The card uses
# the blended-sector RYS only (an unambiguous reading); it deliberately omits
# any per-protocol "above/below the T-bill" claim.

from promo_common import (
    COBALT,
    INK,
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

# (month-end label, RYS deficit magnitude in bps below the T-bill, display label)
DEFICITS = [
    ("May 31", 0.3, "−0.3 bps"),
    ("June 30", 37, "−37 bps"),
    ("July 31", 75, "−75 bps"),
]

BAR_X = 300
BAR_MAX_W = 540  # July 31 at 75
SCALE = BAR_MAX_W / 75


def build() -> str:
    parts = [
        header(
            "STATE OF DEFI LENDING ON ETHEREUM  &#183;  REAL YIELD",
            [
                "Stablecoin lending now pays 75 bps",
                "under the risk-free rate",
            ],
        )
    ]

    # Split stat panels
    parts.append(
        f'<text x="60" y="252" font-family="{MONO}" font-size="11" letter-spacing="2" fill="{MUTED}">REAL YIELD SPREAD  &#183;  JULY 31</text>'
    )
    parts.append(
        f'<text x="60" y="322" font-family="{SERIF}" font-size="64" font-weight="700" fill="{TERRACOTTA}">−75 bps</text>'
    )
    parts.append(
        f'<text x="60" y="354" font-family="{SERIF}" font-size="16" font-style="italic" fill="{SLATE}">from −37 bps at June 30</text>'
    )

    parts.append(f'<line x1="600" y1="236" x2="600" y2="360" stroke="{MUTED}" stroke-width="1" opacity="0.35"/>')

    parts.append(
        f'<text x="640" y="252" font-family="{MONO}" font-size="11" letter-spacing="2" fill="{MUTED}">BLENDED STABLECOIN SUPPLY APY  &#183;  JULY 31</text>'
    )
    parts.append(
        f'<text x="640" y="322" font-family="{SERIF}" font-size="64" font-weight="700" fill="{COBALT}">2.85%</text>'
    )
    parts.append(
        f'<text x="640" y="354" font-family="{SERIF}" font-size="16" font-style="italic" fill="{SLATE}">vs a 4-week T-bill of 3.60%</text>'
    )

    # Bottom band: three-month deficit trajectory
    parts.append(
        f'<text x="60" y="440" font-family="{MONO}" font-size="11" letter-spacing="2" fill="{MUTED}">REAL YIELD SPREAD BELOW THE T-BILL, MONTH-END  &#183;  2026</text>'
    )
    y = 470
    for name, mag, label in DEFICITS:
        bar_w = max(round(mag * SCALE), 3)
        parts.append(
            f'<text x="60" y="{y}" font-family="{SERIF}" font-size="15" fill="{INK}">{name}</text>'
        )
        parts.append(f'<rect x="{BAR_X}" y="{y - 11}" width="{bar_w}" height="12" fill="{TERRACOTTA}"/>')
        parts.append(
            f'<text x="1140" y="{y}" font-family="{MONO}" font-size="13" fill="{TERRACOTTA}" font-weight="600" text-anchor="end">{label}</text>'
        )
        y += 30

    parts.append(
        footer(
            [
                "Real Yield Spread = blended stablecoin supply APY minus the 4-week T-bill. Two consecutive months materially negative after May sat near parity.",
                "The deepening came from the on-chain side: stablecoin APYs compressed while the T-bill held at 3.60% through July.",
            ]
        )
    )
    return wrap_svg("\n  ".join(parts))


if __name__ == "__main__":
    write_and_render("twitter-promo-real-yield-deepened", build())
