import API from "../api";

let checkoutScript;
function loadCheckout() {
  if (window.Razorpay) return Promise.resolve();
  if (!checkoutScript) checkoutScript = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => window.Razorpay ? resolve() : reject(new Error("Checkout failed to load."));
    script.onerror = () => { checkoutScript = null; script.remove(); reject(new Error("Unable to load payment checkout.")); };
    document.head.appendChild(script);
  });
  return checkoutScript;
}

export async function payPortalFee(studentId, feeId) {
  await loadCheckout();
  const path = `/portal/students/${studentId}/fees/${feeId}/payment`;
  const { data: order } = await API.post(`${path}/order`);
  return new Promise((resolve, reject) => {
    const checkout = new window.Razorpay({
      key: order.key_id, order_id: order.order_id,
      amount: Math.round(order.amount * 100), currency: order.currency,
      name: "School fee payment", description: `Fee ${feeId}`,
      modal: { ondismiss: () => resolve(false) },
      handler: async result => {
        try {
          await API.post(`${path}/verify`, { order_id: result.razorpay_order_id,
            payment_id: result.razorpay_payment_id, signature: result.razorpay_signature });
          resolve(true);
        } catch (e) { reject(e); }
      },
    });
    checkout.on("payment.failed", () => reject(new Error("Payment was not completed. Check your bank before retrying.")));
    checkout.open();
  });
}
