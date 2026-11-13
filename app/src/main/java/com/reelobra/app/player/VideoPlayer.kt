package com.reelobra.app.player

import android.net.Uri
import androidx.annotation.OptIn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import java.io.File

/**
 * Reproduce una lista de archivos locales como si fueran uno solo.
 * [startIndex] permite saltar a un clip concreto.
 */
@OptIn(UnstableApi::class)
@Composable
fun VideoPlayer(files: List<String>, startIndex: Int, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val player = remember { ExoPlayer.Builder(context).build() }

    LaunchedEffect(files, startIndex) {
        if (files.isEmpty()) { player.clearMediaItems(); return@LaunchedEffect }
        player.setMediaItems(files.map { MediaItem.fromUri(Uri.fromFile(File(it))) }, startIndex.coerceIn(0, files.lastIndex), 0L)
        player.prepare()
    }

    // Pausar al ir a segundo plano (llamada entrante, cambio de app).
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle) {
        val obs = LifecycleEventObserver { _, ev -> if (ev == Lifecycle.Event.ON_PAUSE) player.pause() }
        lifecycle.addObserver(obs)
        onDispose {
            lifecycle.removeObserver(obs)
            player.release()
        }
    }

    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            PlayerView(ctx).apply {
                this.player = player
                resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                setShowNextButton(files.size > 1)
                setShowPreviousButton(files.size > 1)
                controllerShowTimeoutMs = 2500
            }
        },
    )
}
