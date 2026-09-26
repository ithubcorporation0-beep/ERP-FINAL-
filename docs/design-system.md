# Design system

The IT Hub ERP look: a calm, neutral enterprise interface — slate greys, one blue brand color,
dense but readable text, and consistent status colors. Everything below is implemented; open
**`/design-system`** while running `npm run dev` to see every component live (the page shows
"Page not found" in production builds, and all content on it is labelled sample data).

## Foundations

All values are CSS variables in `src/app/globals.css`. **Never hard-code colors** in components —
use the Tailwind utilities that read the tokens (`bg-card`, `text-muted-foreground`, `text-success`, …).

### Color

| Token                            | Light                           | Use                               |
| -------------------------------- | ------------------------------- | --------------------------------- |
| `background` / `foreground`      | white / slate-900               | Page and body text                |
| `card`, `popover`                | white                           | Raised surfaces                   |
| `muted` / `muted-foreground`     | slate-100 / slate-500–600       | Subtle fills, secondary text      |
| `primary` / `primary-foreground` | blue-600 / white                | Primary buttons, active nav icons |
| `border` / `input`               | slate-200 / slate-300           | Dividers / form control outlines  |
| `ring`                           | blue-500                        | Keyboard focus ring               |
| `destructive`                    | red-600                         | Destructive buttons and text      |
| `sidebar-*`                      | slate-50 family                 | App sidebar                       |
| `chart-1…5`                      | blue, teal, amber, violet, rose | Chart series (phase 05)           |

Dark mode has its own value for every token (`.dark` block) and is chosen from the user menu
(Light / Dark / System, default System), powered by `next-themes`.

### Status colors

Five tones, each with text (`text-success`), background (`bg-success-muted`) and border
(`border-success-border`) utilities. Use them through **`StatusBadge`**.

| Tone      | Typical meaning                         |
| --------- | --------------------------------------- |
| `success` | Paid, approved, active, in stock        |
| `info`    | Sent, in progress, scheduled            |
| `warning` | Pending approval, due soon, low stock   |
| `danger`  | Overdue, rejected, failed, out of stock |
| `neutral` | Draft, archived, inactive               |

Modules map their own states to tones, e.g. `{ PAID: "success", OVERDUE: "danger", DRAFT: "neutral" }`.
The label always carries the meaning; color only reinforces it.

### Accessible contrast

`tests/unit/contrast.test.ts` computes WCAG contrast for every text/background token pair in **both**
themes and fails the build if any pair drops below **4.5:1** (AA). Change a token → the test tells you
if it is still readable.

### Typography

Geist Sans for the interface, Geist Mono for codes and IDs. Tables and KPI values use tabular figures
so digits line up.

| Role          | Classes                                                    |
| ------------- | ---------------------------------------------------------- |
| Page title    | `text-2xl font-semibold tracking-tight` (via `PageHeader`) |
| Section title | `text-lg font-semibold tracking-tight`                     |
| Body          | `text-sm` — the default for dense business screens         |
| Secondary     | `text-sm text-muted-foreground`                            |
| Label         | `text-xs font-medium uppercase tracking-wide`              |
| Code / ID     | `font-mono`                                                |

### Spacing, radius and elevation

- **Spacing:** Tailwind's 4px scale. Page padding `px-4 sm:px-6 lg:px-8`; content max width `max-w-7xl`;
  gaps of `gap-4` between cards, `gap-2` between controls, `space-y-6` between page sections.
- **Control height:** 32px (`h-8`) for buttons, inputs and selects so toolbars line up.
- **Radius:** one `--radius` (0.5rem) drives the whole scale (`rounded-md`, `rounded-lg`, `rounded-xl`).
- **Shadows** (soft, slate-tinted): `shadow-xs` cards and inputs · `shadow-md` menus/popovers ·
  `shadow-lg` dialogs.

### Breakpoints

| Width      | Layout                                                             |
| ---------- | ------------------------------------------------------------------ |
| < 640px    | Phone: stacked headers and toolbars, icon-only search, menu button |
| 640–1023px | Tablet: search bar visible, navigation still in the slide-out menu |
| ≥ 1024px   | Desktop: fixed sidebar, company name in the header                 |

## Application shell

`src/components/layout/`

| Component             | What it does                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `AppShell`            | Frame for every signed-in page: skip link, sidebar, header, breadcrumbs, content area    |
| `Sidebar`             | Desktop navigation (≥ lg), sticky, scrolls independently                                 |
| `SidebarNav`          | Grouped links with the active page highlighted (`aria-current="page"`)                   |
| `MobileNav`           | Menu button + slide-out sheet with the same navigation (< lg); closes after navigating   |
| `Header`              | Logo (mobile), current company, global search, notifications, user menu                  |
| `GlobalSearch`        | Ctrl/⌘ + K command palette. Searches pages today; record search arrives with each module |
| `NotificationsButton` | Bell with the **real** unread count for the signed-in user                               |
| `UserMenu`            | Name, email, company, Settings, theme switch, sign out                                   |
| `Breadcrumbs`         | "Section › Page" derived from the URL; detail pages can pass their own `items`           |
| `Logo`                | Brand mark (placeholder "IH" mark until a real logo asset exists)                        |

Navigation is defined once in `src/config/navigation.ts` (sections, labels, icons, descriptions and
the permission each item needs). The server filters it by the user's role, so people only see
modules they may open. The sidebar, mobile menu, search and breadcrumbs all read that one config.

## Components

| Need                        | Component                                       | Location                                    |
| --------------------------- | ----------------------------------------------- | ------------------------------------------- |
| Page title + actions        | `PageHeader`                                    | `components/shared/page-header.tsx`         |
| KPI tile                    | `KpiCard`, `KpiCardSkeleton`                    | `components/shared/kpi-card.tsx`            |
| Status pill                 | `StatusBadge`                                   | `components/shared/status-badge.tsx`        |
| Table                       | `DataTable` + `DataTableColumnHeader`           | `components/tables/`                        |
| Table columns               | `createDataTableColumns<T>()`                   | `components/tables/data-table-features.ts`  |
| Pagination                  | `Pagination`                                    | `components/tables/pagination.tsx`          |
| Search box                  | `SearchInput` (debounced)                       | `components/shared/search-input.tsx`        |
| Toolbar above a table       | `FilterBar`                                     | `components/shared/filter-bar.tsx`          |
| Dialog / modal              | `Modal`                                         | `components/shared/modal.tsx`               |
| "Are you sure?"             | `ConfirmDialog`, `ConfirmButton`                | `components/shared/confirm-*.tsx`           |
| Form row (label/hint/error) | `FormField` (React Hook Form)                   | `components/forms/form-field.tsx`           |
| Date input                  | `DatePicker`                                    | `components/forms/date-picker.tsx`          |
| Select from a list          | `SelectInput`                                   | `components/forms/select-input.tsx`         |
| Password field (show/hide)  | `PasswordInput`                                 | `components/forms/password-input.tsx`       |
| Tabs                        | `Tabs`, `TabsList`, `TabsTrigger`, …            | `components/ui/tabs.tsx`                    |
| Dropdown menu               | `DropdownMenu`, `DropdownMenuItem`, …           | `components/ui/dropdown-menu.tsx`           |
| Toasts                      | `toast.success()` etc. from `sonner`            | `<Toaster />` is mounted in the root layout |
| Empty / loading / error     | `EmptyState`, `LoadingState`, `ErrorState`      | `components/shared/`                        |
| Success message             | `SuccessMessage`                                | `components/shared/success-message.tsx`     |
| Skeletons                   | `PageSkeleton`, `TableSkeleton`, `CardSkeleton` | `components/shared/skeletons.tsx`           |
| Unbuilt module page         | `ModulePlaceholder`                             | `components/shared/module-placeholder.tsx`  |
| Page the role can't open    | `AccessDenied`                                  | `components/shared/access-denied.tsx`       |

### Rules of use

- **Every list** = `FilterBar` + `DataTable` + `Pagination`. `DataTable` already handles loading
  (skeleton rows), empty (`emptyState`) and error (`error` + `onRetry`) — pass them; don't hand-roll.
- **Every destructive action** goes through `ConfirmDialog`/`ConfirmButton`. `onConfirm` may be async:
  the dialog shows a spinner, stays open until it finishes, and shows the error if it fails.
- **Every form field** uses `FormField` so the label, hint and error are linked to the input for
  screen readers, and the same Zod schema is re-checked on the server.
- **Toasts** are for brief results ("Invoice sent"). Errors that block the user belong inline.
- **Don't show fake data.** Unbuilt modules use `ModulePlaceholder`; dashboards only show real figures.
- **Tables sort the rows they are given.** For server-side sorting pass `manualSorting`, `sorting` and
  `onSortingChange`, and fetch sorted data.
