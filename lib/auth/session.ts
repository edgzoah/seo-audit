import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "./options";

export interface SessionUser {
  userId: string;
  email: string | null;
}

export async function getOptionalUser(): Promise<SessionUser | null> {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as { id?: string; email?: string | null } | undefined;
    if (!user?.id) {
      return null;
    }

    return {
      userId: user.id,
      email: user.email ?? null,
    };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getOptionalUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
