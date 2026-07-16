package com.schoolerp.portal.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.schoolerp.portal.PortalApp
import com.schoolerp.portal.data.PortalException
import com.schoolerp.portal.network.AttendanceResponse
import com.schoolerp.portal.network.FeesResponse
import com.schoolerp.portal.network.MarksResponse
import com.schoolerp.portal.network.PaymentConfig
import com.schoolerp.portal.network.StudentSummary
import com.schoolerp.portal.network.UpiPaymentDetails
import kotlinx.coroutines.launch

/** Loadable<T>: a small container for a per-tab async section. */
data class Loadable<T>(
    val loading: Boolean = false,
    val data: T? = null,
    val error: String? = null,
)

class ChildDetailViewModel(private val studentId: Int) : ViewModel() {
    private val app = PortalApp.instance

    var summary by mutableStateOf(Loadable<StudentSummary>())
        private set
    var attendance by mutableStateOf(Loadable<AttendanceResponse>())
        private set
    var marks by mutableStateOf(Loadable<MarksResponse>())
        private set
    var fees by mutableStateOf(Loadable<FeesResponse>())
        private set
    var paymentConfig by mutableStateOf<PaymentConfig?>(null)
        private set

    // UPI payment dialog state
    var pendingUpi by mutableStateOf<UpiPaymentDetails?>(null)
        private set
    var upiFeeId by mutableStateOf<Int?>(null)
        private set
    var paymentMessage by mutableStateOf<String?>(null)
        private set
    var paymentWorking by mutableStateOf(false)
        private set

    init {
        loadSummary()
    }

    fun loadSummary() {
        summary = summary.copy(loading = true, error = null)
        viewModelScope.launch {
            try {
                summary = Loadable(data = app.repository.summary(studentId))
            } catch (e: PortalException) {
                summary = Loadable(error = e.message)
            }
        }
    }

    fun loadAttendance() {
        if (attendance.data != null || attendance.loading) return
        attendance = attendance.copy(loading = true, error = null)
        viewModelScope.launch {
            try {
                attendance = Loadable(data = app.repository.attendance(studentId))
            } catch (e: PortalException) {
                attendance = Loadable(error = e.message)
            }
        }
    }

    fun loadMarks() {
        if (marks.data != null || marks.loading) return
        marks = marks.copy(loading = true, error = null)
        viewModelScope.launch {
            try {
                marks = Loadable(data = app.repository.marks(studentId))
            } catch (e: PortalException) {
                marks = Loadable(error = e.message)
            }
        }
    }

    fun loadFees() {
        fees = fees.copy(loading = true, error = null)
        viewModelScope.launch {
            try {
                fees = Loadable(data = app.repository.fees(studentId))
                if (paymentConfig == null) {
                    paymentConfig = runCatching { app.repository.paymentConfig() }.getOrNull()
                }
            } catch (e: PortalException) {
                fees = Loadable(error = e.message)
            }
        }
    }

    /** Fetch the upi:// deep link for a fee so the UI can launch a payment app. */
    fun startUpiPayment(feeId: Int, onReady: (UpiPaymentDetails) -> Unit) {
        paymentWorking = true
        paymentMessage = null
        viewModelScope.launch {
            try {
                val details = app.repository.upiDetails(studentId, feeId)
                pendingUpi = details
                upiFeeId = feeId
                onReady(details)
            } catch (e: PortalException) {
                paymentMessage = e.message
            } finally {
                paymentWorking = false
            }
        }
    }

    /** Record a completed UPI payment by its UTR/reference and refresh fees. */
    fun confirmUpiPayment(reference: String) {
        val feeId = upiFeeId ?: return
        paymentWorking = true
        viewModelScope.launch {
            try {
                app.repository.confirmUpi(studentId, feeId, reference)
                paymentMessage = "Payment recorded. Receipt updated."
                pendingUpi = null
                upiFeeId = null
                loadFees()
            } catch (e: PortalException) {
                paymentMessage = e.message
            } finally {
                paymentWorking = false
            }
        }
    }

    fun dismissPayment() {
        pendingUpi = null
        upiFeeId = null
    }

    fun clearPaymentMessage() {
        paymentMessage = null
    }

    class Factory(private val studentId: Int) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            ChildDetailViewModel(studentId) as T
    }
}
