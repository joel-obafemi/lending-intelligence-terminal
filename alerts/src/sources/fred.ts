/**
 * FRED (Federal Reserve Economic Data) client. Public CSV endpoint, no API
 * key required. Matches the convention used by the dashboard's lib/fred.ts.
 *
 * TB4WK = 4-week Treasury bill secondary market rate. Used as the
 * risk-free benchmark for the real_yield_spread_regime rule.
 */

const FRED_CSV_BASE = "https://fred.stlouisfed.org/graph/fredgraph.csv";

export interface FredPoint {
  /** Unix milliseconds at UTC midnight on the observation date. */
  timestampMs: number;
  /** Rate as a percentage, e.g. 4.32. */
  rate: number;
}

export class FredClient {
  private seriesPromises = new Map<string, Promise<FredPoint[]>>();

  async fetchSeries(seriesId: string): Promise<FredPoint[]> {
    let p = this.seriesPromises.get(seriesId);
    if (!p) {
      p = this.doFetch(seriesId);
      this.seriesPromises.set(seriesId, p);
    }
    return p;
  }

  /**
   * Latest observed rate for the series. FRED publishes daily rates with
   * weekend / holiday gaps; carries the most recent value forward.
   */
  async fetchLatest(seriesId: string): Promise<number | null> {
    const series = await this.fetchSeries(seriesId);
    if (series.length === 0) return null;
    return series[series.length - 1]!.rate;
  }

  /**
   * 4-week T-bill rate. Prefers TB4WK; falls back to DGS1MO if TB4WK is
   * unavailable. Returns null only if neither responded.
   */
  async fetchTBill4wk(): Promise<number | null> {
    const primary = await this.fetchLatest("TB4WK").catch(() => null);
    if (primary != null) return primary;
    return this.fetchLatest("DGS1MO").catch(() => null);
  }

  private async doFetch(seriesId: string): Promise<FredPoint[]> {
    const url = `${FRED_CSV_BASE}?id=${encodeURIComponent(seriesId)}`;
    const res = await fetch(url, {
      headers: { "user-agent": "datumlabs-alerts/0.1 (+lending-intelligence-terminal)" },
    });
    if (!res.ok) {
      throw new Error(`FRED ${seriesId} ${res.status} ${res.statusText}`);
    }
    const text = await res.text();
    const points: FredPoint[] = [];
    const lines = text.split(/\r?\n/);
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (!line) continue;
      const parts = line.split(",");
      const dateStr = parts[0];
      const rateStr = parts[1];
      if (!dateStr || !rateStr || rateStr === "." || rateStr === "NA") continue;
      const rate = Number(rateStr);
      if (!Number.isFinite(rate)) continue;
      const ts = new Date(`${dateStr}T00:00:00Z`).getTime();
      if (!Number.isFinite(ts)) continue;
      points.push({ timestampMs: ts, rate });
    }
    return points.sort((a, b) => a.timestampMs - b.timestampMs);
  }
}
