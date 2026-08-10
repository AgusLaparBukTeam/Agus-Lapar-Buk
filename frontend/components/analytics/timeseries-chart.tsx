"use client";

import { TimeseriesChart } from "@cloudflare/kumo/components/chart";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

export function AssuranceTimeseries({ data, label = "Shipment activity" }: { data: Array<{ name: string; color: string; data: [number, number][] }>; label?: string }) {
  if (!data.length || data.every((series) => series.data.length === 0)) {
    return <div className="chart-empty" role="status"><strong>Not enough data</strong><span>{label} will appear after the first completed assessment.</span></div>;
  }
  return <div className="assurance-chart" aria-label={label}><TimeseriesChart echarts={echarts} data={data} type="line" enableLegendSelection tooltipMode="all" ariaDescription={`${label} over time`} /></div>;
}
