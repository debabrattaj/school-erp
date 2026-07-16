package com.schoolerp.portal.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.schoolerp.portal.BuildConfig
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "session")

/**
 * Persists the auth token, tenant account code, signed-in user's display fields
 * and the API base URL. Also keeps a synchronous in-memory snapshot so the
 * OkHttp interceptor (which cannot suspend) can read the current token/account.
 */
class SessionStore(private val context: Context) {

    private object Keys {
        val TOKEN = stringPreferencesKey("token")
        val ACCOUNT_CODE = stringPreferencesKey("account_code")
        val BASE_URL = stringPreferencesKey("base_url")
        val USER_NAME = stringPreferencesKey("user_name")
        val USER_ROLE = stringPreferencesKey("user_role")
        val SCHOOL_NAME = stringPreferencesKey("school_name")
    }

    // Synchronous snapshot for the interceptor. Kept in sync by observing below.
    @Volatile var cachedToken: String? = null
        private set
    @Volatile var cachedAccountCode: String? = null
        private set
    @Volatile var cachedBaseUrl: String = BuildConfig.DEFAULT_API_BASE_URL
        private set

    val tokenFlow: Flow<String?> = context.dataStore.data.map { prefs ->
        prefs[Keys.TOKEN].also { cachedToken = it }
    }

    val baseUrlFlow: Flow<String> = context.dataStore.data.map { prefs ->
        (prefs[Keys.BASE_URL] ?: BuildConfig.DEFAULT_API_BASE_URL).also { cachedBaseUrl = it }
    }

    val sessionFlow: Flow<SessionInfo> = context.dataStore.data.map { prefs ->
        cachedToken = prefs[Keys.TOKEN]
        cachedAccountCode = prefs[Keys.ACCOUNT_CODE]
        cachedBaseUrl = prefs[Keys.BASE_URL] ?: BuildConfig.DEFAULT_API_BASE_URL
        SessionInfo(
            token = prefs[Keys.TOKEN],
            accountCode = prefs[Keys.ACCOUNT_CODE],
            baseUrl = cachedBaseUrl,
            userName = prefs[Keys.USER_NAME],
            userRole = prefs[Keys.USER_ROLE],
            schoolName = prefs[Keys.SCHOOL_NAME],
        )
    }

    suspend fun saveLogin(
        token: String,
        accountCode: String,
        userName: String?,
        userRole: String?,
        schoolName: String?,
    ) {
        context.dataStore.edit { prefs ->
            prefs[Keys.TOKEN] = token
            prefs[Keys.ACCOUNT_CODE] = accountCode
            userName?.let { prefs[Keys.USER_NAME] = it }
            userRole?.let { prefs[Keys.USER_ROLE] = it }
            schoolName?.let { prefs[Keys.SCHOOL_NAME] = it }
        }
        cachedToken = token
        cachedAccountCode = accountCode
    }

    suspend fun saveBaseUrl(baseUrl: String) {
        val normalized = baseUrl.trim().let { if (it.endsWith("/")) it else "$it/" }
        context.dataStore.edit { it[Keys.BASE_URL] = normalized }
        cachedBaseUrl = normalized
    }

    suspend fun clear() {
        context.dataStore.edit { prefs ->
            prefs.remove(Keys.TOKEN)
            // Keep account code & base URL so the next login is pre-filled.
            prefs.remove(Keys.USER_NAME)
            prefs.remove(Keys.USER_ROLE)
            prefs.remove(Keys.SCHOOL_NAME)
        }
        cachedToken = null
    }
}

data class SessionInfo(
    val token: String?,
    val accountCode: String?,
    val baseUrl: String,
    val userName: String?,
    val userRole: String?,
    val schoolName: String?,
) {
    val isLoggedIn: Boolean get() = !token.isNullOrBlank()
}
