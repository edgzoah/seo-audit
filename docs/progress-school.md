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
- Validation gate used after each commit: `npm run build` (pass), `npm run lint` (script missing).

## Requirement Mapping

### Routes and features
- Audit list view: `app/audits/page.tsx`, `components/DataTable.tsx`
- Audit detail view: `app/audits/[runId]/page.tsx`, `components/IssueUrlActions.tsx`
- Compare view: `app/compare/page.tsx`, `components/charts/ScoreDeltaChart.tsx`
- Audit creator: `app/new/page.tsx`, `components/forms/NewAuditWizard.tsx`, `app/api/audits/run/route.ts`
- Data layer: `lib/audits/fs.ts`, `lib/audits/types.ts`

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

### Tailwind checklist equivalence (current CSS implementation)
- Responsive layouts/media queries: `app/globals.css`
- Hover/focus pseudo-classes: `app/globals.css`
- Group/group-hover behavior: `.group:hover .issue-actions` in `app/globals.css`
- Animation (run spinner): `.run-loader` + `@keyframes spin` in `app/globals.css`
- Container concept: `.container` utility class in `app/globals.css`

### Remaining gaps vs original checklist
- `shadcn/ui` components are not installed; current implementation uses custom components and native HTML.
- Recharts chart is not integrated; current `components/charts/ScoreDeltaChart.tsx` is CSS-based.
- Dedicated `/audits` detail route exists (`/audits/[runId]`), while legacy route `/runs/[runId]` is still present for backward compatibility.
