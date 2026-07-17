package com.schoolerp.portal

import android.app.Application
import com.schoolerp.portal.data.PortalRepository
import com.schoolerp.portal.data.SessionStore
import com.schoolerp.portal.network.ApiClient

/** Minimal manual dependency graph — no DI framework needed for this app's size. */
class PortalApp : Application() {

    lateinit var session: SessionStore
        private set
    lateinit var repository: PortalRepository
        private set

    override fun onCreate() {
        super.onCreate()
        session = SessionStore(this)
        val client = ApiClient(session)
        repository = PortalRepository(client, session)
        instance = this
    }

    companion object {
        lateinit var instance: PortalApp
            private set
    }
}
