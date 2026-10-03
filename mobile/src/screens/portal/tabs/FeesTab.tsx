import React, { useCallback, useState } from "react";
import { FlatList, Linking, Platform, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import { showAlert } from "../../../utils/alert";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../../api/client";
import { AppTextInput, Badge, Card, EmptyView, ErrorView, LoadingView, PrimaryButton, SecondaryButton } from "../../../components/Common";
import { colors, spacing } from "../../../theme/theme";
import { Fee, FeesResponse, UpiPaymentDetails } from "../../../modules/portalTypes";

interface PaymentConfig {
  upi_enabled: boolean;
  gateway_enabled: boolean;
  currency?: string;
}

interface GatewayOrder {
  order_id: string;
  key_id: string;
  amount: number;
  currency: string;
}

function statusTone(status?: string): "success" | "danger" | "warning" | "default" {
  if (status === "Paid") return "success";
  if (status === "Unpaid") return "danger";
  if (status === "Partial") return "warning";
  return "default";
}

export default function FeesTab({ studentId }: { studentId: number }) {
  const [data, setData] = useState<FeesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payingFeeId, setPayingFeeId] = useState<number | null>(null);
  const [utr, setUtr] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null);
  const [gatewayFeeId, setGatewayFeeId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [res, config] = await Promise.all([
        api.get<FeesResponse>(`/portal/students/${studentId}/fees`),
        api.get<PaymentConfig>("/portal/payment/config").catch(() => ({ upi_enabled: false, gateway_enabled: false })),
      ]);
      setData(res);
      setPaymentConfig(config);
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load fees.");
    }
  }, [studentId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function startPayment(fee: Fee) {
    let details: UpiPaymentDetails;
    try {
      details = await api.get<UpiPaymentDetails>(`/portal/students/${studentId}/fees/${fee.id}/payment/upi`);
    } catch (e) {
      showAlert("Error", e instanceof ApiError ? String(e.message) : "Could not start payment.");
      return;
    }

    // Opened directly rather than gated on canOpenURL: since Android 11 that
    // call answers false for any scheme not declared in the manifest's
    // <queries>, so it reported "no UPI app" on phones that had several.
    // Failing to open is the reliable signal, and it is caught below.
    try {
      await Linking.openURL(details.uri);
    } catch {
      showAlert(
        "No UPI app found",
        "Install a UPI app (Google Pay, PhonePe, Paytm) to pay, or pay at the school office."
      );
      return;
    }

    // The reference box only opens once the handoff actually happened, so a
    // parent is never asked for a UTR for a payment they could not start.
    setUtr("");
    setPayingFeeId(fee.id);
  }

  async function confirmPayment(feeId: number) {
    if (!utr.trim()) {
      showAlert("Reference required", "Enter the UPI transaction reference (UTR) after paying.");
      return;
    }
    setConfirming(true);
    try {
      await api.post(`/portal/students/${studentId}/fees/${feeId}/payment/upi/confirm`, { reference: utr.trim() });
      setPayingFeeId(null);
      setUtr("");
      await load();
      showAlert("Submitted", "Payment reference recorded. The school will verify it shortly.");
    } catch (e) {
      showAlert("Error", e instanceof ApiError ? String(e.message) : "Could not confirm payment.");
    } finally {
      setConfirming(false);
    }
  }

  async function payWithGateway(fee: Fee) {
    if (Platform.OS === "web" || Constants.appOwnership === "expo") {
      showAlert("App build required", "Secure gateway checkout uses Razorpay's native SDK. Open this in an installed development or production build, or use the UPI option below.");
      return;
    }
    setGatewayFeeId(fee.id);
    try {
      const RazorpayCheckout = (await import("react-native-razorpay")).default;
      const order = await api.post<GatewayOrder>(`/portal/students/${studentId}/fees/${fee.id}/payment/order`);
      const result = await RazorpayCheckout.open({
        key: order.key_id,
        order_id: order.order_id,
        amount: String(Math.round(order.amount * 100)),
        currency: order.currency,
        name: "School fee payment",
        description: `${fee.fee_type || "Fee"} · #${fee.id}`,
        theme: { color: colors.primary },
      });
      await api.post(`/portal/students/${studentId}/fees/${fee.id}/payment/verify`, {
        order_id: result.razorpay_order_id,
        payment_id: result.razorpay_payment_id,
        signature: result.razorpay_signature,
      });
      await load();
      showAlert("Payment verified", "The captured payment has been applied to the fee.");
    } catch (e: any) {
      const message = e instanceof ApiError
        ? String(e.message)
        : e?.description || "Payment was not completed. Check your bank before retrying.";
      showAlert("Payment not completed", message);
    } finally {
      setGatewayFeeId(null);
    }
  }

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!data) return <LoadingView />;
  if (!data.fees.length) return <EmptyView message="No fee records yet." />;

  return (
    <FlatList
      data={data.fees}
      keyExtractor={(f) => String(f.id)}
      contentContainerStyle={{ padding: spacing(4) }}
      ListHeaderComponent={
        <Card style={{ marginBottom: spacing(4) }}>
          <View style={styles.totalsRow}>
            <View>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>₹{data.totals.total_amount}</Text>
            </View>
            <View>
              <Text style={styles.totalLabel}>Paid</Text>
              <Text style={[styles.totalValue, { color: colors.success }]}>₹{data.totals.total_paid}</Text>
            </View>
            <View>
              <Text style={styles.totalLabel}>Due</Text>
              <Text style={[styles.totalValue, { color: colors.danger }]}>₹{data.totals.total_due}</Text>
            </View>
          </View>
        </Card>
      }
      renderItem={({ item }) => (
        <Card style={{ marginBottom: spacing(3) }}>
          <View style={styles.feeHeader}>
            <Text style={styles.feeType}>{item.fee_type}</Text>
            <Badge text={item.payment_status || "—"} tone={statusTone(item.payment_status)} />
          </View>
          <Text style={styles.feeLine}>Total: ₹{item.total_amount} · Paid: ₹{item.paid_amount} · Due: ₹{item.due_amount}</Text>
          {item.receipt_no ? <Text style={styles.feeLine}>Receipt: {item.receipt_no}</Text> : null}

          {(item.due_amount ?? 0) > 0 && (
            <>
              {payingFeeId === item.id ? (
                <View style={styles.payBlock}>
                  <AppTextInput
                    value={utr}
                    onChangeText={setUtr}
                    placeholder="UPI reference / UTR number"
                    style={{ marginBottom: spacing(2) }}
                  />
                  <PrimaryButton title="Confirm payment" onPress={() => confirmPayment(item.id)} loading={confirming} />
                  <SecondaryButton title="Cancel" onPress={() => setPayingFeeId(null)} style={{ marginTop: spacing(2) }} />
                </View>
              ) : <View style={styles.paymentActions}>
                {paymentConfig?.gateway_enabled ? (
                  <PrimaryButton title="Pay securely online" onPress={() => payWithGateway(item)} loading={gatewayFeeId === item.id} />
                ) : null}
                {paymentConfig?.upi_enabled ? (
                  <SecondaryButton title="Pay via UPI app" onPress={() => startPayment(item)} />
                ) : null}
                {!paymentConfig?.gateway_enabled && !paymentConfig?.upi_enabled ? (
                  <Text style={styles.feeLine}>Online payment is not configured. Contact the school office.</Text>
                ) : null}
              </View>}
            </>
          )}
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  totalsRow: { flexDirection: "row", justifyContent: "space-between" },
  totalLabel: { fontSize: 12, color: colors.textMuted },
  totalValue: { fontSize: 18, fontWeight: "800", color: colors.text, marginTop: 2 },
  feeHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing(2) },
  feeType: { fontSize: 16, fontWeight: "700", color: colors.text },
  feeLine: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  payBlock: { marginTop: spacing(3) },
  paymentActions: { marginTop: spacing(3), gap: spacing(2) },
});
