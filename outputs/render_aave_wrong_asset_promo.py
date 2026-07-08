# Issue 003 promo card 2: the Aave V3 wrong-asset finding.
# $845M net constant-price inflow while the USDC book contracted $162M.
#
#   python outputs/render_aave_wrong_asset_promo.py
#   -> public/reports/charts-social/twitter-promo-aave-wrong-asset.{svg,png}
#
# Figures: content/reports/2026-06-june.mdx section 01 and
# content/snapshots/2026-06-aave-v3-per-asset-flow.json. "All others" nets
# the remaining assets including USDC, so the five bars sum to +$845M.

from promo_common import (
    COBALT,
    INK,
    MONO,
    MUTED,
    SERIF,
    SLATE,
    TERRACOTTA,
    TINT,
    footer,
    header,
    wrap_svg,
    write_and_render,
)

COMPOSITION = [
    ("wstETH", 452, "+$452M"),
    ("cbBTC", 143, "+$143M"),
    ("USDTB", 104, "+$104M"),
    ("USDT", 99, "+$99M"),
    ("All others (net)", 47, "+$47M"),
]

BAR_X = 300
BAR_MAX_W = 560  # wstETH at 452
SCALE = BAR_MAX_W / 452


def build() -> str:
    parts = [
        header(
            "STATE OF DEFI LENDING ON ETHEREUM  &#183;  AAVE V3 DEEP DIVE",
            [],
        )
    ]

    # Top third: shock stat
    parts.append(
        f'<text x="60" y="218" font-family="{SERIF}" font-size="96" font-weight="700" fill="{TERRACOTTA}">$845M</text>'
    )
    parts.append(
        f'<text x="440" y="188" font-family="{SERIF}" font-size="19" font-style="italic" fill="{SLATE}">Aave V3 net constant-price inflow,</text>'
    )
    parts.append(
        f'<text x="440" y="214" font-family="{SERIF}" font-size="19" font-style="italic" fill="{SLATE}">June 2026</text>'
    )

    # Middle: composition of what arrived
    parts.append(
        f'<text x="60" y="272" font-family="{MONO}" font-size="11" letter-spacing="2" fill="{MUTED}">WHAT ARRIVED  &#183;  NET FLOW BY ASSET, JUNE 2026</text>'
    )
    y = 304
    for name, value, label in COMPOSITION:
        bar_w = max(round(value * SCALE), 3)
        parts.append(
            f'<text x="60" y="{y}" font-family="{SERIF}" font-size="17" fill="{INK}">{name}</text>'
        )
        parts.append(
            f'<rect x="{BAR_X}" y="{y - 13}" width="{bar_w}" height="15" fill="{COBALT}"/>'
        )
        parts.append(
            f'<text x="1140" y="{y}" font-family="{MONO}" font-size="14" fill="{INK}" font-weight="600" text-anchor="end">{label}</text>'
        )
        y += 31

    # Bottom: the twist, highlighted strip
    parts.append(f'<rect x="60" y="452" width="1080" height="104" fill="{TINT}"/>')
    parts.append(
        f'<text x="88" y="497" font-family="{SERIF}" font-size="30" font-weight="700" fill="{TERRACOTTA}">USDC on Aave V3: −$162M</text>'
    )
    parts.append(
        f'<text x="88" y="531" font-family="{SERIF}" font-size="15" font-style="italic" fill="{SLATE}">The $845M didn’t come from USDC. It came from collateral for the sector’s largest borrow book.</text>'
    )

    parts.append(
        footer(
            [
                "Constant-price = token quantity change, holding prices fixed at the snapshot date.",
            ]
        )
    )
    return wrap_svg("\n  ".join(parts))


if __name__ == "__main__":
    write_and_render("twitter-promo-aave-wrong-asset", build())
