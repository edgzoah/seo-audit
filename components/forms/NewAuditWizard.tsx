"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useRouter } from "next/navigation";

import { newAuditSchema, type NewAuditInput } from "../../lib/audits/new-audit-schema";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Separator } from "../ui/separator";
import { Textarea } from "../ui/textarea";
import { CoverageModeToggle } from "./CoverageModeToggle";

const STEPS = ["Target", "Scope", "Focus", "Run"] as const;

function splitByCommaOrLine(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function NewAuditWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<NewAuditInput>({
    resolver: zodResolver(newAuditSchema),
    defaultValues: {
      target: "",
      coverage: "surface",
      max_pages: 100,
      depth: 3,
      include_patterns: [],
      exclude_patterns: [],
      primary_url: "",
      keyword: "",
      goal: "",
      constraints: [],
    },
    mode: "onChange",
  });

  const values = form.watch();
  const progressPercent = useMemo(() => Math.round(((step + 1) / STEPS.length) * 100), [step]);

  async function nextStep(): Promise<void> {
    setSubmitError(null);
    if (step === 0 && !(await form.trigger(["target"]))) return;
    if (step === 1 && !(await form.trigger(["coverage", "max_pages", "depth"]))) return;
    if (step === 2 && !(await form.trigger(["primary_url", "keyword", "goal"]))) return;
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }

  function previousStep(): void {
    setSubmitError(null);
    setStep((current) => Math.max(current - 1, 0));
  }

  async function confirmRun(): Promise<void> {
    const valid = await form.trigger();
    if (!valid) {
      setShowConfirm(false);
      return;
    }

    setIsRunning(true);
    setSubmitError(null);
    try {
      const response = await fetch("/api/audits/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form.getValues()),
      });

      const result = (await response.json()) as { runId?: string; error?: string };
      if (!response.ok || !result.runId) throw new Error(result.error ?? "Audit failed.");
      router.push(`/audits/${result.runId}`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRunning(false);
      setShowConfirm(false);
    }
  }

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between">
          <CardTitle>Audit Wizard</CardTitle>
          <Badge variant="outline">
            Step {step + 1}/{STEPS.length}
          </Badge>
        </div>
        <div className="h-2 rounded-full bg-muted">
          <div className="h-2 rounded-full bg-primary subtle-enter" style={{ width: `${progressPercent}%` }} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {STEPS.map((name, index) => (
            <Badge key={name} variant={index === step ? "default" : "secondary"}>{name}</Badge>
          ))}
        </div>

        {step === 0 ? (
          <section className="space-y-2">
            <p className="text-sm font-medium">Target URL</p>
            <Input placeholder="https://example.com" {...form.register("target")} />
            {form.formState.errors.target ? <p className="text-sm text-rose-600">{form.formState.errors.target.message}</p> : null}
          </section>
        ) : null}

        {step === 1 ? (
          <section className="space-y-3">
            <div className="space-y-2">
              <p className="text-sm font-medium">Coverage</p>
              <Controller control={form.control} name="coverage" render={({ field }) => <CoverageModeToggle value={field.value} onChange={field.onChange} />} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-sm font-medium">Max pages</p>
                <Input type="number" min={1} max={5000} {...form.register("max_pages", { valueAsNumber: true })} />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Depth</p>
                <Input type="number" min={1} max={20} {...form.register("depth", { valueAsNumber: true })} />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Include patterns</p>
              <Textarea rows={3} onChange={(e) => form.setValue("include_patterns", splitByCommaOrLine(e.target.value))} />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Exclude patterns</p>
              <Textarea rows={3} onChange={(e) => form.setValue("exclude_patterns", splitByCommaOrLine(e.target.value))} />
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Focus URL</p>
              <Input placeholder="https://example.com/pricing" {...form.register("primary_url")} />
              {form.formState.errors.primary_url ? <p className="text-sm text-rose-600">{form.formState.errors.primary_url.message}</p> : null}
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Primary keyword</p>
              <Input placeholder="enterprise seo audit" {...form.register("keyword")} />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Goal</p>
              <Input placeholder="Improve conversion-driven pages" {...form.register("goal")} />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Constraints</p>
              <Textarea rows={3} onChange={(e) => form.setValue("constraints", splitByCommaOrLine(e.target.value))} />
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="space-y-3">
            <p className="text-sm font-medium">Review</p>
            <div className="grid gap-2 rounded-md border p-3 text-sm md:grid-cols-2">
              <p><b>Target:</b> {values.target}</p>
              <p><b>Coverage:</b> {values.coverage}</p>
              <p><b>Max pages:</b> {values.max_pages}</p>
              <p><b>Depth:</b> {values.depth}</p>
              <p><b>Focus URL:</b> {values.primary_url || "none"}</p>
              <p><b>Keyword:</b> {values.keyword || "none"}</p>
            </div>
            <Button type="button" onClick={() => setShowConfirm(true)} disabled={isRunning}>
              {isRunning ? "Running..." : "Run audit"}
            </Button>
            {isRunning ? <div className="run-loader" aria-label="Audit running" /> : null}
          </section>
        ) : null}

        <Separator />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={previousStep} disabled={step === 0 || isRunning}>Back</Button>
          <Button type="button" onClick={nextStep} disabled={step === STEPS.length - 1 || isRunning}>Next</Button>
        </div>
      </CardContent>

      <Dialog open={Boolean(submitError)} onOpenChange={(open) => (!open ? setSubmitError(null) : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run failed</DialogTitle>
            <DialogDescription>{submitError ?? "Unexpected error"}</DialogDescription>
          </DialogHeader>
          <Button type="button" variant="outline" onClick={() => setSubmitError(null)}>Close</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm run</DialogTitle>
            <DialogDescription>Start a new audit now?</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowConfirm(false)}>Cancel</Button>
            <Button type="button" onClick={confirmRun} disabled={isRunning}>Confirm</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
