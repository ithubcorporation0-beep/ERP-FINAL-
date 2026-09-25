import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KpiCard } from "@/components/shared/kpi-card";

describe("KpiCard", () => {
  it("shows label, value and a change that doesn't rely on color alone", () => {
    render(
      <KpiCard
        label="Revenue"
        value="$48,250.00"
        change={{ value: "12%", direction: "up", sentiment: "positive", label: "vs last month" }}
      />,
    );
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.getByText("$48,250.00")).toBeInTheDocument();
    expect(screen.getByText("12%").parentElement).toHaveTextContent("up 12%");
    expect(screen.getByText("vs last month")).toBeInTheDocument();
  });
});
