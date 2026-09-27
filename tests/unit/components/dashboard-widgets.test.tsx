import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActivityFeed } from "@/features/dashboard/activity-feed";
import { KpiGrid } from "@/features/dashboard/kpi-grid";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("dashboard KPI grid", () => {
  it("formats real figures and marks unbuilt modules instead of showing a number", () => {
    render(
      <KpiGrid
        currency="AED"
        locale="en-US"
        rangeLabel="Last 6 months"
        kpis={[
          {
            id: "totalCustomers",
            label: "Total customers",
            state: { status: "ready", data: { value: "1234", format: "number", addedInRange: 5 } },
          },
          {
            id: "totalRevenue",
            label: "Total revenue",
            state: { status: "unavailable", module: "Sales", phase: 7 },
          },
          { id: "netProfit", label: "Net profit", state: { status: "error" } },
        ]}
      />,
    );
    const region = screen.getByRole("region", { name: "Key figures" });
    expect(within(region).getByText("1,234")).toBeInTheDocument();
    expect(within(region).getByText("+5 new · last 6 months")).toBeInTheDocument();
    expect(within(region).getByText(/Not tracked yet — appears when the Sales module/)).toBeInTheDocument();
    expect(within(region).getByRole("alert")).toHaveTextContent("Couldn’t load net profit.");
    expect(within(region).getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("dashboard activity feed", () => {
  it("shows an empty state and lists sources that are not tracked yet", () => {
    render(
      <ActivityFeed
        items={[]}
        tracked={[
          { id: "newCustomers", label: "New customers" },
          { id: "newInvoices", label: "New invoices" },
        ]}
        unavailable={[{ id: "payments", label: "Payments", module: "Sales", phase: 7 }]}
        failed={[]}
        locale="en-US"
        timeZone="UTC"
      />,
    );
    expect(screen.getByText("No activity yet")).toBeInTheDocument();
    expect(screen.getByText("New customers and new invoices will show up here.")).toBeInTheDocument();
    expect(screen.getByText("Payments")).toBeInTheDocument();
  });
});
