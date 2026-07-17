package com.schoolerp.portal.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.material3.AlertDialog
import com.schoolerp.portal.network.Fee
import com.schoolerp.portal.ui.ChildDetailViewModel
import com.schoolerp.portal.ui.components.ErrorBox
import com.schoolerp.portal.ui.components.LoadingBox
import com.schoolerp.portal.ui.money

@Composable
fun FeesTab(
    vm: ChildDetailViewModel,
    onLaunchUpi: (String) -> Unit,
) {
    val state = vm.fees
    when {
        state.loading && state.data == null -> LoadingBox()
        state.error != null && state.data == null -> ErrorBox(state.error, onRetry = vm::loadFees)
        state.data != null -> {
            val data = state.data
            val currency = vm.paymentConfig?.currency ?: "INR"
            LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item { FeeTotalsCard(data.totals.totalAmount, data.totals.totalPaid, data.totals.totalDue, currency) }
                if (data.fees.isEmpty()) {
                    item {
                        Text(
                            "No fee records for this student.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(8.dp),
                        )
                    }
                }
                items(data.fees, key = { it.id }) { fee ->
                    FeeCard(
                        fee = fee,
                        currency = currency,
                        payEnabled = vm.paymentConfig?.enabled == true,
                        working = vm.paymentWorking,
                        onPay = { vm.startUpiPayment(fee.id) { details -> onLaunchUpi(details.uri) } },
                    )
                }
            }
        }
    }

    // Confirm-payment dialog: appears after a upi:// link is launched, so the
    // parent can record the UTR/reference once the payment app returns.
    if (vm.pendingUpi != null) {
        ConfirmPaymentDialog(
            amountText = money(vm.pendingUpi!!.amount, vm.pendingUpi!!.currency),
            working = vm.paymentWorking,
            onConfirm = { ref -> vm.confirmUpiPayment(ref) },
            onDismiss = { vm.dismissPayment() },
        )
    }
}

@Composable
private fun FeeTotalsCard(total: Double, paid: Double, due: Double, currency: String) {
    Card(
        Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
    ) {
        Row(
            Modifier.fillMaxWidth().padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            TotalCell("Billed", money(total, currency))
            TotalCell("Paid", money(paid, currency))
            TotalCell("Due", money(due, currency), highlight = due > 0)
        }
    }
}

@Composable
private fun TotalCell(label: String, value: String, highlight: Boolean = false) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            value,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = if (highlight) MaterialTheme.colorScheme.error
            else MaterialTheme.colorScheme.onPrimaryContainer,
        )
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onPrimaryContainer,
        )
    }
}

@Composable
private fun FeeCard(
    fee: Fee,
    currency: String,
    payEnabled: Boolean,
    working: Boolean,
    onPay: () -> Unit,
) {
    val due = (fee.totalAmount ?: 0.0) - (fee.paidAmount ?: 0.0)
    Card(
        Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        fee.feeType ?: "Fee",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    fee.academicYear?.let {
                        Text(
                            it,
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                PaymentStatusPill(fee.paymentStatus)
            }
            Spacer(Modifier.height(10.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                MiniStat("Billed", money(fee.totalAmount, currency))
                MiniStat("Paid", money(fee.paidAmount, currency))
                MiniStat("Due", money(due.coerceAtLeast(0.0), currency))
            }
            fee.receiptNo?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(8.dp))
                Text(
                    "Receipt: $it",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (due > 0.0 && payEnabled) {
                Spacer(Modifier.height(12.dp))
                Button(
                    onClick = onPay,
                    enabled = !working,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Pay ${money(due, currency)} via UPI")
                }
            }
        }
    }
}

@Composable
private fun MiniStat(label: String, value: String) {
    Column {
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun PaymentStatusPill(status: String?) {
    val (bg, fg) = when (status) {
        "Paid" -> Color(0xFFDCFCE7) to Color(0xFF15803D)
        "Partial" -> Color(0xFFFEF3C7) to Color(0xFFB45309)
        "Unpaid" -> Color(0xFFFEE2E2) to Color(0xFFB91C1C)
        else -> Color(0xFFE5E7EB) to Color(0xFF374151)
    }
    Box(
        Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(bg)
            .padding(horizontal = 12.dp, vertical = 4.dp),
    ) {
        Text(
            status ?: "—",
            color = fg,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
private fun ConfirmPaymentDialog(
    amountText: String,
    working: Boolean,
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var reference by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = { if (!working) onDismiss() },
        title = { Text("Confirm payment") },
        text = {
            Column {
                Text(
                    "After paying $amountText in your UPI app, enter the transaction " +
                        "reference (UTR) here to update the school's records.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = reference,
                    onValueChange = { reference = it },
                    label = { Text("UPI reference / UTR") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onConfirm(reference.trim()) },
                enabled = !working && reference.isNotBlank(),
            ) { Text("Confirm") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !working) { Text("Cancel") }
        },
    )
}
