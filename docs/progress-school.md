# School Adaptation Progress

Checklist based on `PROJECT-SCHOOL_ADAPTATION_WORKPLAN.txt`.

- [x] STEP 0 - Create branch and baseline (`next-dashboard`)
- [x] STEP 1 - Data access layer (server-side)
- [x] STEP 2 - Audit list page (`/audits`)
- [x] STEP 3 - Audit detail page (`/audits/[runId]`)
- [x] STEP 4 - Comparison page (`/compare`)
- [x] STEP 5 - Audit creator (`/new`)
- [x] STEP 6 - Compound component (`AuditPanel`)
- [x] STEP 7 - Code quality pass + requirement mapping

## Notes

- Source of truth for this stage: `PROJECT-SCHOOL_ADAPTATION_WORKPLAN.txt`.
- Commit strategy: 1 step = max 1-2 commits.
- Validation gates: `npm run build`, `npm run lint`, `npx tsc -p tsconfig.next.json --noEmit`.

## Requirement Mapping

### Routes and features
- Audit list view: `app/audits/page.tsx`, `components/DataTable.tsx`
- Audit detail view: `app/audits/[runId]/page.tsx`, `components/IssueUrlActions.tsx`
- Compare view: `app/compare/page.tsx`, `components/charts/ScoreDeltaChart.tsx`
- Audit creator: `app/new/page.tsx`, `components/forms/NewAuditWizard.tsx`, `app/api/audits/run/route.ts`
- Data layer: `lib/audits/fs.ts`, `lib/audits/types.ts`
- shadcn-style UI layer: `components/ui/*`
- App shell: `components/app-shell/AppShell.tsx`, `components/app-shell/AppSidebar.tsx`, `components/app-shell/AppTopbar.tsx`
- Legacy redirect route: `app/runs/[runId]/page.tsx`

### TypeScript requirements
- Union/intersection:
  - `IssueView = Issue & { sortKey: string; affectedCount: number }` in `app/audits/[runId]/page.tsx`
  - unions for filters/sort and mode types in `app/audits/page.tsx`, `app/compare/page.tsx`, `components/forms/CoverageModeToggle.tsx`
- Utility types:
  - `AuditRow = Pick<Report, "run_id" | "started_at" | "summary" | "inputs">` in `app/audits/page.tsx`
  - `RunSummary = Pick<Report, "run_id" | "started_at" | "summary" | "inputs">` in `lib/audits/fs.ts`
  - `ScoreDeltaMap = Record<Category, number>` in `app/compare/page.tsx`
- Function overloads:
  - `loadReport(runId)` / `loadReport(runId, { raw: true })` in `lib/audits/fs.ts`
- Type predicate:
  - `isReport(x: unknown): x is Report` in `lib/audits/fs.ts`
- Generic reusable component:
  - `DataTable<T>` in `components/DataTable.tsx`
- Domain components:
  - `RunKpiCards` in `components/domain/RunKpiCards.tsx`
  - `IssueTable` in `components/domain/IssueTable.tsx`
  - `CompareSummary` in `components/domain/CompareSummary.tsx`
  - `AuditWizard` in `components/domain/AuditWizard.tsx`

### RHF + Zod requirements
- Zod schema validation: `lib/audits/new-audit-schema.ts`
- Regex + refine rules:
  - `https://` regex and same-origin refine in `lib/audits/new-audit-schema.ts`
- Multi-step RHF form:
  - `components/forms/NewAuditWizard.tsx`
- Custom RHF control:
  - `components/forms/CoverageModeToggle.tsx` integrated with `Controller` in `components/forms/NewAuditWizard.tsx`
- Run orchestration:
  - CLI process spawn and run-id resolution in `app/api/audits/run/route.ts`

### Compound component and container query
- Compound component:
  - `components/AuditPanel.tsx` (`Root`, `Header`, `Body`, `Footer`)
- Usage:
  - `app/audits/[runId]/page.tsx`
  - `app/compare/page.tsx`
- Container query:
  - `.audit-panel-root` and `@container audit-panel ...` in `app/globals.css`

### UI components requirement
- Table usage:
  - `components/ui/table.tsx`, used in `app/compare/page.tsx`
- Card usage:
  - `components/ui/card.tsx`, used in `app/compare/page.tsx`
- Dialog usage:
  - `components/ui/dialog.tsx`, used in `components/forms/NewAuditWizard.tsx`
- Tooltip usage:
  - `components/ui/tooltip.tsx`, used in `components/IssueUrlActions.tsx`
- Popover usage:
  - `components/ui/popover.tsx`, used in `components/common/CompareLegendPopover.tsx`
- DropdownMenu usage:
  - `components/ui/dropdown-menu.tsx`, used in `components/common/CompareRunMenu.tsx`
- Chart (Recharts) usage:
  - `components/charts/ScoreDeltaChart.tsx`

### Tailwind checklist equivalence (current CSS implementation)
- Tailwind configuration: `tailwind.config.ts`, `postcss.config.js`, `components.json`
- Tokenized style system (HSL CSS vars): `app/globals.css`
- Responsive shell/layout via utility classes: `components/app-shell/*`, `app/*/page.tsx`
- Hover/focus/active states via utility classes and shadcn primitives: `components/ui/*`
- Subtle motion (120-180ms equivalent): `.subtle-enter` and component transitions
- Animation (run spinner): `.run-loader` in `app/globals.css`

### Remaining gaps vs original checklist
- None for this implementation scope.

## Design System Usage

- `Button`: `components/ui/button.tsx`
- `Card`: `components/ui/card.tsx`
- `Table`: `components/ui/table.tsx`
- `Dialog`: `components/ui/dialog.tsx`
- `DropdownMenu`: `components/ui/dropdown-menu.tsx`
- `Popover`: `components/ui/popover.tsx`
- `Tooltip`: `components/ui/tooltip.tsx`
- `Badge`: `components/ui/badge.tsx`
- `Tabs`: `components/ui/tabs.tsx`
- `Separator`: `components/ui/separator.tsx`
- `Input`: `components/ui/input.tsx`
- `Select`: `components/ui/select.tsx`
- `Textarea`: `components/ui/textarea.tsx`
- `Sheet`: `components/ui/sheet.tsx`
- `Skeleton`: `components/ui/skeleton.tsx`
