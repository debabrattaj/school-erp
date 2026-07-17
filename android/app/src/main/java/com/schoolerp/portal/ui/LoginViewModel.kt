package com.schoolerp.portal.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.schoolerp.portal.PortalApp
import com.schoolerp.portal.data.PortalException
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class LoginViewModel : ViewModel() {
    private val app = PortalApp.instance

    var accountCode by mutableStateOf("")
    var email by mutableStateOf("")
    var password by mutableStateOf("")
    var mfaCode by mutableStateOf("")
    var baseUrl by mutableStateOf("")

    var mfaRequired by mutableStateOf(false)
        private set
    var loading by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    init {
        // Pre-fill account code and server address from the last session.
        viewModelScope.launch {
            val info = app.session.sessionFlow.first()
            if (accountCode.isBlank()) accountCode = info.accountCode ?: ""
            if (baseUrl.isBlank()) baseUrl = info.baseUrl
        }
    }

    fun submit(onSuccess: () -> Unit) {
        if (loading) return
        error = null
        if (email.isBlank() || password.isBlank()) {
            error = "Enter your email and password."
            return
        }
        loading = true
        viewModelScope.launch {
            try {
                if (baseUrl.isNotBlank()) app.session.saveBaseUrl(baseUrl)
                app.repository.login(
                    email = email,
                    password = password,
                    accountCode = accountCode,
                    mfaCode = if (mfaRequired) mfaCode else null,
                )
                onSuccess()
            } catch (e: PortalException) {
                if (e.mfaRequired) {
                    mfaRequired = true
                    error = e.message
                } else {
                    error = e.message
                }
            } finally {
                loading = false
            }
        }
    }
}
