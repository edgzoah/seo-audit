import { AuditWizard } from "../../components/domain/AuditWizard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";

export default function NewAuditPage() {
  return (
    <div className="space-y-6">
      <Card className="grid-bg">
        <CardHeader>
          <CardTitle>Create New Audit</CardTitle>
          <CardDescription>Multi-step, validated workflow for deterministic CLI runs.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border bg-background p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Workflow</p>
            <p className="mt-1 text-xl font-semibold">3 steps</p>
          </div>
          <div className="rounded-md border bg-background p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Validation</p>
            <p className="mt-1 text-xl font-semibold">Zod + RHF</p>
          </div>
          <div className="rounded-md border bg-background p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Result</p>
            <p className="mt-1 text-xl font-semibold">Run ID</p>
          </div>
        </CardContent>
      </Card>

      <AuditWizard />
    </div>
  );
}
