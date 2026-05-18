import { createHash } from "crypto";

type PolarServer = "sandbox" | "production";

type PolarCheckoutStatus =
  | "open"
  | "expired"
  | "confirmed"
  | "succeeded"
  | "failed";
export type PricingPlanId = "starter" | "pro" | "studio" | "monthly" | "lifetime";

export type PolarCheckout = {
  id: string;
  status: PolarCheckoutStatus;
  url: string;
  customer_email?: string | null;
  metadata?: Record<string, unknown>;
};

type CreatePolarCheckoutInput = {
  jobId?: string;
  email: string;
  selectionCount: number;
  plan?: PricingPlanId;
  origin: string;
  customerIpAddress?: string;
  billingOnly?: boolean;
};

export type PolarCustomerState = {
  id: string;
  external_id?: string | null;
  active_subscriptions?: Array<{
    id: string;
    status: string;
    product_id: string;
    cancel_at_period_end?: boolean;
  }>;
  granted_benefits?: Array<{
    id: string;
    benefit_id: string;
    benefit_type: string;
    benefit_metadata?: Record<string, unknown>;
  }>;
  active_meters?: Array<{
    meter_id: string;
    consumed_units: number;
    credited_units: number;
    balance: number;
  }>;
};

type PolarWebhookEvent = {
  id?: string;
  type: string;
  data?: Record<string, unknown>;
};

export class PolarApiError extends Error {
  status: number;
  details: string;

  constructor(status: number, message: string, details = "") {
    super(message);
    this.name = "PolarApiError";
    this.status = status;
    this.details = details;
  }
}

type PolarResponsePayload = {
  detail?: unknown;
  error?: unknown;
  message?: unknown;
  raw?: string;
};

const planProductEnv: Record<PricingPlanId, string> = {
  starter: "POLAR_STARTER_PRODUCT_ID",
  pro: "POLAR_PRO_PRODUCT_ID",
  studio: "POLAR_STUDIO_PRODUCT_ID",
  monthly: "POLAR_MONTHLY_PRODUCT_ID",
  lifetime: "POLAR_LIFETIME_PRODUCT_ID",
};


function polarServer(): PolarServer {
  return process.env.POLAR_SERVER === "production" ? "production" : "sandbox";
}

export function currentPolarServer() {
  return polarServer();
}

function polarBaseUrl() {
  return polarServer() === "production"
    ? "https://api.polar.sh"
    : "https://sandbox-api.polar.sh";
}

function polarAccessToken() {
  const token = process.env.POLAR_ACCESS_TOKEN;

  if (!token) {
    throw new Error("Missing POLAR_ACCESS_TOKEN.");
  }

  return token;
}

function polarAccessTokenFingerprint() {
  return createHash("sha256").update(polarAccessToken()).digest("hex").slice(0, 12);
}

function polarProductId() {
  const productId = process.env.POLAR_PRODUCT_ID;

  if (!productId) {
    throw new Error("Missing POLAR_PRODUCT_ID.");
  }

  return productId;
}

function polarProductIdForPlan(plan: PricingPlanId = "pro") {
  if (!(plan in planProductEnv)) {
    throw new PolarApiError(400, `Unknown Polar plan: ${String(plan)}.`);
  }

  const productId = process.env[planProductEnv[plan]];

  return productId || polarProductId();
}

function polarErrorMessage(payload: PolarResponsePayload) {
  const message = payload.detail || payload.error || payload.message;

  if (typeof message === "string") {
    return message;
  }

  if (message) {
    return JSON.stringify(message);
  }

  return null;
}

function parsePolarPayload(text: string) {
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as PolarResponsePayload;
  } catch {
    return { raw: text };
  }
}

async function polarFetch<T>(path: string, init?: RequestInit) {
  const server = polarServer();
  const method = init?.method || "GET";
  let response: Response;

  try {
    response = await fetch(`${polarBaseUrl()}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${polarAccessToken()}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  } catch (error) {
    console.error("polar.request_network_failed", {
      server,
      method,
      path,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  const responseText = await response.text();

  console[response.ok ? "log" : "error"]("polar.response_meta", {
    server,
    method,
    path,
    status: response.status,
    statusText: response.statusText,
    tokenFingerprint: polarAccessTokenFingerprint(),
  });
  console[response.ok ? "log" : "error"]("polar.response_payload", responseText);

  const payload = parsePolarPayload(responseText);

  if (!response.ok) {
    throw new PolarApiError(
      response.status,
      polarErrorMessage(payload) || `Polar request failed with ${response.status}.`,
      responseText,
    );
  }

  return payload as T;
}

export async function createPolarCheckout({
  jobId,
  email,
  selectionCount,
  plan,
  origin,
  customerIpAddress,
  billingOnly,
}: CreatePolarCheckoutInput) {
  return polarFetch<PolarCheckout>("/v1/checkouts", {
    method: "POST",
    body: JSON.stringify({
      products: [polarProductIdForPlan(plan)],
      customer_email: email,
      external_customer_id: email.toLowerCase(),
      customer_ip_address: customerIpAddress,
      metadata: {
        ...(jobId ? { job_id: jobId } : {}),
        selection_count: selectionCount,
        plan: plan || "pro",
        checkout_mode: billingOnly ? "billing" : "job",
        app: "image-stripper",
      },
      success_url:
        billingOnly || !jobId
          ? `${origin}/?checkout_id={CHECKOUT_ID}&paid=polar&billing=1`
          : `${origin}/?checkout_id={CHECKOUT_ID}&job=${jobId}&paid=polar`,
      return_url: origin,
      allow_discount_codes: false,
    }),
  });
}

export async function getPolarCheckout(id: string) {
  return polarFetch<PolarCheckout>(`/v1/checkouts/${id}`);
}

export async function getPolarCustomerStateByExternalId(externalId: string) {
  return polarFetch<PolarCustomerState>(
    `/v1/customers/external/${encodeURIComponent(externalId)}/state`,
  );
}

export async function ingestPolarUsageEvent({
  email,
  jobId,
  credits,
  selectionCount,
  fulfilledCount,
  failedCount,
}: {
  email: string;
  jobId?: string;
  credits: number;
  selectionCount: number;
  fulfilledCount: number;
  failedCount: number;
}) {
  if (credits < 1) {
    return;
  }

  await polarFetch<{ inserted: number }>("/v1/events/ingest", {
    method: "POST",
    body: JSON.stringify({
      events: [
        {
          name: process.env.POLAR_USAGE_EVENT_NAME || "image_generation",
          external_customer_id: email.toLowerCase(),
          metadata: {
            credits,
            job_id: jobId || "",
            selection_count: selectionCount,
            fulfilled_count: fulfilledCount,
            failed_count: failedCount,
          },
        },
      ],
    }),
  });
}


export function isPaidCheckout(checkout: PolarCheckout, jobId?: string) {
  const metadataJobId = checkout.metadata?.job_id;

  return (
    checkout.status === "succeeded" &&
    (!jobId || typeof metadataJobId !== "string" || metadataJobId === jobId)
  );
}

export function customerCreditBalance(state: PolarCustomerState) {
  const meterId = process.env.POLAR_CREDIT_METER_ID;

  if (!meterId) {
    return null;
  }

  return (
    state.active_meters?.find((meter) => meter.meter_id === meterId)?.balance ??
    0
  );
}

export function activeSubscriptionLabel(state: PolarCustomerState) {
  const activeSubscription = state.active_subscriptions?.find((subscription) =>
    ["active", "trialing"].includes(subscription.status),
  );

  if (!activeSubscription) {
    return null;
  }

  if (
    process.env.POLAR_MONTHLY_PRODUCT_ID &&
    activeSubscription.product_id === process.env.POLAR_MONTHLY_PRODUCT_ID
  ) {
    return "monthly subscription";
  }

  return "subscription";
}

export function hasActiveSubscription(state: PolarCustomerState) {
  return activeSubscriptionLabel(state) !== null;
}

export function hasLifetimeAccess(state: PolarCustomerState) {
  const benefitId = process.env.POLAR_LIFETIME_BENEFIT_ID;

  if (benefitId) {
    return (
      state.granted_benefits?.some(
        (benefit) => benefit.benefit_id === benefitId,
      ) ?? false
    );
  }

  return (
    state.granted_benefits?.some(
      (benefit) =>
        benefit.benefit_metadata?.plan === "lifetime" ||
        benefit.benefit_metadata?.access === "lifetime",
    ) ?? false
  );
}

export async function handlePolarWebhookEvent(event: PolarWebhookEvent) {
  console.log("polar.webhook", {
    type: event.type,
    id: event.id,
    dataId: typeof event.data?.id === "string" ? event.data.id : undefined,
  });
}
