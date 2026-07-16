package com.schoolerp.portal.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.schoolerp.portal.PortalApp
import com.schoolerp.portal.data.SessionInfo
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** Owns the persisted session so the nav host can pick the start destination. */
class AppViewModel : ViewModel() {
    private val app = PortalApp.instance

    val session: StateFlow<SessionInfo?> = app.session.sessionFlow
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    fun logout() {
        viewModelScope.launch { app.session.clear() }
    }
}
