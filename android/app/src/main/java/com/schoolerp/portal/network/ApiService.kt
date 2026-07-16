package com.schoolerp.portal.network

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/** Retrofit interface for the portal-relevant slice of the School ERP API. */
interface ApiService {

    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): TokenResponse

    @GET("portal/children")
    suspend fun children(): List<StudentCard>

    @GET("portal/students/{id}/summary")
    suspend fun summary(@Path("id") studentId: Int): StudentSummary

    @GET("portal/students/{id}/attendance")
    suspend fun attendance(
        @Path("id") studentId: Int,
        @Query("academic_year") academicYear: String? = null,
    ): AttendanceResponse

    @GET("portal/students/{id}/marks")
    suspend fun marks(
        @Path("id") studentId: Int,
        @Query("academic_year") academicYear: String? = null,
    ): MarksResponse

    @GET("portal/students/{id}/fees")
    suspend fun fees(
        @Path("id") studentId: Int,
        @Query("academic_year") academicYear: String? = null,
    ): FeesResponse

    @GET("portal/payment/config")
    suspend fun paymentConfig(): PaymentConfig

    @GET("portal/students/{studentId}/fees/{feeId}/payment/upi")
    suspend fun upiPaymentDetails(
        @Path("studentId") studentId: Int,
        @Path("feeId") feeId: Int,
    ): UpiPaymentDetails

    @POST("portal/students/{studentId}/fees/{feeId}/payment/upi/confirm")
    suspend fun confirmUpiPayment(
        @Path("studentId") studentId: Int,
        @Path("feeId") feeId: Int,
        @Body body: UpiConfirmRequest,
    ): Fee
}
