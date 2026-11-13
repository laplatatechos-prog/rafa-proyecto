package com.reelobra.app.ui.camera

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.util.Log
import android.view.WindowManager
import androidx.activity.compose.BackHandler
import androidx.activity.compose.LocalActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.video.FallbackStrategy
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recording
import androidx.camera.video.VideoRecordEvent
import androidx.camera.view.CameraController
import androidx.camera.view.LifecycleCameraController
import androidx.camera.view.PreviewView
import androidx.camera.view.video.AudioConfig
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.FlashlightOff
import androidx.compose.material.icons.filled.FlashlightOn
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.reelobra.app.data.AppContainer
import com.reelobra.app.data.ClipSource
import com.reelobra.app.project.Format
import com.reelobra.app.ui.BigButton
import com.reelobra.app.ui.theme.RecordRed
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.io.File

private const val TAG = "CameraScreen"

@Composable
fun CameraScreen(container: AppContainer, projectId: Long, onDone: () -> Unit, onAbandon: () -> Unit) {
    val context = LocalContext.current
    val needed = arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO)
    fun granted() = needed.all { ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED }
    var hasPermission by remember { mutableStateOf(granted()) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        hasPermission = granted()
    }
    LaunchedEffect(Unit) { if (!hasPermission) launcher.launch(needed) }

    if (!hasPermission) {
        Column(Modifier.fillMaxSize().safeDrawingPadding().padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("ReelObra necesita la cámara y el micrófono para grabar.", style = MaterialTheme.typography.titleLarge)
            Text("Todo queda en el teléfono. La app no tiene acceso a internet.", style = MaterialTheme.typography.bodyLarge)
            BigButton("DAR PERMISO", Icons.Filled.Check, onClick = { launcher.launch(needed) })
            TextButton(onClick = onAbandon) { Text("Volver") }
        }
        return
    }
    Recorder(container, projectId, onDone, onAbandon)
}

@SuppressLint("MissingPermission")
@Composable
private fun Recorder(container: AppContainer, projectId: Long, onDone: () -> Unit, onAbandon: () -> Unit) {
    val context = LocalContext.current
    val activity = LocalActivity.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()

    val controller = remember {
        LifecycleCameraController(context).apply {
            setEnabledUseCases(CameraController.VIDEO_CAPTURE)
            videoCaptureQualitySelector = QualitySelector.from(
                Quality.FHD, FallbackStrategy.lowerQualityOrHigherThan(Quality.HD),
            )
        }
    }
    var recording by remember { mutableStateOf<Recording?>(null) }
    var startedAt by remember { mutableLongStateOf(0L) }
    var elapsed by remember { mutableLongStateOf(0L) }
    var clipsThisSession by remember { mutableIntStateOf(0) }
    var torch by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }

    DisposableEffect(lifecycleOwner) {
        controller.bindToLifecycle(lifecycleOwner)
        onDispose {
            recording?.stop()   // CameraX finaliza el archivo; el clip se registra en el evento Finalize
            controller.unbind()
        }
    }
    // Pantalla siempre encendida mientras la cámara está abierta.
    DisposableEffect(Unit) {
        activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        onDispose { activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) }
    }
    LaunchedEffect(recording) {
        while (recording != null) { elapsed = System.currentTimeMillis() - startedAt; delay(200) }
    }

    fun start() {
        val file = container.projects.newRecordingFile(projectId)
        startedAt = System.currentTimeMillis(); elapsed = 0
        recording = controller.startRecording(
            FileOutputOptions.Builder(file).build(),
            AudioConfig.create(true),
            ContextCompat.getMainExecutor(context),
        ) { ev ->
            if (ev is VideoRecordEvent.Finalize) {
                recording = null
                handleFinalize(ev, file, onSaved = {
                    // Ámbito de la app: el registro no se pierde si se cierra la pantalla.
                    container.appScope.launch {
                        val clip = container.projects.registerClip(projectId, file, ClipSource.CAMERA)
                        if (clip != null) clipsThisSession++ else message = "El clip no se pudo leer."
                    }
                }, onError = { message = it })
            }
        }
    }

    fun finish() {
        scope.launch {
            // Esperar a que el último clip se termine de registrar.
            recording?.stop()
            var waited = 0
            while (recording != null && waited < 3000) { delay(100); waited += 100 }
            delay(300)
            if (container.projects.clipCount(projectId) == 0) {
                container.projects.deleteProject(projectId)   // no dejar proyectos vacíos
                onAbandon()
            } else onDone()
        }
    }

    BackHandler { if (recording != null) recording?.stop() else finish() }

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        AndroidView(
            factory = { ctx -> PreviewView(ctx).apply { this.controller = controller; scaleType = PreviewView.ScaleType.FIT_CENTER } },
            modifier = Modifier.fillMaxSize(),
        )

        // Barra superior: tiempo + linterna
        Row(
            Modifier.fillMaxWidth().safeDrawingPadding().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                if (recording != null) "● ${Format.duration(elapsed)}" else "Clips: $clipsThisSession",
                style = MaterialTheme.typography.headlineMedium,
                color = if (recording != null) RecordRed else Color.White,
                modifier = Modifier.background(Color(0x99000000), RoundedCornerShape(8.dp)).padding(horizontal = 12.dp, vertical = 4.dp),
            )
            FilledTonalIconButton(onClick = { torch = !torch; controller.enableTorch(torch) }, modifier = Modifier.size(64.dp)) {
                Icon(if (torch) Icons.Filled.FlashlightOn else Icons.Filled.FlashlightOff, contentDescription = "Linterna", modifier = Modifier.size(32.dp))
            }
        }

        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().safeDrawingPadding().padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            message?.let {
                Text(it, color = Color.White, modifier = Modifier.background(Color(0xCC000000), RoundedCornerShape(8.dp)).padding(10.dp))
            }
            // Botón de grabar: 110 dp, operable con guantes.
            Box(
                Modifier.size(110.dp).border(6.dp, Color.White, CircleShape).padding(12.dp)
                    .background(RecordRed, if (recording != null) RoundedCornerShape(14.dp) else CircleShape)
                    .clickable { message = null; if (recording == null) start() else recording?.stop() },
            )
            if (recording == null) {
                BigButton("LISTO", Icons.Filled.Check, onClick = ::finish)
            }
        }
    }
}

private fun handleFinalize(ev: VideoRecordEvent.Finalize, file: File, onSaved: () -> Unit, onError: (String) -> Unit) {
    when (ev.error) {
        VideoRecordEvent.Finalize.ERROR_NONE,
        // Interrupciones (app a segundo plano, llamada, poco espacio): el archivo queda válido.
        VideoRecordEvent.Finalize.ERROR_SOURCE_INACTIVE,
        VideoRecordEvent.Finalize.ERROR_INSUFFICIENT_STORAGE,
        VideoRecordEvent.Finalize.ERROR_FILE_SIZE_LIMIT_REACHED,
        VideoRecordEvent.Finalize.ERROR_DURATION_LIMIT_REACHED -> {
            if (ev.error == VideoRecordEvent.Finalize.ERROR_INSUFFICIENT_STORAGE) onError("Poco espacio: se guardó lo grabado hasta ahora.")
            onSaved()
        }
        else -> {
            Log.w(TAG, "Grabación fallida: ${ev.error}", ev.cause)
            if (file.length() > 0) onSaved() else { file.delete(); onError("No se pudo grabar (código ${ev.error}).") }
        }
    }
}
