import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { createUser, getUserByEmail } from "../../../../lib/auth/repo";
import { registerSchema } from "../../../../lib/auth/schemas";
import { extractRemoteIp, verifyRecaptchaToken } from "../../../../lib/security/recaptcha";

export async function POST(request: Request): Promise<Response> {
  try {
    const json = (await request.json()) as unknown;
    const input = registerSchema.parse(json);

    const captchaOk = await verifyRecaptchaToken(input.recaptchaToken, extractRemoteIp(request));
    if (!captchaOk) {
      return NextResponse.json({ error: "reCAPTCHA verification failed." }, { status: 400 });
    }

    const existing = await getUserByEmail(input.email);
    if (existing) {
      return NextResponse.json({ error: "User already exists." }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await createUser(input.email, passwordHash);
    return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("RECAPTCHA_SECRET_KEY") ? 500 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
