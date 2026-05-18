import {
  createSessionCookie,
  isOwnerEmail,
  verifyPassword,
} from "@/lib/auth";
import { findUserByEmail } from "@/lib/users";

export const runtime = "nodejs";

type SignInRequest = {
  email?: string;
  password?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as SignInRequest;
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";

  console.log("auth.sign_in.attempt", { email });

  if (!email || !email.includes("@")) {
    console.log("auth.sign_in.invalid_email", { email });
    return Response.json({ error: "Enter a valid email." }, { status: 400 });
  }

  const isOwner = isOwnerEmail(email);

  if (!isOwner && !(await verifyPassword(email, password))) {
    console.log("auth.sign_in.wrong_password", { email });
    return Response.json(
      { error: "Enter the password for this account." },
      { status: 401 },
    );
  }

  console.log("auth.sign_in.success", { email, isOwner });
  const user = isOwner ? null : await findUserByEmail(email);

  return Response.json(
    { email },
    {
      headers: {
        "Set-Cookie": createSessionCookie(email, user?.id),
      },
    },
  );
}
