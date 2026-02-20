"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import ReCAPTCHA from "react-google-recaptcha";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { signIn } from "next-auth/react";

import { loginSchema, type LoginInput } from "../../../lib/auth/schemas";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "../../../components/ui/form";
import { Input } from "../../../components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const captchaRef = useRef<ReCAPTCHA | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? "";
  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "1";

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      recaptchaToken: "",
    },
    mode: "onChange",
  });

  async function onSubmit(values: LoginInput): Promise<void> {
    setSubmitError(null);
    const result = await signIn("credentials", {
      email: values.email,
      password: values.password,
      recaptchaToken: values.recaptchaToken,
      redirect: false,
    });

    if (!result || result.error) {
      setSubmitError("Invalid credentials or captcha verification failed.");
      captchaRef.current?.reset();
      form.setValue("recaptchaToken", "", { shouldValidate: true });
      return;
    }

    const nextPath = (() => {
      if (typeof window === "undefined") return "/";
      return new URLSearchParams(window.location.search).get("next") || "/";
    })();
    router.push(nextPath);
    router.refresh();
  }

  async function submitForm(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const valid = await form.trigger();
    if (!valid) return;
    await onSubmit(form.getValues());
  }

  return (
    <div className="mx-auto w-full max-w-md py-10">
      <Card>
        <CardHeader>
          <CardTitle>Log in</CardTitle>
          <CardDescription>Access your SEO reports workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form className="space-y-4" onSubmit={submitForm}>
              {googleEnabled ? (
                <Button
                  type="button"
                  className="w-full"
                  variant="outline"
                  onClick={() => signIn("google", { callbackUrl: "/" })}
                >
                  Continue with Google
                </Button>
              ) : null}

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                          <p className="text-sm text-amber-700">Missing NEXT_PUBLIC_RECAPTCHA_SITE_KEY.</p>
                        )}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {submitError ? <p className="text-sm text-rose-600">{submitError}</p> : null}

              <Button type="submit" className="w-full" disabled={!siteKey || form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Logging in..." : "Log in"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => router.push("/register")}>
                Create account
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
