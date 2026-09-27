"use client";

import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { MonthlyChartData } from "@/server/services/dashboard.service";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

/**
 * Responsive month-by-month chart (bars and/or lines). Screen readers get the same numbers as a table, since
 * an SVG chart alone is not accessible.
 */
export function MonthlyChart({
  data,
  title,
  locale,
}: {
  data: MonthlyChartData;
  title: string;
  locale: string;
}) {
  const config: ChartConfig = Object.fromEntries(
    data.series.map((series, index) => [
      series.key,
      { label: series.label, color: COLORS[index % COLORS.length] },
    ]),
  );
  const rows = data.rows.map((row) => ({ label: row.label, ...row.values }));
  const number = new Intl.NumberFormat(locale);

  return (
    <>
      <ChartContainer config={config} className="aspect-auto h-64 w-full" aria-hidden="true">
        <ComposedChart data={rows} margin={{ left: 4, right: 4, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={12} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={40}
            allowDecimals={false}
            tickFormatter={(value: number) => number.format(value)}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          {data.series.map((series) =>
            series.kind === "bar" ? (
              <Bar key={series.key} dataKey={series.key} fill={`var(--color-${series.key})`} radius={4} />
            ) : (
              <Line
                key={series.key}
                dataKey={series.key}
                type="monotone"
                stroke={`var(--color-${series.key})`}
                strokeWidth={2}
                dot={false}
              />
            ),
          )}
        </ComposedChart>
      </ChartContainer>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            {data.series.map((series) => (
              <th key={series.key} scope="col">
                {series.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <tr key={row.month}>
              <th scope="row">{row.label}</th>
              {data.series.map((series) => (
                <td key={series.key}>{number.format(row.values[series.key] ?? 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
