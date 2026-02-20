export interface RecaptchaVerifyResponse {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  "error-codes"?: string[];
}

function getRecaptchaSecret(): string {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) {
    throw new Error("RECAPTCHA_SECRET_KEY is not configured.");
  }
  return secret;
}

export async function verifyRecaptchaToken(token: string, remoteIp: string | null): Promise<boolean> {
  const payload = new URLSearchParams({
    secret: getRecaptchaSecret(),
    response: token,
  });

  if (remoteIp) {
    payload.set("remoteip", remoteIp);
  }

  const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: payload.toString(),
    cache: "no-store",
  });

  if (!response.ok) {
    return false;
  }

  const data = (await response.json()) as RecaptchaVerifyResponse;
  return data.success;
}

export function extractRemoteIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (!forwardedFor) return null;
  return forwardedFor.split(",")[0]?.trim() || null;
}
