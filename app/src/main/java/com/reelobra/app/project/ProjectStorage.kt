package com.reelobra.app.project

import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Estructura en disco (privada de la app, no requiere permisos):
 *   files/projects/<projectId>/clips/<yyyyMMdd_HHmmss_SSS>.mp4   <- originales, intactos
 */
class ProjectStorage(private val filesDir: File) {
    val root: File get() = File(filesDir, "projects")

    fun projectDir(projectId: Long) = File(root, projectId.toString())
    fun clipsDir(projectId: Long) = File(projectDir(projectId), "clips").apply { mkdirs() }

    fun newClipFile(projectId: Long, now: Long = System.currentTimeMillis()): File =
        File(clipsDir(projectId), clipFileName(now))

    fun deleteProjectFiles(projectId: Long) {
        projectDir(projectId).deleteRecursively()
    }

    /** Archivos de clip existentes, agrupados por proyecto. */
    fun listClipFiles(): Map<Long, List<File>> =
        root.listFiles().orEmpty()
            .mapNotNull { dir -> dir.name.toLongOrNull()?.let { it to dir } }
            .associate { (id, dir) ->
                id to File(dir, "clips").listFiles { f -> f.isFile && f.extension == "mp4" }.orEmpty().toList()
            }

    companion object {
        fun clipFileName(now: Long): String =
            SimpleDateFormat("yyyyMMdd_HHmmss_SSS", Locale.US).format(Date(now)) + ".mp4"
    }
}
