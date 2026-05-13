/**
 * Payment Utility for PortOne (Domestic) and PayPal (International)
 */

declare global {
  interface Window {
    IMP: any;
    paypal: any;
  }
}

const PORTONE_SDK_URL = "https://cdn.iamport.kr/v1/iamport.js";
const PAYPAL_SDK_URL = (clientId: string) =>
  `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD`;

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

export type PaymentMethod = "portone" | "paypal";

export interface PaymentOptions {
  amount: number;
  orderName: string;
  orderId: string;
  userEmail?: string;
  userName?: string;
  sandbox?: boolean;
  custom_data?: any;
}

const PORTONE_USER_CODE = import.meta.env.VITE_PORTONE_USER_CODE;

/**
 * Initialize and process PortOne (Domestic) payment
 */
export const processPortOnePayment = async (
  options: PaymentOptions
): Promise<any> => {
  if (!PORTONE_USER_CODE) {
    throw new Error("PortOne User Code is not configured.");
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

const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID;

/**
 * Initialize and process PayPal (International) payment
 */
export const initPayPalButtons = async (
  options: PaymentOptions,
  onApprove: (data: any) => Promise<void>,
  onError: (err: any) => void
) => {
  if (!PAYPAL_CLIENT_ID) {
    throw new Error("PayPal Client ID is not configured.");
  }

  await loadScript(PAYPAL_SDK_URL(PAYPAL_CLIENT_ID));
  const { paypal } = window;

  if (paypal) {
    return paypal.Buttons({
      createOrder: (data: any, actions: any) => {
        return actions.order.create({
          purchase_units: [
            {
              amount: {
                value: (options.amount / 1400).toFixed(2), // Updated rate example
              },
              description: options.orderName,
              custom_id: options.orderId,
            },
          ],
        });
      },
      onApprove: async (data: any, actions: any) => {
        const details = await actions.order.capture();
        // Server should verify this order ID
        await onApprove(details);
      },
      onError: (err: any) => {
        onError(err);
      },
    });
  }
};
