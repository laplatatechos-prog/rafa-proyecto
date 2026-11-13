package com.reelobra.app.data

import android.content.Context
import androidx.room.Room
import com.reelobra.app.project.ImportManager
import com.reelobra.app.project.ProjectRepository
import com.reelobra.app.project.ProjectStorage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/** Inyección manual de dependencias: suficiente para una app de este tamaño. */
class AppContainer(context: Context) {
    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private val db: ReelDatabase = Room.databaseBuilder(context, ReelDatabase::class.java, "reelobra.db")
        .build()

    val storage = ProjectStorage(context.filesDir)
    val projects = ProjectRepository(context.applicationContext, db.projectDao(), storage)

    val imports = ImportManager(appScope, projects)

    fun startupRecovery() {
        appScope.launch { projects.recoverOrphanClips() }
    }
}
