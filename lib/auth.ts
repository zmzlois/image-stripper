import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "crypto";
import { createUser, findUserByEmail, findUserPasswordHash } from "@/lib/users";

export const ownerEmail = "lois@sf-voice.sh";

const sessionCookie = "image_stripper_session";
const sessionMaxAge = 60 * 60 * 24 * 30;

type SessionPayload = {
  email: string;
  userId?: string;
  exp: number;
};

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlDecode(value: string) {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  return Buffer.from(
    padded.replaceAll("-", "+").replaceAll("_", "/"),
    "base64",
  ).toString("utf8");
}

function sessionSecret() {
  return (
    process.env.AUTH_SESSION_SECRET ||
    process.env.POLAR_ACCESS_TOKEN ||
    "local-development-session-secret"
  );
}

function sign(value: string) {
  return base64UrlEncode(
    createHmac("sha256", sessionSecret()).update(value).digest(),
  );
}

function parseCookies(header: string | null) {
  return Object.fromEntries(
    (header ?? "")
      .split(";")
      .map((cookie) => cookie.trim().split("="))
      .filter(([name, value]) => name && value)
      .map(([name, value]) => [name, value]),
  );
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function configuredUserPasswordHash(email: string) {
  const users = JSON.parse(process.env.AUTH_USERS_JSON || "{}") as Record<
    string,
    string
  >;

  return users[normalizeEmail(email)];
}

function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");

  return `scrypt:${salt}:${hash}`;
}

function verifyPasswordHash(stored: string, password: string) {
  const [scheme, salt, expectedHash] = stored.split(":");

  if (scheme !== "scrypt" || !salt || !expectedHash) {
    return false;
  }

  const actualHash = scryptSync(password, salt, 64).toString("hex");
  const actualBuffer = Buffer.from(actualHash, "hex");
  const expectedBuffer = Buffer.from(expectedHash, "hex");

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function isOwnerEmail(email: string) {
  return normalizeEmail(email) === ownerEmail;
}

export async function verifyPassword(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  const stored =
    configuredUserPasswordHash(normalizedEmail) ||
    (await findUserPasswordHash(normalizedEmail));

  if (!stored) {
    return false;
  }

  return verifyPasswordHash(stored, password);
}

export async function createPasswordUser(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);

  if (configuredUserPasswordHash(normalizedEmail)) {
    return { ok: false as const, error: "This account already exists." };
  }

  const createdUser = await createUser(normalizedEmail, passwordHash(password));

  if (!createdUser) {
    return { ok: false as const, error: "This account already exists." };
  }

  return { ok: true as const, email: createdUser.email, userId: createdUser.id };
}

export function createSessionCookie(email: string, userId?: string) {
  const payload: SessionPayload = {
    email: email.trim().toLowerCase(),
    userId,
    exp: Math.floor(Date.now() / 1000) + sessionMaxAge,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload);

  return `${sessionCookie}=${encodedPayload}.${signature}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionMaxAge}`;
}

export function clearSessionCookie() {
  return `${sessionCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function ownerUserId() {
  return `owner-${base64UrlEncode(ownerEmail)}`;
}

export function authenticatedEmailFromRequest(request: Request) {
  const cookie = parseCookies(request.headers.get("cookie"))[sessionCookie];

  if (!cookie) {
    return null;
  }

  const [encodedPayload, signature] = cookie.split(".");

  if (!encodedPayload || !signature || sign(encodedPayload) !== signature) {
    return null;
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload;

  if (!payload.email || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload.email.toLowerCase();
}

export async function authenticatedUserFromRequest(request: Request) {
  const email = authenticatedEmailFromRequest(request);

  if (!email) {
    return null;
  }

  if (isOwnerEmail(email)) {
    return { email, userId: ownerUserId() };
  }

  const cookie = parseCookies(request.headers.get("cookie"))[sessionCookie];
  const [encodedPayload] = cookie.split(".");
  const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload;

  if (payload.userId) {
    return { email, userId: payload.userId };
  }

  const user = await findUserByEmail(email);

  return user ? { email: user.email, userId: user.id } : null;
}
