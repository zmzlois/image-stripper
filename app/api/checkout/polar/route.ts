import {
  PolarApiError,
  createPolarCheckout,
  currentPolarServer,
  type PricingPlanId,
} from "@/lib/polar";
import { authenticatedEmailFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

type CheckoutRequest = {
  jobId?: string;
  email?: string;
  selectionCount?: number;
  plan?: PricingPlanId;
  billingOnly?: boolean;
};

function originFromRequest(request: Request) {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    new URL(request.url).origin
  );
}

function customerIpFromRequest(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    undefined
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CheckoutRequest;
    const email = body.email?.trim().toLowerCase();
    const jobId = body.jobId?.trim();
    const selectionCount = body.selectionCount ?? 0;
    const billingOnly = Boolean(body.billingOnly);
    const authenticatedEmail = authenticatedEmailFromRequest(request);

    console.log("polar.checkout_attempt", {
      email,
      jobId,
      selectionCount,
      plan: body.plan,
      billingOnly,
      authenticatedEmail,
      server: currentPolarServer(),
    });

    if (!billingOnly && !jobId) {
      console.log("polar.checkout_rejected", { reason: "missing_job_id", email });
      return Response.json({ error: "Missing job id." }, { status: 400 });
    }

    if (!email || !email.includes("@")) {
      console.log("polar.checkout_rejected", { reason: "invalid_email", email });
      return Response.json({ error: "Enter an email for recovery." }, { status: 400 });
    }

    if (authenticatedEmail !== email) {
      console.log("polar.checkout_rejected", {
        reason: "unauthenticated",
        email,
        authenticatedEmail,
      });
      return Response.json(
        { error: "Sign in before checkout." },
        { status: 401 },
      );
    }

    if (!billingOnly && selectionCount < 1) {
      console.log("polar.checkout_rejected", { reason: "no_selections", email });
      return Response.json(
        { error: "Select at least one section before checkout." },
        { status: 400 },
      );
    }

    const checkout = await createPolarCheckout({
      jobId,
      email,
      selectionCount,
      plan: body.plan,
      origin: originFromRequest(request),
      customerIpAddress: customerIpFromRequest(request),
      billingOnly,
    });

    console.log("polar.checkout_created", {
      email,
      jobId,
      checkoutId: checkout.id,
      status: checkout.status,
      server: currentPolarServer(),
    });

    return Response.json({
      checkoutId: checkout.id,
      url: checkout.url,
      status: checkout.status,
    });
  } catch (error) {
    console.error("polar.checkout_failed", {
      server: currentPolarServer(),
      status: error instanceof PolarApiError ? error.status : undefined,
      details: error instanceof PolarApiError ? error.details : undefined,
      message:
        error instanceof Error
          ? error.message
          : "Could not create Polar checkout.",
    });

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create Polar checkout.",
        polarServer: currentPolarServer(),
      },
      { status: error instanceof PolarApiError ? 502 : 500 },
    );
  }
}
