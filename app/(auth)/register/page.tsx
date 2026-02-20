"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import ReCAPTCHA from "react-google-recaptcha";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { signIn } from "next-auth/react";

import { registerSchema, type RegisterInput } from "../../../lib/auth/schemas";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "../../../components/ui/form";
import { Input } from "../../../components/ui/input";

export default function RegisterPage() {
  const router = useRouter();
  const captchaRef = useRef<ReCAPTCHA | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? "";
  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "1";

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      password: "",
      recaptchaToken: "",
    },
    mode: "onChange",
  });

  async function onSubmit(values: RegisterInput): Promise<void> {
    setSubmitError(null);
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    const body = (await response.json()) as { error?: string; registerTicket?: string };
    if (!response.ok) {
      setSubmitError(body.error ?? "Registration failed.");
      captchaRef.current?.reset();
      form.setValue("recaptchaToken", "", { shouldValidate: true });
      return;
    }

    const loginResult = await signIn("credentials", {
      email: values.email,
      password: values.password,
      registerTicket: body.registerTicket,
      redirect: false,
    });

    if (!loginResult || loginResult.error) {
      router.push("/login");
      router.refresh();
      return;
    }

    router.push("/dashboard");
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
          <CardTitle>Create account</CardTitle>
          <CardDescription>Each account has isolated SEO reports.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form className="space-y-4" onSubmit={submitForm}>
              {googleEnabled ? (
                <Button
                  type="button"
                  className="w-full"
                  variant="outline"
                  onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
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
                      <Input type="password" autoComplete="new-password" {...field} />
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
                {form.formState.isSubmitting ? "Creating..." : "Create account"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => router.push("/login")}>
                Back to login
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
