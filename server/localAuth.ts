import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { and, eq, lt } from "drizzle-orm";
import { localAuthAccounts, localAuthSessions, users } from "../drizzle/schema";
import { getDb } from "./db";
import { getSessionCookieOptions } from "./_core/cookies";

export const LOCAL_SESSION_COOKIE = "trezo-local-session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

function digestToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export function hashSecret(secret: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(secret, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifySecret(secret: string, encoded: string) {
  const [scheme, salt, expectedHex] = encoded.split("$");
  if (scheme !== "scrypt" || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = scryptSync(secret, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function setSessionCookie(req: Request, res: Response, token: string) {
  res.cookie(LOCAL_SESSION_COOKIE, token, { ...getSessionCookieOptions(req), maxAge: SESSION_TTL_MS });
}

export function clearLocalSession(req: Request, res: Response) {
  res.clearCookie(LOCAL_SESSION_COOKIE, { ...getSessionCookieOptions(req), maxAge: -1 });
}

export async function createLocalSession(req: Request, res: Response, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة");
  const token = randomBytes(32).toString("base64url");
  await db.insert(localAuthSessions).values({ tokenHash: digestToken(token), userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) });
  setSessionCookie(req, res, token);
  return token;
}

export async function getLocalUser(req: Request) {
  const token = req.cookies?.[LOCAL_SESSION_COOKIE] as string | undefined;
  if (!token) return null;
  const db = await getDb();
  if (!db) return null;
  const [session] = await db.select({ sessionId: localAuthSessions.id, userId: localAuthSessions.userId, expiresAt: localAuthSessions.expiresAt })
    .from(localAuthSessions).where(eq(localAuthSessions.tokenHash, digestToken(token))).limit(1);
  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    await db.delete(localAuthSessions).where(eq(localAuthSessions.id, session.sessionId));
    return null;
  }
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  return user ?? null;
}

export async function revokeLocalSession(req: Request, res: Response) {
  const token = req.cookies?.[LOCAL_SESSION_COOKIE] as string | undefined;
  const db = await getDb();
  if (db && token) {
    await db.delete(localAuthSessions).where(eq(localAuthSessions.tokenHash, digestToken(token)));
    clearLocalSession(req, res);
  }
}

export async function cleanupExpiredLocalSessions() {
  const db = await getDb();
  if (db) await db.delete(localAuthSessions).where(lt(localAuthSessions.expiresAt, new Date()));
}

export async function markLocalLoginFailure(accountId: number, failedAttempts: number) {
  const db = await getDb();
  if (!db) return;
  const nextAttempts = failedAttempts + 1;
  await db.update(localAuthAccounts).set({ failedAttempts: nextAttempts, lockedUntil: nextAttempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : null }).where(eq(localAuthAccounts.id, accountId));
}

export async function resetLocalLoginFailures(accountId: number) {
  const db = await getDb();
  if (db) await db.update(localAuthAccounts).set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(localAuthAccounts.id, accountId));
}

export const localAuthLimits = { MAX_FAILED_ATTEMPTS, LOCKOUT_MS, SESSION_TTL_MS } as const;
