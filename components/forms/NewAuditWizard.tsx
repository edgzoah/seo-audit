"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useRef, useState } from "react";
import ReCAPTCHA from "react-google-recaptcha";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";

import { newAuditSchema, type NewAuditInput } from "../../lib/audits/new-audit-schema";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { Input } from "../ui/input";
import { Separator } from "../ui/separator";
import { Textarea } from "../ui/textarea";
import { CoverageModeToggle } from "./CoverageModeToggle";

const STEPS = ["Target", "Scope", "Run"] as const;
const POLL_INTERVAL_MS = 2000;

async function readBody(response: Response): Promise<{ data: Record<string, unknown> | null; text: string }> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return { data: parsed, text };
  } catch {
    return { data: null, text };
  }
}

function splitByCommaOrLine(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function NewAuditWizard() {
  const router = useRouter();
  const captchaRef = useRef<ReCAPTCHA | null>(null);
  const [step, setStep] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobLogTail, setJobLogTail] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? "";

  const form = useForm<NewAuditInput>({
    resolver: zodResolver(newAuditSchema),
    defaultValues: {
      target: "",
      coverage: "quick",
      max_pages: 20,
      depth: 1,
      include_patterns: [],
      exclude_patterns: [],
      constraints: [],
      primary_url: "",
      keyword: "",
      goal: "",
      recaptchaToken: "",
    },
    mode: "onChange",
  });

  const values = form.watch();
  const progressPercent = useMemo(() => Math.round(((step + 1) / STEPS.length) * 100), [step]);
  const recaptchaToken = form.watch("recaptchaToken");

  async function nextStep(): Promise<void> {
    setSubmitError(null);
    if (step === 0 && !(await form.trigger(["target"]))) return;
    if (step === 1 && !(await form.trigger(["coverage", "max_pages", "depth"]))) return;
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }

  function previousStep(): void {
    setSubmitError(null);
    setStep((current) => Math.max(current - 1, 0));
  }

  async function confirmRun(): Promise<void> {
    const valid = await form.trigger();
    if (!valid) {
      return;
    }

    setIsRunning(true);
    setSubmitError(null);
    setJobLogTail(null);
    setJobId(null);
    try {
      const response = await fetch("/api/audits/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form.getValues()),
      });

      const startBody = await readBody(response);
      const startResult = (startBody.data ?? {}) as { jobId?: string; status?: string; error?: string };
      if (!response.ok || !startResult.jobId) {
        throw new Error(startResult.error ?? (startBody.text.slice(0, 200) || "Audit failed to start."));
      }

      setJobId(startResult.jobId);
      setRunStatus(startResult.status ?? "queued");

      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        const poll = await fetch(`/api/audits/run/${startResult.jobId}`, { cache: "no-store" });
        const pollBody = await readBody(poll);
        const state = ((pollBody.data ?? {}) as {
          status?: "queued" | "running" | "succeeded" | "failed";
          runId?: string;
          error?: string;
          logs?: {
            stdoutTail?: string;
            stderrTail?: string;
          };
        });

        if (!poll.ok) {
          throw new Error(state.error ?? (pollBody.text.slice(0, 200) || "Could not fetch audit job status."));
        }

        if (state.status) {
          setRunStatus(state.status);
        }
        setJobLogTail(state.logs?.stderrTail?.trim() || state.logs?.stdoutTail?.trim() || null);

        if (state.status === "succeeded" && state.runId) {
          router.push(`/audits/${state.runId}`);
          return;
        }

        if (state.status === "failed") {
          const debugTail = state.logs?.stderrTail?.trim() || state.logs?.stdoutTail?.trim();
          if (debugTail) {
            throw new Error(`${state.error ?? "Audit failed."}\n\n${debugTail}`);
          }
          throw new Error(state.error ?? "Audit failed.");
        }
      }

    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error));
      captchaRef.current?.reset();
      form.setValue("recaptchaToken", "", { shouldValidate: true });
    } finally {
      setIsRunning(false);
      setRunStatus(null);
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
        <div className="group flex flex-wrap gap-2 rounded-md border bg-muted/20 p-2">
          {STEPS.map((name, index) => (
            <Badge
              key={name}
              variant={index === step ? "default" : "secondary"}
              className={index === step ? "group-hover:bg-primary/90" : "group-hover:bg-secondary/80"}
            >
              {name}
            </Badge>
          ))}
        </div>

        <Form {...form}>
          <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
            {step === 0 ? (
              <section className="space-y-2">
                <FormField
                  control={form.control}
                  name="target"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>
            ) : null}

            {step === 1 ? (
              <section className="space-y-3">
                <FormField
                  control={form.control}
                  name="coverage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Coverage</FormLabel>
                      <FormControl>
                        <CoverageModeToggle value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-3 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="max_pages"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max pages</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={5000}
                            value={Number.isFinite(field.value) ? field.value : ""}
                            onBlur={field.onBlur}
                            onChange={(event) => field.onChange(event.target.valueAsNumber)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="depth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Depth</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={20}
                            value={Number.isFinite(field.value) ? field.value : ""}
                            onBlur={field.onBlur}
                            onChange={(event) => field.onChange(event.target.valueAsNumber)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="include_patterns"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Include patterns</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={3}
                          value={field.value.join("\n")}
                          onBlur={field.onBlur}
                          onChange={(event) => field.onChange(splitByCommaOrLine(event.target.value))}
                        />
                      </FormControl>
                      <FormDescription>One per line or comma-separated.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="exclude_patterns"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Exclude patterns</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={3}
                          value={field.value.join("\n")}
                          onBlur={field.onBlur}
                          onChange={(event) => field.onChange(splitByCommaOrLine(event.target.value))}
                        />
                      </FormControl>
                      <FormDescription>One per line or comma-separated.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>
            ) : null}

            {step === 2 ? (
              <section className="space-y-3">
                <p className="text-sm font-medium">Review</p>
                <div className="grid gap-2 rounded-md border p-3 text-sm md:grid-cols-2">
                  <p><b>Target:</b> {values.target}</p>
                  <p><b>Coverage:</b> {values.coverage}</p>
                  <p><b>Max pages:</b> {values.max_pages}</p>
                  <p><b>Depth:</b> {values.depth}</p>
                </div>

                <FormField
                  control={form.control}
                  name="recaptchaToken"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Verification</FormLabel>
                      <FormControl>
                        <div className="rounded-md border bg-muted/20 p-3">
                          {siteKey ? (
                            <ReCAPTCHA
                              ref={captchaRef}
                              sitekey={siteKey}
                              onChange={(token) => field.onChange(token ?? "")}
                              onExpired={() => field.onChange("")}
                              onErrored={() => field.onChange("")}
                            />
                          ) : (
                            <p className="text-sm text-amber-700">
                              Missing `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` in env.
                            </p>
                          )}
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="button"
                  onClick={confirmRun}
                  disabled={isRunning || !siteKey || !recaptchaToken}
                >
                  {isRunning ? "Running..." : "Run audit"}
                </Button>
                {isRunning ? <div className="run-loader" aria-label="Audit running" /> : null}
                {isRunning && runStatus ? <p className="text-sm text-muted-foreground">Status: {runStatus}</p> : null}
                {isRunning && jobId ? <p className="text-xs text-muted-foreground">Job ID: {jobId}</p> : null}
                {isRunning && jobLogTail ? <pre className="max-h-40 overflow-auto rounded border bg-muted/40 p-2 text-xs">{jobLogTail}</pre> : null}
              </section>
            ) : null}
          </form>
        </Form>

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

    </Card>
  );
}
