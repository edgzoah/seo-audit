import { NextResponse } from "next/server";

import { getRunJob } from "../../../../../lib/audits/run-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { jobId } = await context.params;
  const job = getRunJob(jobId);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json(job);
}
