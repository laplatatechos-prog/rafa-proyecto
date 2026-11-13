package com.reelobra.app.project

import android.content.Context
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.util.Log
import com.reelobra.app.data.ClipEntity
import com.reelobra.app.data.ClipSource
import com.reelobra.app.data.ProjectDao
import com.reelobra.app.data.ProjectEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException
import kotlin.coroutines.coroutineContext

class ProjectRepository(
    private val context: Context,
    private val dao: ProjectDao,
    private val storage: ProjectStorage,
) {
    fun observeSummaries() = dao.observeSummaries()
    fun observeProject(id: Long) = dao.observeProject(id)
    fun observeClips(projectId: Long) = dao.observeClips(projectId)

    suspend fun createProject(now: Long = System.currentTimeMillis()): Long =
        dao.insertProject(ProjectEntity(title = Format.defaultTitle(now), createdAt = now, updatedAt = now))

    suspend fun rename(id: Long, title: String) {
        val p = dao.getProject(id) ?: return
        dao.updateProject(p.copy(title = title.trim().ifEmpty { p.title }, updatedAt = System.currentTimeMillis()))
    }

    suspend fun deleteProject(id: Long) = withContext(Dispatchers.IO) {
        dao.deleteProject(id)
        storage.deleteProjectFiles(id)
    }

    suspend fun clipCount(projectId: Long): Int = dao.clips(projectId).size

    fun newRecordingFile(projectId: Long): File = storage.newClipFile(projectId)

    /** Registra un archivo ya escrito (grabado o recuperado). Devuelve null si no es un video legible. */
    suspend fun registerClip(projectId: Long, file: File, source: ClipSource): ClipEntity? =
        withContext(Dispatchers.IO) {
            val info = probe(file) ?: return@withContext null
            val clip = ClipEntity(
                projectId = projectId,
                filePath = file.absolutePath,
                durationMs = info.durationMs,
                width = info.width,
                height = info.height,
                source = source,
                position = dao.nextPosition(projectId),
                createdAt = System.currentTimeMillis(),
            )
            val id = dao.insertClip(clip)
            dao.touch(projectId, System.currentTimeMillis())
            clip.copy(id = id)
        }

    /**
     * Copia un video del teléfono dentro del proyecto. Se copia (no se referencia)
     * para que el proyecto siga funcionando aunque el original se borre de la galería.
     */
    suspend fun importClip(projectId: Long, uri: Uri, onProgress: (Float) -> Unit = {}): ClipEntity? =
        withContext(Dispatchers.IO) {
            val target = storage.newClipFile(projectId)
            val tmp = File(target.parentFile, target.name + ".part")
            try {
                val total = context.contentResolver.openAssetFileDescriptor(uri, "r")?.use { it.length } ?: -1L
                context.contentResolver.openInputStream(uri).use { input ->
                    requireNotNull(input) { "No se pudo abrir el video" }
                    tmp.outputStream().use { out ->
                        val buf = ByteArray(1 shl 16)
                        var copied = 0L
                        while (true) {
                            coroutineContext.ensureActive()
                            val n = input.read(buf)
                            if (n < 0) break
                            out.write(buf, 0, n)
                            copied += n
                            if (total > 0) onProgress((copied.toFloat() / total).coerceIn(0f, 1f))
                        }
                    }
                }
                if (!tmp.renameTo(target)) throw IOException("No se pudo guardar el video")
                registerClip(projectId, target, ClipSource.IMPORT) ?: run {
                    target.delete(); null
                }
            } catch (e: Exception) {
                tmp.delete()
                if (e is kotlinx.coroutines.CancellationException) throw e
                Log.e(TAG, "Importación fallida", e)
                null
            }
        }

    suspend fun deleteClip(clipId: Long) = withContext(Dispatchers.IO) {
        val clip = dao.getClip(clipId) ?: return@withContext
        dao.deleteClip(clipId)
        File(clip.filePath).delete()
        dao.touch(clip.projectId, System.currentTimeMillis())
    }

    /** Registra videos que quedaron en disco sin entrada en la base. */
    suspend fun recoverOrphanClips() = withContext(Dispatchers.IO) {
        // Restos de importaciones interrumpidas
        storage.root.walkTopDown().filter { it.isFile && it.name.endsWith(".mp4.part") }.forEach { it.delete() }
        val onDisk = storage.listClipFiles().flatMap { (pid, files) ->
            files.map { RecoveryPlanner.Candidate(pid, it.absolutePath, it.length()) }
        }
        val actions = RecoveryPlanner.plan(onDisk, dao.allClipPaths().toSet(), dao.allProjectIds().toSet())
        for (a in actions) when (a) {
            is RecoveryPlanner.Action.Register -> {
                val ok = registerClip(a.c.projectId, File(a.c.path), ClipSource.RECOVERED)
                if (ok == null) quarantine(File(a.c.path))
                Log.i(TAG, "Recuperación ${a.c.path}: ${if (ok != null) "registrado" else "ilegible"}")
            }
            is RecoveryPlanner.Action.Discard -> File(a.c.path).delete()
            is RecoveryPlanner.Action.Orphan -> Log.w(TAG, "Carpeta sin proyecto, se conserva: ${a.c.path}")
        }
    }

    /** No borramos un video ilegible: lo apartamos por si se puede rescatar desde una PC. */
    private fun quarantine(f: File) {
        val dir = File(storage.root, "_ilegibles").apply { mkdirs() }
        f.renameTo(File(dir, "${f.parentFile?.parentFile?.name}_${f.name}"))
    }

    data class VideoInfo(val durationMs: Long, val width: Int, val height: Int)

    fun probe(file: File): VideoInfo? {
        if (!file.exists() || file.length() == 0L) return null
        val r = MediaMetadataRetriever()
        return try {
            r.setDataSource(file.absolutePath)
            val d = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: return null
            if (r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_VIDEO) != "yes") return null
            var w = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
            var h = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
            val rot = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
            if (rot == 90 || rot == 270) { val t = w; w = h; h = t }
            VideoInfo(d, w, h)
        } catch (e: Exception) {
            Log.w(TAG, "No se pudo leer ${file.name}", e); null
        } finally {
            r.release()
        }
    }

    companion object { private const val TAG = "ProjectRepository" }
}
