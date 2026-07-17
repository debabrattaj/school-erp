package com.schoolerp.portal.network

import com.schoolerp.portal.data.SessionStore
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import java.util.concurrent.TimeUnit

/**
 * Builds (and memoizes) the [ApiService] against whatever base URL is currently
 * stored in the session. Rebuilds only when the base URL changes. The attached
 * interceptor injects `Authorization` and `X-School-Code` on every request from
 * the session's synchronous snapshot.
 */
class ApiClient(private val session: SessionStore) {

    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        explicitNulls = false
    }

    private val okHttp: OkHttpClient by lazy {
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        }
        OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .addInterceptor { chain ->
                val builder = chain.request().newBuilder()
                session.cachedToken?.let { builder.header("Authorization", "Bearer $it") }
                session.cachedAccountCode?.let { builder.header("X-School-Code", it) }
                builder.header("Accept", "application/json")
                chain.proceed(builder.build())
            }
            .addInterceptor(logging)
            .build()
    }

    @Volatile private var cachedService: ApiService? = null
    @Volatile private var cachedForUrl: String? = null

    /** Current service, rebuilt if the stored base URL changed. */
    fun service(): ApiService {
        val baseUrl = normalize(session.cachedBaseUrl)
        val existing = cachedService
        if (existing != null && cachedForUrl == baseUrl) return existing

        val contentType = "application/json".toMediaType()
        val retrofit = Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(okHttp)
            .addConverterFactory(KotlinxJsonConverterFactory(json, contentType))
            .build()
        val service = retrofit.create(ApiService::class.java)
        cachedService = service
        cachedForUrl = baseUrl
        return service
    }

    private fun normalize(url: String): String =
        com.schoolerp.portal.data.SessionStore.normalizeBaseUrl(url)
}
