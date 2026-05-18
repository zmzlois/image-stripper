import { handlePolarWebhookEvent } from "@/lib/polar";
import { parsePolarWebhook } from "@/lib/polar-webhook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  console.log("polar.webhook_received", {
    hasWebhookId: request.headers.has("webhook-id"),
    hasWebhookTimestamp: request.headers.has("webhook-timestamp"),
    hasWebhookSignature: request.headers.has("webhook-signature"),
    webhookId: request.headers.get("webhook-id"),
  });

  try {
    const payload = await request.text();

    console.log("polar.webhook_payload", payload);

    const event = parsePolarWebhook({
      payload,
      headers: request.headers,
    });

    console.log("polar.webhook_parsed", { type: event.type, id: event.id });

    await handlePolarWebhookEvent(event);

    console.log("polar.webhook_handled", { type: event.type, id: event.id });

    return Response.json({ received: true, type: event.type });
  } catch (error) {
    console.warn("polar.webhook_rejected", {
      error:
        error instanceof Error
          ? error.message
          : "Could not process Polar webhook.",
      hasWebhookId: request.headers.has("webhook-id"),
      hasWebhookTimestamp: request.headers.has("webhook-timestamp"),
      hasWebhookSignature: request.headers.has("webhook-signature"),
    });

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not process Polar webhook.",
      },
      { status: 400 },
    );
  }
}
