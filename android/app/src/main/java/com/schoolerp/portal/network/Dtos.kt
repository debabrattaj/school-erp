package com.schoolerp.portal.network

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Data-transfer objects mirroring the FastAPI portal endpoints
 * (backend/app/routes/portal.py and auth.py). Field names match the JSON the
 * backend emits. Optional fields are nullable so partial payloads never crash
 * deserialization.
 */

// ----------------- Auth -----------------

@Serializable
data class LoginRequest(
    val email: String,
    val password: String,
    @SerialName("account_code") val accountCode: String = "default",
    @SerialName("mfa_code") val mfaCode: String? = null,
)

@Serializable
data class TokenResponse(
    @SerialName("access_token") val accessToken: String,
    @SerialName("token_type") val tokenType: String,
    val user: PortalUser,
)

@Serializable
data class PortalUser(
    val id: Int,
    val name: String? = null,
    val email: String,
    val role: String,
    @SerialName("mfa_enabled") val mfaEnabled: Boolean = false,
    val account: Account? = null,
)

@Serializable
data class Account(
    val id: Int,
    @SerialName("school_name") val schoolName: String? = null,
    @SerialName("account_code") val accountCode: String? = null,
    val country: String? = null,
    val timezone: String? = null,
)

// FastAPI's error envelope: {"detail": "..."} — used to surface server messages.
@Serializable
data class ApiError(val detail: String? = null)

// ----------------- Children / summary -----------------

@Serializable
data class StudentCard(
    val id: Int,
    @SerialName("admission_no") val admissionNo: String? = null,
    @SerialName("first_name") val firstName: String? = null,
    @SerialName("last_name") val lastName: String? = null,
    @SerialName("full_name") val fullName: String? = null,
    @SerialName("class_name") val className: String? = null,
    val section: String? = null,
    @SerialName("roll_no") val rollNo: String? = null,
    @SerialName("photo_url") val photoUrl: String? = null,
    @SerialName("student_status") val studentStatus: String? = null,
    val house: String? = null,
)

@Serializable
data class Guardian(
    @SerialName("father_name") val fatherName: String? = null,
    @SerialName("mother_name") val motherName: String? = null,
    @SerialName("guardian_name") val guardianName: String? = null,
)

@Serializable
data class Enrollment(
    @SerialName("academic_year") val academicYear: String? = null,
    @SerialName("class_name") val className: String? = null,
    val section: String? = null,
    @SerialName("roll_no") val rollNo: String? = null,
)

@Serializable
data class StudentSummary(
    val student: StudentCard,
    val guardian: Guardian? = null,
    @SerialName("current_academic_year") val currentAcademicYear: String? = null,
    @SerialName("current_enrollment") val currentEnrollment: Enrollment? = null,
)

// ----------------- Attendance -----------------

@Serializable
data class AttendanceCounts(
    @SerialName("Present") val present: Int = 0,
    @SerialName("Absent") val absent: Int = 0,
    @SerialName("Late") val late: Int = 0,
    @SerialName("Half Day") val halfDay: Int = 0,
)

@Serializable
data class AttendanceRecord(
    val date: String? = null,
    val status: String? = null,
    @SerialName("academic_year") val academicYear: String? = null,
    val remarks: String? = null,
)

@Serializable
data class AttendanceResponse(
    @SerialName("total_days") val totalDays: Int = 0,
    val counts: AttendanceCounts = AttendanceCounts(),
    @SerialName("attendance_percentage") val attendancePercentage: Double? = null,
    val records: List<AttendanceRecord> = emptyList(),
)

// ----------------- Marks -----------------

@Serializable
data class SubjectMark(
    val subject: String? = null,
    @SerialName("marks_obtained") val marksObtained: Double? = null,
    @SerialName("max_marks") val maxMarks: Double? = null,
    val grade: String? = null,
)

@Serializable
data class ExamResult(
    @SerialName("exam_name") val examName: String? = null,
    @SerialName("academic_year") val academicYear: String? = null,
    val subjects: List<SubjectMark> = emptyList(),
    @SerialName("total_obtained") val totalObtained: Double? = null,
    @SerialName("total_max") val totalMax: Double? = null,
    val percentage: Double? = null,
)

@Serializable
data class MarksResponse(
    val exams: List<ExamResult> = emptyList(),
)

// ----------------- Fees -----------------

@Serializable
data class FeeTotals(
    @SerialName("total_amount") val totalAmount: Double = 0.0,
    @SerialName("total_paid") val totalPaid: Double = 0.0,
    @SerialName("total_due") val totalDue: Double = 0.0,
)

@Serializable
data class Fee(
    val id: Int,
    @SerialName("fee_type") val feeType: String? = null,
    @SerialName("academic_year") val academicYear: String? = null,
    @SerialName("total_amount") val totalAmount: Double? = null,
    @SerialName("paid_amount") val paidAmount: Double? = null,
    @SerialName("due_amount") val dueAmount: Double? = null,
    @SerialName("payment_status") val paymentStatus: String? = null,
    @SerialName("payment_date") val paymentDate: String? = null,
    @SerialName("receipt_no") val receiptNo: String? = null,
    val remarks: String? = null,
)

@Serializable
data class FeesResponse(
    val totals: FeeTotals = FeeTotals(),
    val fees: List<Fee> = emptyList(),
)

@Serializable
data class PaymentConfig(
    val enabled: Boolean = false,
    @SerialName("upi_id") val upiId: String = "",
    @SerialName("payee_name") val payeeName: String = "School",
    val currency: String = "INR",
)

@Serializable
data class UpiPaymentDetails(
    @SerialName("upi_id") val upiId: String,
    @SerialName("payee_name") val payeeName: String,
    val amount: Double,
    val currency: String,
    val note: String? = null,
    val uri: String,
)

@Serializable
data class UpiConfirmRequest(val reference: String)
