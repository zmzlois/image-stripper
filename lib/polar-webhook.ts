import { createHmac, timingSafeEqual } from "crypto";

type PolarWebhookEvent = {
  id?: string;
  type: string;
  data?: Record<string, unknown>;
};

const webhookToleranceSeconds = 5 * 60;

function readRequiredHeader(headers: Headers, name: string) {
  const value = headers.get(name);

  if (!value) {
    throw new Error(`Missing ${name} header.`);
  }

  return value;
}

function webhookSecretKeys(secret: string) {
  const keys = [Buffer.from(secret)];

  if (secret.startsWith("whsec_")) {
    keys.unshift(Buffer.from(secret.slice(6), "base64"));
  } else if (!secret.startsWith("polar_whs_")) {
    keys.push(Buffer.from(secret, "base64"));
  }

  return keys;
}

function secureCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function verifyWebhookSignature({
  payload,
  headers,
  secret,
}: {
  payload: string;
  headers: Headers;
  secret: string;
}) {
  const webhookId = readRequiredHeader(headers, "webhook-id");
  const webhookTimestamp = readRequiredHeader(headers, "webhook-timestamp");
  const webhookSignature = readRequiredHeader(headers, "webhook-signature");
  const timestamp = Number(webhookTimestamp);

  if (!Number.isFinite(timestamp)) {
    throw new Error("Invalid webhook timestamp.");
  }

  const age = Math.abs(Date.now() / 1000 - timestamp);

  if (age > webhookToleranceSeconds) {
    throw new Error("Webhook timestamp is outside the replay window.");
  }

  const signedContent = `${webhookId}.${webhookTimestamp}.${payload}`;
  const expectedSignatures = webhookSecretKeys(secret).map((key) =>
    createHmac("sha256", key).update(signedContent).digest("base64"),
  );
  const signatures = webhookSignature
    .split(" ")
    .map((signature) => signature.trim())
    .filter((signature) => signature.startsWith("v1,"))
    .map((signature) => signature.slice(3));

  if (
    signatures.length === 0 ||
    !signatures.some((signature) =>
      expectedSignatures.some((expectedSignature) =>
        secureCompare(signature, expectedSignature),
      ),
    )
  ) {
    throw new Error("Invalid webhook signature.");
  }
}

export function parsePolarWebhook({
  payload,
  headers,
}: {
  payload: string;
  headers: Headers;
}) {
  const secret = process.env.POLAR_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error("Missing POLAR_WEBHOOK_SECRET.");
  }

  verifyWebhookSignature({ payload, headers, secret });

  const event = JSON.parse(payload) as PolarWebhookEvent;

  if (!event.type) {
    throw new Error("Missing webhook event type.");
  }

  return event;
}
