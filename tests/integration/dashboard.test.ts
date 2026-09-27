import { describe, expect, it } from "vitest";
import { ForbiddenError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant";
import { customerService } from "@/server/services/customer.service";
import { dashboardService } from "@/server/services/dashboard.service";
import { addMember, createCompanyWithOwner } from "./helpers";
import { rawDb } from "./raw-db";

const NOW = new Date("2026-09-15T12:00:00Z");

async function addCustomer(ctx: TenantContext, name: string, createdAt: Date) {
  const customer = await customerService.create(ctx, { name });
  await rawDb.customer.update({ where: { id: customer.id }, data: { createdAt } });
  return customer;
}

async function dashboard(ctx: TenantContext, range: "last-6-months" | "this-month" = "last-6-months") {
  const scope = await dashboardService.scope(ctx, range, NOW);
  const [kpis, charts, activity] = await Promise.all([
    dashboardService.kpis(scope),
    dashboardService.charts(scope),
    dashboardService.activity(scope),
  ]);
  return { kpis, charts, activity };
}

describe("dashboard", () => {
  it("counts real customers per company, month and range; deleted ones are left out", async () => {
    const a = await createCompanyWithOwner("Dash A");
    const b = await createCompanyWithOwner("Dash B");
    await addCustomer(a, "Old", new Date("2025-01-10T00:00:00Z")); // before the range
    await addCustomer(a, "May", new Date("2026-05-10T00:00:00Z"));
    await addCustomer(a, "Sep 1", new Date("2026-09-01T00:00:00Z"));
    const gone = await addCustomer(a, "Sep deleted", new Date("2026-09-02T00:00:00Z"));
    await customerService.remove(a, gone.id);
    await addCustomer(b, "B only", new Date("2026-09-03T00:00:00Z"));

    const { kpis, charts, activity } = await dashboard(a);
    expect(kpis.find((kpi) => kpi.id === "totalCustomers")?.state).toEqual({
      status: "ready",
      data: { value: 3, format: "number", addedInRange: 2 },
    });

    const growth = charts.find((chart) => chart.id === "customerGrowth")?.state;
    if (growth?.status !== "ready") throw new Error("growth chart not ready");
    expect(growth.data.rows.map((row) => [row.month, row.values.added, row.values.total])).toEqual([
      ["2026-04", 0, 1],
      ["2026-05", 1, 2],
      ["2026-06", 0, 2],
      ["2026-07", 0, 2],
      ["2026-08", 0, 2],
      ["2026-09", 1, 3],
    ]);

    expect(activity.items.map((item) => item.title)).toEqual(["Sep 1", "May", "Old"]);

    const thisMonth = await dashboard(a, "this-month");
    expect(thisMonth.kpis.find((kpi) => kpi.id === "totalCustomers")?.state).toMatchObject({
      data: { value: 3, addedInRange: 1 },
    });
  });

  it("buckets months in the company's time zone", async () => {
    const ctx = await createCompanyWithOwner("Dash Dubai");
    await rawDb.company.update({ where: { id: ctx.companyId }, data: { timezone: "Asia/Dubai" } });
    // 21:00 UTC on 31 Aug is 1 Sep in Dubai.
    await addCustomer(ctx, "Late night", new Date("2026-08-31T21:00:00Z"));
    const { charts } = await dashboard(ctx);
    const growth = charts.find((chart) => chart.id === "customerGrowth")?.state;
    if (growth?.status !== "ready") throw new Error("growth chart not ready");
    expect(growth.data.rows.find((row) => row.month === "2026-09")?.values.added).toBe(1);
    expect(growth.data.rows.find((row) => row.month === "2026-08")?.values.added).toBe(0);
  });

  it("never invents figures for modules that don't exist yet", async () => {
    const ctx = await createCompanyWithOwner("Dash Empty");
    const { kpis, charts, activity } = await dashboard(ctx);

    expect(kpis).toHaveLength(9);
    for (const kpi of kpis.filter((item) => item.id !== "totalCustomers")) {
      expect(kpi.state).toMatchObject({ status: "unavailable", module: expect.any(String) });
    }
    expect(kpis.find((kpi) => kpi.id === "totalCustomers")?.state).toMatchObject({ data: { value: 0 } });

    const growth = charts.find((chart) => chart.id === "customerGrowth")?.state;
    expect(growth).toMatchObject({ status: "ready", data: { hasData: false } });
    expect(charts.filter((chart) => chart.state.status === "unavailable")).toHaveLength(5);

    expect(activity.items).toEqual([]);
    expect(activity.unavailable.map((source) => source.id)).toEqual([
      "newInvoices",
      "payments",
      "expenses",
      "employeeActivity",
      "projectUpdates",
    ]);
  });

  it("shows each role only the widgets its permissions allow", async () => {
    const owner = await createCompanyWithOwner("Dash Roles");
    const ids = async (ctx: TenantContext) => {
      const layout = dashboardService.layout(ctx);
      return {
        kpis: layout.kpis.map((kpi) => kpi.id),
        charts: layout.charts.map((chart) => chart.id),
        actions: layout.quickActions.map((action) => action.id),
      };
    };

    const { ctx: employee } = await addMember(owner, "Employee");
    expect(await ids(employee)).toEqual({
      kpis: ["activeProjects", "pendingTasks"],
      charts: ["projectStatus"],
      actions: ["addExpense"],
    });
    // The data calls apply the same filter — not just the page.
    const scope = await dashboardService.scope(employee, "last-6-months", NOW);
    expect((await dashboardService.kpis(scope)).map((kpi) => kpi.id)).toEqual([
      "activeProjects",
      "pendingTasks",
    ]);
    expect((await dashboardService.activity(scope)).tracked).toEqual([]);

    const { ctx: accountant } = await addMember(owner, "Accountant");
    const accountantView = await ids(accountant);
    expect(accountantView.kpis).toEqual([
      "totalRevenue",
      "totalExpenses",
      "netProfit",
      "outstandingInvoices",
      "totalCustomers",
    ]);
    expect(accountantView.charts).not.toContain("employeeAttendance");

    const { ctx: hr } = await addMember(owner, "HR Manager");
    expect((await ids(hr)).kpis).toEqual(["totalEmployees"]);
  });

  it("is refused without dashboard:view", async () => {
    const owner = await createCompanyWithOwner("Dash Customer Role");
    const { ctx: customer } = await addMember(owner, "Customer");
    expect(() => dashboardService.layout(customer)).toThrow(ForbiddenError);
    await expect(dashboardService.scope(customer, "last-6-months")).rejects.toBeInstanceOf(ForbiddenError);
  });
});
