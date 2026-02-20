import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import type { NextAuthOptions } from "next-auth";
import bcrypt from "bcryptjs";

import { ensureUserByEmail, getUserByEmail } from "./repo";
import { loginSchema } from "./schemas";
import { verifyRecaptchaToken } from "../security/recaptcha";
import { consumeRegisterTicket } from "./register-ticket";

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
        GoogleProvider({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        }),
      ]
      : []),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        recaptchaToken: { label: "reCAPTCHA", type: "text" },
        registerTicket: { label: "Register ticket", type: "text" },
      },
      async authorize(credentials, req) {
        const parsed = loginSchema.safeParse({
          email: credentials?.email,
          password: credentials?.password,
          recaptchaToken: credentials?.recaptchaToken,
          registerTicket: credentials?.registerTicket,
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

        if (parsed.data.registerTicket) {
          const ticketEmail = consumeRegisterTicket(parsed.data.registerTicket);
          if (!ticketEmail || ticketEmail !== parsed.data.email) {
            return null;
          }
        } else {
          const captchaOk = await verifyRecaptchaToken(parsed.data.recaptchaToken ?? "", remoteIp);
          if (!captchaOk) {
            return null;
          }
        }

        const user = await getUserByEmail(parsed.data.email);
        if (!user) {
          return null;
        }

        if (!user.passwordHash.startsWith("$2")) {
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
    async signIn({ account, user }) {
      if (account?.provider === "google") {
        const email = user.email?.toLowerCase().trim();
        if (!email) {
          return false;
        }
        return true;
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        const email = (user.email ?? token.email ?? "").toString().toLowerCase().trim();
        if (email.length > 0) {
          const localUser = await ensureUserByEmail(email, "__GOOGLE_OAUTH__");
          token.sub = localUser.id;
          token.email = localUser.email;
        } else {
          token.sub = user.id;
          token.email = user.email;
        }
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
