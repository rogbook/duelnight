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
      createOrder: (_data: any, actions: any) => {
        // USD 금액은 서버에서 계산된 값을 사용해야 하므로
        // custom_data에 KRW 원금을 담아 서버 검증 시 환율 적용
        // 여기서는 PayPal SDK가 요구하는 최소 구조만 전달하고,
        // 실제 금액 검증은 서버(verifyPayPalPayment)에서 수행합니다.
        const krwAmount = options.amount;
        // 서버에서 설정된 환율을 사용해야 하지만, PayPal SDK는 생성 시점에
        // USD 금액이 필요합니다. VITE_PAYPAL_KRW_RATE 환경변수로 관리하세요.
        const rate = Number(import.meta.env.VITE_PAYPAL_KRW_RATE ?? 1400);
        const usdAmount = (krwAmount / rate).toFixed(2);
        return actions.order.create({
          purchase_units: [
            {
              amount: {
                value: usdAmount,
                currency_code: "USD",
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
