# Issue 004 promo card 2: curator concentration on Morpho.
# Combined V1+V2 HHI 2,095 -> 2,337 (+11.6%); Sentora overtook Steakhouse as
# the largest single curator on the Ethereum Morpho vault surface.
#
#   python outputs/render_curator_concentration_promo.py
#   -> public/reports/charts-social/twitter-promo-curator-concentration.{svg,png}
#
# Figures: content/reports/2026-07-july.mdx sections 01 and 04.3.

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

# (curator, TVL share % of Morpho V1+V2 on Ethereum at July 31, label, highlight)
SHARES = [
    ("Sentora", 33.56, "33.56%  ·  $741M", True),
    ("Steakhouse Financial", 31.31, "31.31%  ·  $691M", False),
    ("Gauntlet", 13.02, "13.02%  ·  $287M", False),
    ("Sky Money", 5.46, "5.46%  ·  $121M", False),
    ("Galaxy Curation", 3.60, "3.60%  ·  $79M", False),
]

BAR_X = 300
BAR_MAX_W = 520  # Sentora at 33.56
SCALE = BAR_MAX_W / 33.56


def build() -> str:
    parts = [
        header(
            "STATE OF DEFI LENDING ON ETHEREUM  &#183;  MORPHO CURATORS",
            [
                "Curator concentration on Morpho climbed",
                "for a second consecutive month",
            ],
        )
    ]

    # Split stat panels
    parts.append(
        f'<text x="60" y="252" font-family="{MONO}" font-size="11" letter-spacing="2" fill="{MUTED}">COMBINED V1+V2 CURATOR HHI  &#183;  JULY 31</text>'
    )
    parts.append(
        f'<text x="60" y="322" font-family="{SERIF}" font-size="64" font-weight="700" fill="{COBALT}">2,337</text>'
    )
    parts.append(
        f'<text x="60" y="354" font-family="{SERIF}" font-size="16" font-style="italic" fill="{SLATE}">up from 2,095 at June 30 (+11.6%)</text>'
    )

    parts.append(f'<line x1="600" y1="236" x2="600" y2="360" stroke="{LINE}" stroke-width="1"/>')

    parts.append(
        f'<text x="640" y="252" font-family="{MONO}" font-size="11" letter-spacing="2" fill="{MUTED}">TOP-THREE CURATOR SHARE  &#183;  JULY 31</text>'
    )
    parts.append(
        f'<text x="640" y="322" font-family="{SERIF}" font-size="64" font-weight="700" fill="{COBALT}">77.9%</text>'
    )
    parts.append(
        f'<text x="640" y="354" font-family="{SERIF}" font-size="16" font-style="italic" fill="{SLATE}">up from 74.6% at June 30 (+3.3 pp)</text>'
    )

    # Bottom band: curator share ranking
    parts.append(
        f'<text x="60" y="404" font-family="{MONO}" font-size="11" letter-spacing="2" fill="{MUTED}">CURATOR TVL SHARE, MORPHO V1+V2 ON ETHEREUM  &#183;  JULY 31</text>'
    )
    y = 428
    for name, val, label, hl in SHARES:
        bar_w = max(round(val * SCALE), 3)
        color = TERRACOTTA if hl else COBALT
        parts.append(
            f'<text x="60" y="{y}" font-family="{SERIF}" font-size="15" fill="{INK}">{name}</text>'
        )
        parts.append(f'<rect x="{BAR_X}" y="{y - 11}" width="{bar_w}" height="12" fill="{color}"/>')
        parts.append(
            f'<text x="1140" y="{y}" font-family="{MONO}" font-size="13" fill="{color if hl else INK}" font-weight="600" text-anchor="end">{label}</text>'
        )
        y += 25

    parts.append(
        footer(
            [
                "Sentora overtook Steakhouse Financial as the largest single curator on the Ethereum Morpho vault surface; Gauntlet fell for a second month.",
                "Combined Morpho V1+V2 curated TVL: $2.21B at July 31, with V2 at 71.8% of the total.",
            ]
        )
    )
    return wrap_svg("\n  ".join(parts))


if __name__ == "__main__":
    write_and_render("twitter-promo-curator-concentration", build())
