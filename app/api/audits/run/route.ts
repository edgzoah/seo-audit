import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "../../../../lib/auth/options";
import { newAuditSchema } from "../../../../lib/audits/new-audit-schema";
import { startRunJob } from "../../../../lib/audits/run-jobs";
import { extractRemoteIp, verifyRecaptchaToken } from "../../../../lib/security/recaptcha";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as { id?: string } | undefined;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const json = (await request.json()) as unknown;
    const input = newAuditSchema.parse(json);

    const captchaOk = await verifyRecaptchaToken(input.recaptchaToken, extractRemoteIp(request));
    if (!captchaOk) {
      return NextResponse.json({ error: "reCAPTCHA verification failed." }, { status: 400 });
    }

    const job = await startRunJob(input, user.id);
    return NextResponse.json({ jobId: job.id, status: job.status }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("RECAPTCHA_SECRET_KEY") ? 500 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
