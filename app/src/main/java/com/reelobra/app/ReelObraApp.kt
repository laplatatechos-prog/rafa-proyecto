package com.reelobra.app

import android.app.Application
import com.reelobra.app.data.AppContainer

class ReelObraApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        // Recupera clips huérfanos (p. ej. si la app murió grabando) antes de mostrar nada.
        container.startupRecovery()
    }
}
