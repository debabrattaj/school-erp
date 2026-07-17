package com.schoolerp.portal.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.schoolerp.portal.PortalApp
import com.schoolerp.portal.data.PortalException
import com.schoolerp.portal.network.StudentCard
import kotlinx.coroutines.launch

class ChildrenViewModel : ViewModel() {
    private val app = PortalApp.instance

    var loading by mutableStateOf(true)
        private set
    var error by mutableStateOf<String?>(null)
        private set
    var children by mutableStateOf<List<StudentCard>>(emptyList())
        private set

    init { load() }

    fun load() {
        loading = true
        error = null
        viewModelScope.launch {
            try {
                children = app.repository.children()
            } catch (e: PortalException) {
                error = e.message
            } finally {
                loading = false
            }
        }
    }
}
