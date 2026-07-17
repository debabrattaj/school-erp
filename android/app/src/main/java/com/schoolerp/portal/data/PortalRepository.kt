package com.schoolerp.portal.data

import com.schoolerp.portal.network.ApiClient
import com.schoolerp.portal.network.ApiError
import com.schoolerp.portal.network.AttendanceResponse
import com.schoolerp.portal.network.Fee
import com.schoolerp.portal.network.FeesResponse
import com.schoolerp.portal.network.LoginRequest
import com.schoolerp.portal.network.MarksResponse
import com.schoolerp.portal.network.PaymentConfig
import com.schoolerp.portal.network.StudentCard
import com.schoolerp.portal.network.StudentSummary
import com.schoolerp.portal.network.TokenResponse
import com.schoolerp.portal.network.UpiConfirmRequest
import com.schoolerp.portal.network.UpiPaymentDetails
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import retrofit2.HttpException
import java.io.IOException

/** Raised for any failed API call; carries a user-facing message. */
class PortalException(
    message: String,
    val mfaRequired: Boolean = false,
    val unauthorized: Boolean = false,
) : Exception(message)

class PortalRepository(
    private val client: ApiClient,
    private val session: SessionStore,
) {
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun login(email: String, password: String, accountCode: String, mfaCode: String?): TokenResponse =
        call {
            val code = accountCode.ifBlank { "default" }
            val resp = client.service().login(
                LoginRequest(
                    email = email.trim(),
                    password = password,
                    accountCode = code,
                    mfaCode = mfaCode?.ifBlank { null },
                )
            )
            session.saveLogin(
                token = resp.accessToken,
                accountCode = code,
                userName = resp.user.name,
                userRole = resp.user.role,
                schoolName = resp.user.account?.schoolName,
            )
            resp
        }

    suspend fun children(): List<StudentCard> = call { client.service().children() }

    suspend fun summary(id: Int): StudentSummary = call { client.service().summary(id) }

    suspend fun attendance(id: Int, year: String? = null): AttendanceResponse =
        call { client.service().attendance(id, year) }

    suspend fun marks(id: Int, year: String? = null): MarksResponse =
        call { client.service().marks(id, year) }

    suspend fun fees(id: Int, year: String? = null): FeesResponse =
        call { client.service().fees(id, year) }

    suspend fun paymentConfig(): PaymentConfig = call { client.service().paymentConfig() }

    suspend fun upiDetails(studentId: Int, feeId: Int): UpiPaymentDetails =
        call { client.service().upiPaymentDetails(studentId, feeId) }

    suspend fun confirmUpi(studentId: Int, feeId: Int, reference: String): Fee =
        call { client.service().confirmUpiPayment(studentId, feeId, UpiConfirmRequest(reference)) }

    /** Runs [block] on IO and maps low-level failures to [PortalException]. */
    private suspend fun <T> call(block: suspend () -> T): T = withContext(Dispatchers.IO) {
        try {
            block()
        } catch (e: HttpException) {
            val detail = parseDetail(e)
            when {
                detail == "MFA_REQUIRED" ->
                    throw PortalException("Enter your authentication code.", mfaRequired = true)
                e.code() == 401 ->
                    throw PortalException(detail ?: "Invalid email or password.", unauthorized = true)
                e.code() == 403 ->
                    throw PortalException(detail ?: "You don't have access to this record.")
                e.code() == 429 ->
                    throw PortalException(detail ?: "Too many attempts. Please try again later.")
                else -> throw PortalException(detail ?: "Server error (${e.code()}).")
            }
        } catch (e: IOException) {
            throw PortalException("Can't reach the server. Check your connection and the server address.")
        } catch (e: PortalException) {
            throw e
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            // Anything else (e.g. a JSON field that doesn't match the app's model)
            // is surfaced as a readable message instead of crashing the app.
            throw PortalException(
                "Unexpected error: ${e.message ?: e.javaClass.simpleName}",
            )
        }
    }

    private fun parseDetail(e: HttpException): String? = try {
        e.response()?.errorBody()?.string()?.takeIf { it.isNotBlank() }?.let {
            json.decodeFromString<ApiError>(it).detail
        }
    } catch (_: Exception) {
        null
    }
}
