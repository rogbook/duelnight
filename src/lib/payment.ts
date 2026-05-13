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
}

/**
 * Initialize and process PortOne (Domestic) payment
 */
export const processPortOnePayment = async (
  userCode: string, // PortOne Store ID (IMP User Code)
  options: PaymentOptions
): Promise<any> => {
  await loadScript(PORTONE_SDK_URL);
  const { IMP } = window;
  IMP.init(userCode);

  return new Promise((resolve, reject) => {
    IMP.request_pay(
      {
        pg: options.sandbox ? "kakaopay.TC0ONETIME" : "html5_inicis", // kakaopay test PG if sandbox
        pay_method: "card",
        merchant_uid: options.orderId,
        name: options.orderName,
        amount: options.amount,
        buyer_email: options.userEmail,
        buyer_name: options.userName,
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

/**
 * Initialize and process PayPal (International) payment
 * This is a simplified version using the PayPal Buttons API
 */
export const initPayPalButtons = async (
  clientId: string,
  options: PaymentOptions,
  onApprove: (data: any) => Promise<void>,
  onError: (err: any) => void
) => {
  await loadScript(PAYPAL_SDK_URL(clientId));
  const { paypal } = window;

  if (paypal) {
    return paypal.Buttons({
      createOrder: (data: any, actions: any) => {
        return actions.order.create({
          purchase_units: [
            {
              amount: {
                value: (options.amount / 1300).toFixed(2), // Simple KRW to USD conversion for demo
              },
              description: options.orderName,
              reference_id: options.orderId,
            },
          ],
        });
      },
      onApprove: async (data: any, actions: any) => {
        const details = await actions.order.capture();
        await onApprove(details);
      },
      onError: (err: any) => {
        onError(err);
      },
    });
  }
};
