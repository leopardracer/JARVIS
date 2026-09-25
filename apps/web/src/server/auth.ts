import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { schema } from "@jarvis/db";
import type { User } from "@jarvis/types";
import { services } from "./container";
import { hashPassword, verifyPassword } from "./password";


export const SESSION_COOKIE = "jarvis_session";
const SESSION_DAYS = 30;

export class AuthError extends Error {
  constructor(message: string, readonly status = 401) {
    super(message);
  }
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function toUser(row: typeof schema.users.$inferSelect): User {
  return { id: row.id, email: row.email, displayName: row.displayName, mode: row.mode, createdAt: row.createdAt };
}

export async function audit(userId: string | null, event: string, metadata: Record<string, unknown> = {}, target?: { type: string; id: string }) {
  const { db } = await services();
  const h = await headers();
  await db.insert(schema.auditLogs).values({
    userId,
    event,
    metadata,
    targetType: target?.type ?? null,
    targetId: target?.id ?? null,
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
}

export async function signUp(email: string, password: string, displayName?: string): Promise<User> {
  const { db } = await services();
  const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
  if (existing) throw new AuthError("An account with this email already exists", 409);
  const [row] = await db
    .insert(schema.users)
    .values({ email, passwordHash: await hashPassword(password), displayName: displayName || null, mode: "live" })
    .returning();
  await audit(row.id, "auth.sign_up");
  return toUser(row);
}

export async function signIn(email: string, password: string): Promise<User> {
  const { db } = await services();
  const [row] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  // Always run scrypt so response time does not reveal whether the email exists.
  const ok = await verifyPassword(password, row?.passwordHash ?? "scrypt$AAAA$AAAA");
  if (!row || !row.passwordHash || !ok) {
    await audit(row?.id ?? null, "auth.sign_in_failed", { email });
    throw new AuthError("Email or password is incorrect");
  }
  await audit(row.id, "auth.sign_in");
  return toUser(row);
}

export async function createSession(userId: string) {
  const { db } = await services();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(schema.sessions).values({ userId, tokenHash: sha256(token), expiresAt });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const { db } = await services();
    await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, sha256(token)));
  }
  store.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const { db } = await services();
  const [row] = await db
    .select({ user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.tokenHash, sha256(token)), gt(schema.sessions.expiresAt, new Date())));
  return row ? toUser(row.user) : null;
}

export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("Sign in to continue");
  return user;
}

/** For server components: the layout already gates access, this narrows the type. */
export async function pageUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}
