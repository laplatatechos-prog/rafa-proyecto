package com.reelobra.app.player

import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.util.LruCache
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Miniaturas en memoria; se generan localmente desde el archivo. */
object Thumbnails {
    private val cache = LruCache<String, Bitmap>(40)

    suspend fun load(path: String, atMs: Long = 500): Bitmap? = cache.get(path) ?: withContext(Dispatchers.IO) {
        val r = MediaMetadataRetriever()
        try {
            r.setDataSource(path)
            r.getScaledFrameAtTime(atMs * 1000, MediaMetadataRetriever.OPTION_CLOSEST_SYNC, 240, 240)
                ?.also { cache.put(path, it) }
        } catch (_: Exception) {
            null
        } finally {
            r.release()
        }
    }
}
