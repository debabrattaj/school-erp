declare module "react-native-razorpay" {
  export interface RazorpayResult {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }

  const RazorpayCheckout: {
    open(options: Record<string, unknown>): Promise<RazorpayResult>;
  };

  export default RazorpayCheckout;
}
