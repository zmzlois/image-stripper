import {
  createPasswordUser,
  createSessionCookie,
  isOwnerEmail,
} from "@/lib/auth";

export const runtime = "nodejs";

type SignUpRequest = {
  email?: string;
  password?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as SignUpRequest;
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";

  console.log("auth.sign_up.attempt", { email });

  if (!email || !email.includes("@")) {
    console.log("auth.sign_up.invalid_email", { email });
    return Response.json({ error: "Enter a valid email." }, { status: 400 });
  }

  if (isOwnerEmail(email)) {
    console.log("auth.sign_up.owner_email_rejected", { email });
    return Response.json(
      { error: "Use owner sign in for this account." },
      { status: 400 },
    );
  }

  if (password.length < 8) {
    console.log("auth.sign_up.password_too_short", { email });
    return Response.json(
      { error: "Use at least 8 characters." },
      { status: 400 },
    );
  }

  try {
    const created = await createPasswordUser(email, password);

    if (!created.ok) {
      console.log("auth.sign_up.conflict", { email, error: created.error });
      return Response.json({ error: created.error }, { status: 409 });
    }

    console.log("auth.sign_up.success", { email: created.email });
    return Response.json(
      { email: created.email },
      {
        headers: {
          "Set-Cookie": createSessionCookie(created.email, created.userId),
        },
      },
    );
  } catch (error) {
    console.error("auth.sign_up.error", {
      email,
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create this account.",
      },
      { status: 500 },
    );
  }
}
