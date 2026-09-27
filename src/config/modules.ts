/**
 * ERP modules that other screens link to before they exist, with the build-plan phase that delivers them.
 * Used to say "not tracked yet — arrives with X (phase NN)" instead of showing invented data.
 */
export const MODULE_RELEASES = {
  customers: { label: "CRM", phase: 6 },
  sales: { label: "Sales", phase: 7 },
  finance: { label: "Finance", phase: 8 },
  hr: { label: "HR", phase: 9 },
  projects: { label: "Projects", phase: 11 },
  inventory: { label: "Inventory", phase: 12 },
} as const;

export type ModuleKey = keyof typeof MODULE_RELEASES;
