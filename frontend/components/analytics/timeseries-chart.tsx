"use client";

import { TimeseriesChart } from "@cloudflare/kumo/components/chart";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useMemo } from "react";

const PALETTE_TOKENS = [
  "--color-kumo-brand",
  "--color-kumo-success",
  "--color-kumo-warning",
  "--color-kumo-info",
  "--color-kumo-danger",
] as const;
const PALETTE_FALLBACKS = ["#2160fd", "#147a50", "#805900", "#3b82f6", "#c92a2a"] as const;

echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

type SemanticSeries = { key?: string; name: string; data: [number, number][] };

function resolveKumoPalette() {
  if (typeof window === "undefined") return [...PALETTE_FALLBACKS];
  const styles = window.getComputedStyle(document.documentElement);
  return PALETTE_TOKENS.map((token, index) => styles.getPropertyValue(token).trim() || PALETTE_FALLBACKS[index]);
}

export function AssuranceTimeseries({
  data,
  label = "Aktivitas operasional",
  isLoading = false,
  error,
}: {
  data: SemanticSeries[];
  label?: string;
  isLoading?: boolean;
  error?: string | null;
}) {
  const palette = resolveKumoPalette();
  const series = useMemo(
    () => data.map((item, index) => ({ ...item, color: palette[index % palette.length] })),
    [data, palette],
  );

  if (isLoading) {
    return <div className="chart-empty" role="status"><strong>Memuat data periode…</strong><span>GateGuard mengambil peristiwa yang tersimpan untuk rentang waktu ini.</span></div>;
  }
  if (error) {
    return <div className="chart-empty chart-empty--error" role="alert"><strong>Chart tidak dapat dimuat</strong><span>{error}</span></div>;
  }
  if (!series.length || series.every((item) => item.data.length === 0)) {
    return <div className="chart-empty" role="status"><strong>Belum ada aktivitas pada periode ini</strong><span>{label} akan tampil saat sebuah peristiwa operasional tersimpan.</span></div>;
  }

  return <div className="assurance-chart" aria-label={label}>
    <TimeseriesChart
      echarts={echarts}
      data={series}
      type="line"
      enableLegendSelection
      tooltipMode="all"
      ariaDescription={`${label} berdasarkan peristiwa tersimpan`}
      yAxisName="Peristiwa"
      xAxisName="Waktu"
    />
  </div>;
}
