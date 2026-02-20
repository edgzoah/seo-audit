import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions } from "next-auth";
import bcrypt from "bcryptjs";

import { getUserByEmail } from "./repo";
import { loginSchema } from "./schemas";
import { verifyRecaptchaToken } from "../security/recaptcha";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        recaptchaToken: { label: "reCAPTCHA", type: "text" },
      },
      async authorize(credentials, req) {
        const parsed = loginSchema.safeParse({
          email: credentials?.email,
          password: credentials?.password,
          recaptchaToken: credentials?.recaptchaToken,
        });

        if (!parsed.success) {
          return null;
        }

        const remoteIpHeader = req?.headers?.["x-forwarded-for"];
        const remoteIp = Array.isArray(remoteIpHeader)
          ? (remoteIpHeader[0] ?? null)
          : typeof remoteIpHeader === "string"
            ? (remoteIpHeader.split(",")[0]?.trim() ?? null)
            : null;

        const captchaOk = await verifyRecaptchaToken(parsed.data.recaptchaToken, remoteIp);
        if (!captchaOk) {
          return null;
        }

        const user = await getUserByEmail(parsed.data.email);
        if (!user) {
          return null;
        }

        const passwordOk = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!passwordOk) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.sub;
        session.user.email = token.email ?? session.user.email;
      }
      return session;
    },
  },
};
