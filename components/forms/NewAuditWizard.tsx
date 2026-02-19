"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useRouter } from "next/navigation";

import { newAuditSchema, type NewAuditInput } from "../../lib/audits/new-audit-schema";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
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
    if (step === 0) {
      const ok = await form.trigger(["target"]);
      if (!ok) return;
    }

    if (step === 1) {
      const ok = await form.trigger(["coverage", "max_pages", "depth"]);
      if (!ok) return;
    }

    if (step === 2) {
      const ok = await form.trigger(["primary_url", "keyword", "goal"]);
      if (!ok) return;
    }

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
      if (!response.ok || !result.runId) {
        throw new Error(result.error ?? "Audit failed.");
      }

      router.push(`/audits/${result.runId}`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRunning(false);
      setShowConfirm(false);
    }
  }

  return (
    <section className="card panel">
      <div className="panel-head">
        <h2>New Audit</h2>
        <span>
          Step {step + 1}/{STEPS.length}
        </span>
      </div>

      <div className="wizard-progress" aria-hidden>
        <div className="wizard-progress-fill" style={{ width: `${progressPercent}%` }} />
      </div>

      <ol className="wizard-steps">
        {STEPS.map((stepName, index) => (
          <li key={stepName} className={index === step ? "is-active" : ""}>
            {stepName}
          </li>
        ))}
      </ol>

      <form
        className="new-audit-form"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        {step === 0 ? (
          <div className="wizard-panel">
            <label>
              <span>Target URL</span>
              <input placeholder="https://example.com" {...form.register("target")} />
            </label>
            {form.formState.errors.target ? <p className="form-error">{form.formState.errors.target.message}</p> : null}
          </div>
        ) : null}

        {step === 1 ? (
          <div className="wizard-panel">
            <label>
              <span>Coverage</span>
              <Controller
                control={form.control}
                name="coverage"
                render={({ field }) => (
                  <CoverageModeToggle value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
                )}
              />
            </label>
            <div className="wizard-grid">
              <label>
                <span>Max pages</span>
                <input type="number" min={1} max={5000} {...form.register("max_pages", { valueAsNumber: true })} />
              </label>
              <label>
                <span>Depth</span>
                <input type="number" min={1} max={20} {...form.register("depth", { valueAsNumber: true })} />
              </label>
            </div>
            <label>
              <span>Include patterns (comma/new line)</span>
              <textarea
                rows={3}
                onChange={(event) => form.setValue("include_patterns", splitByCommaOrLine(event.target.value))}
              />
            </label>
            <label>
              <span>Exclude patterns (comma/new line)</span>
              <textarea
                rows={3}
                onChange={(event) => form.setValue("exclude_patterns", splitByCommaOrLine(event.target.value))}
              />
            </label>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="wizard-panel">
            <label>
              <span>Focus URL (optional)</span>
              <input placeholder="https://example.com/pricing" {...form.register("primary_url")} />
            </label>
            {form.formState.errors.primary_url ? (
              <p className="form-error">{form.formState.errors.primary_url.message}</p>
            ) : null}
            <label>
              <span>Primary keyword</span>
              <input placeholder="seo audit dashboard" {...form.register("keyword")} />
            </label>
            <label>
              <span>Goal</span>
              <input placeholder="Increase organic conversions" {...form.register("goal")} />
            </label>
            <label>
              <span>Constraints (comma/new line)</span>
              <textarea rows={3} onChange={(event) => form.setValue("constraints", splitByCommaOrLine(event.target.value))} />
            </label>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="wizard-panel">
            <h3>Review</h3>
            <div className="review-grid">
              <p>
                <b>Target:</b> {values.target}
              </p>
              <p>
                <b>Coverage:</b> {values.coverage}
              </p>
              <p>
                <b>Max pages:</b> {values.max_pages}
              </p>
              <p>
                <b>Depth:</b> {values.depth}
              </p>
              <p>
                <b>Focus URL:</b> {values.primary_url || "none"}
              </p>
              <p>
                <b>Keyword:</b> {values.keyword || "none"}
              </p>
            </div>
            <button type="button" className="btn-primary" onClick={() => setShowConfirm(true)} disabled={isRunning}>
              {isRunning ? "Running..." : "Run audit"}
            </button>
            {isRunning ? <div className="run-loader" aria-label="Audit running" /> : null}
          </div>
        ) : null}

        <div className="wizard-actions">
          <button type="button" className="page-btn" onClick={previousStep} disabled={step === 0 || isRunning}>
            Back
          </button>
          <button type="button" className="btn-primary" onClick={nextStep} disabled={step === STEPS.length - 1 || isRunning}>
            Next
          </button>
        </div>
      </form>

      <Dialog open={Boolean(submitError)} onOpenChange={(open) => (!open ? setSubmitError(null) : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run failed</DialogTitle>
            <DialogDescription>{submitError ?? ""}</DialogDescription>
          </DialogHeader>
          <div className="wizard-actions">
            <button type="button" className="page-btn" onClick={() => setSubmitError(null)}>
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm run</DialogTitle>
            <DialogDescription>Start a new audit now?</DialogDescription>
          </DialogHeader>
          <div className="wizard-actions">
            <button type="button" className="page-btn" onClick={() => setShowConfirm(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={confirmRun} disabled={isRunning}>
              Confirm
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
