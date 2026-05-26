import { loadStripe, Stripe } from "@stripe/stripe-js";

declare global {
  interface Window {
    IMP: any;
  }
}

let stripePromise: Promise<Stripe | null>;

const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const PORTONE_SDK_URL = "https://cdn.iamport.kr/v1/iamport.js";
const PORTONE_USER_CODE = import.meta.env.VITE_PORTONE_USER_CODE;

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

/**
 * Dynamically load a script
 */
const loadScript = (url: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${url}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
    document.head.appendChild(script);
  });
};

export interface PaymentOptions {
  amount: number; // KRW base base-pack amount (10000, 45000, 85000)
  orderName: string;
  orderId: string;
  packId: string; // "credits-small" | "credits-medium" | "credits-large"
  userEmail?: string;
  userName?: string;
  sandbox?: boolean;
  custom_data?: any;
}

/**
 * Initialize and process PortOne (Domestic) payment
 */
export const processPortOnePayment = async (
  options: PaymentOptions
): Promise<any> => {
  if (!PORTONE_USER_CODE) {
    throw new Error("PortOne User Code is not configured in VITE_PORTONE_USER_CODE environment variable.");
  }

  await loadScript(PORTONE_SDK_URL);
  const { IMP } = window;
  IMP.init(PORTONE_USER_CODE);

  return new Promise((resolve, reject) => {
    IMP.request_pay(
      {
        pg: options.sandbox ? "kakaopay.TC0ONETIME" : "html5_inicis", 
        pay_method: "card",
        merchant_uid: options.orderId,
        name: options.orderName,
        amount: options.amount,
        buyer_email: options.userEmail,
        buyer_name: options.userName,
        custom_data: options.custom_data,
      },
      (rsp: any) => {
        if (rsp.success) {
          resolve(rsp);
        } else {
          reject(new Error(rsp.error_msg));
        }
      }
    );
  });
};

