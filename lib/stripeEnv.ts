import "server-only";

type StripeMode = "live" | "test" | "unknown";

function keyMode(value: string): StripeMode {
  if (value.startsWith("sk_live_") || value.startsWith("pk_live_")) return "live";
  if (value.startsWith("sk_test_") || value.startsWith("pk_test_")) return "test";
  return "unknown";
}

export function assertStripeSecretKey(value: string, name = "STRIPE_SECRET_KEY"): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`Missing ${name}`);

  const mode = keyMode(trimmed);
  if (process.env.NODE_ENV === "production" && mode !== "live") {
    throw new Error(`${name} must be a live Stripe secret key in production`);
  }

  return trimmed;
}

export function assertStripePriceId(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`Missing ${name}`);

  if (!trimmed.startsWith("price_")) {
    throw new Error(`${name} must be a Stripe price id`);
  }

  return trimmed;
}