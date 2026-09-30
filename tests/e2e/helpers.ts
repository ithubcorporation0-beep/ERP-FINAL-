import { expect, type Page } from "@playwright/test";
import { E2E_USERS } from "./users";

/** Shared steps for e2e specs. */

/**
 * Picks an option of a select. Retries opening it: in dev mode a freshly compiled page can take a moment to hydrate,
 * and a click before that does nothing.
 */
export async function choose(page: Page, label: string | RegExp, option: string | RegExp) {
  const combobox = page.getByRole("combobox", { name: label });
  const item = page.getByRole("option", { name: option }).first();
  await expect(async () => {
    if (!(await item.isVisible())) await combobox.click();
    await expect(item).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await item.click();
}

/** Clicks a button that opens a dialog, retrying until the dialog is open (see `choose`). */
export async function openDialog(page: Page, button: string | RegExp) {
  await expect(async () => {
    if (!(await page.getByRole("dialog").isVisible())) {
      await page.getByRole("button", { name: button }).click();
    }
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

export function isoDay(offset: number): string {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
}

/** The employee record linked to the e2e Employee login — created through the UI on the first run. */
export async function linkedEmployee(admin: Page): Promise<string> {
  const found = await (
    await admin.request.get(`/api/employees?search=${encodeURIComponent(E2E_USERS.employee.name)}`)
  ).json();
  const existing = (found.items as { id: string; user: { email: string } | null }[]).find(
    (item) => item.user?.email === E2E_USERS.employee.email,
  );
  if (existing) return existing.id;

  await admin.goto("/hr/employees/new");
  await admin.getByLabel("Full name").fill(E2E_USERS.employee.name);
  await admin.getByLabel("CNIC / employee identification").fill("35202-1234567-1");
  await admin.getByLabel("Position").fill("Support engineer");
  await choose(admin, "Login", E2E_USERS.employee.name);
  await admin.getByRole("button", { name: "Add employee" }).click();
  await expect(admin.getByRole("heading", { name: E2E_USERS.employee.name, level: 1 })).toBeVisible();
  return admin.url().split("/").at(-1) ?? "";
}
