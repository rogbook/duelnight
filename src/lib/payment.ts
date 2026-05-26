import { loadStripe, Stripe } from "@stripe/stripe-js";

let stripePromise: Promise<Stripe | null>;

const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

/**
 * Get Stripe client instance (lazy-loaded singleton)
 */
export const getStripe = (): Promise<Stripe | null> => {
  if (!stripePromise) {
    if (!STRIPE_PUBLISHABLE_KEY) {
      console.warn("Stripe Publishable Key is not configured in VITE_STRIPE_PUBLISHABLE_KEY.");
    }
    stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY ?? "");
  }
  return stripePromise;
};

export interface PaymentOptions {
  amount: number; // KRW base base-pack amount (10000, 45000, 85000)
  orderName: string;
  orderId: string;
  packId: string; // "credits-small" | "credits-medium" | "credits-large"
  userEmail?: string;
  userName?: string;
}
