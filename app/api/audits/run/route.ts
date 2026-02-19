import { NextResponse } from "next/server";

import { newAuditSchema } from "../../../../lib/audits/new-audit-schema";
import { startRunJob } from "../../../../lib/audits/run-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const json = (await request.json()) as unknown;
    const input = newAuditSchema.parse(json);
    const job = startRunJob(input);
    return NextResponse.json({ jobId: job.id, status: job.status }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
