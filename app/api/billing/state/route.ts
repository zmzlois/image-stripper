import { authenticatedEmailFromRequest, isOwnerEmail } from "@/lib/auth";
import {
  activeSubscriptionLabel,
  customerCreditBalance,
  getPolarCustomerStateByExternalId,
  hasLifetimeAccess,
} from "@/lib/polar";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const email = authenticatedEmailFromRequest(request);

  console.log("billing.state.request", { email });

  if (!email) {
    console.log("billing.state.anonymous");
    return Response.json({ kind: "anonymous" });
  }

  if (isOwnerEmail(email)) {
    console.log("billing.state.owner", { email });
    return Response.json({
      kind: "unlimited",
      email,
      label: "owner access",
    });
  }

  try {
    const customerState = await getPolarCustomerStateByExternalId(email);
    const subscriptionLabel = activeSubscriptionLabel(customerState);

    if (hasLifetimeAccess(customerState)) {
      console.log("billing.state.lifetime", { email });
      return Response.json({
        kind: "unlimited",
        email,
        label: "lifetime access",
      });
    }

    if (subscriptionLabel) {
      console.log("billing.state.subscription", { email, label: subscriptionLabel });
      return Response.json({
        kind: "unlimited",
        email,
        label: subscriptionLabel,
      });
    }

    const balance = customerCreditBalance(customerState);

    if (balance !== null) {
      console.log("billing.state.credits", { email, balance });
      return Response.json({
        kind: "credits",
        email,
        balance,
      });
    }

    console.log("billing.state.none", { email });
    return Response.json({ kind: "none", email });
  } catch (error) {
    console.error("billing.state.error", {
      email,
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      {
        kind: "error",
        email,
        error:
          error instanceof Error ? error.message : "Could not load billing state.",
      },
      { status: 502 },
    );
  }
}
