package com.reelobra.app.ui.project

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.IconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.reelobra.app.data.AppContainer
import com.reelobra.app.data.ClipEntity
import com.reelobra.app.data.ClipSource
import com.reelobra.app.player.Thumbnails
import com.reelobra.app.player.VideoPlayer
import com.reelobra.app.project.Format
import com.reelobra.app.ui.BigButton
import kotlinx.coroutines.launch

@Composable
fun ProjectScreen(container: AppContainer, projectId: Long, openCamera: () -> Unit, onBack: () -> Unit) {
    val repo = container.projects
    val project by repo.observeProject(projectId).collectAsStateWithLifecycle(null)
    val clips by repo.observeClips(projectId).collectAsStateWithLifecycle(emptyList())
    val importing by container.imports.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()

    var selected by remember { mutableIntStateOf(0) }
    var confirmDeleteClip by remember { mutableStateOf<ClipEntity?>(null) }
    var confirmDeleteProject by remember { mutableStateOf(false) }
    var renaming by remember { mutableStateOf(false) }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(20)) { uris ->
        container.imports.start(projectId, uris)
    }

    BackHandler(onBack = onBack)

    Column(
        Modifier.fillMaxSize().safeDrawingPadding().padding(horizontal = 14.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack, modifier = Modifier.size(56.dp)) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Volver", modifier = Modifier.size(30.dp))
            }
            Text(
                project?.title ?: "",
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.weight(1f).clickable { renaming = true },
                maxLines = 1,
            )
            IconButton(onClick = { renaming = true }, modifier = Modifier.size(56.dp)) {
                Icon(Icons.Filled.Edit, contentDescription = "Renombrar")
            }
            IconButton(onClick = { confirmDeleteProject = true }, modifier = Modifier.size(56.dp)) {
                Icon(Icons.Filled.Delete, contentDescription = "Borrar proyecto", tint = MaterialTheme.colorScheme.error)
            }
        }

        // Reproductor: todos los clips seguidos, empezando por el seleccionado.
        Box(
            Modifier.fillMaxWidth().weight(1f).clip(RoundedCornerShape(10.dp)).background(Color.Black),
            contentAlignment = Alignment.Center,
        ) {
            if (clips.isEmpty()) {
                Text("Sin clips todavía", color = Color.White)
            } else {
                VideoPlayer(clips.map { it.filePath }, selected.coerceIn(0, clips.lastIndex), Modifier.fillMaxSize())
            }
        }

        Text(
            "${clips.size} clip${if (clips.size == 1) "" else "s"} · total ${Format.duration(clips.sumOf { it.durationMs })}",
            style = MaterialTheme.typography.bodyLarge,
        )
        LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            itemsIndexed(clips, key = { _, c -> c.id }) { i, c ->
                ClipThumb(c, i == selected, onClick = { selected = i }, onDelete = { confirmDeleteClip = c })
            }
        }

        importing?.takeIf { it.projectId == projectId }?.let {
            Text("Importando ${it.index + 1} de ${it.total}…")
            LinearProgressIndicator(progress = { it.fraction }, modifier = Modifier.fillMaxWidth())
        }

        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            BigButton("GRABAR", Icons.Filled.Videocam, onClick = openCamera, modifier = Modifier.weight(1f))
            BigButton(
                "IMPORTAR", Icons.Filled.PhotoLibrary, primary = false, enabled = importing == null,
                modifier = Modifier.weight(1f),
                onClick = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.VideoOnly)) },
            )
        }
        Text(
            "Próxima etapa: recortar, ordenar y unir clips.",
            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }

    confirmDeleteClip?.let { c ->
        AlertDialog(
            onDismissRequest = { confirmDeleteClip = null },
            title = { Text("¿Borrar este clip?") },
            text = { Text("Se borra el archivo del proyecto (${Format.duration(c.durationMs)}). No se puede deshacer.") },
            confirmButton = { TextButton({ scope.launch { repo.deleteClip(c.id) }; confirmDeleteClip = null; selected = 0 }) { Text("BORRAR") } },
            dismissButton = { TextButton({ confirmDeleteClip = null }) { Text("Cancelar") } },
        )
    }
    if (confirmDeleteProject) {
        AlertDialog(
            onDismissRequest = { confirmDeleteProject = false },
            title = { Text("¿Borrar el proyecto completo?") },
            text = { Text("Se borran todos sus clips. Los videos de la galería del teléfono no se tocan.") },
            confirmButton = { TextButton({ scope.launch { repo.deleteProject(projectId); onBack() } }) { Text("BORRAR") } },
            dismissButton = { TextButton({ confirmDeleteProject = false }) { Text("Cancelar") } },
        )
    }
    if (renaming) {
        var text by remember { mutableStateOf(project?.title ?: "") }
        AlertDialog(
            onDismissRequest = { renaming = false },
            title = { Text("Nombre del reel") },
            text = { OutlinedTextField(text, { text = it }, singleLine = true) },
            confirmButton = { TextButton({ scope.launch { repo.rename(projectId, text) }; renaming = false }) { Text("GUARDAR") } },
            dismissButton = { TextButton({ renaming = false }) { Text("Cancelar") } },
        )
    }
}

@Composable
private fun ClipThumb(c: ClipEntity, selected: Boolean, onClick: () -> Unit, onDelete: () -> Unit) {
    val bmp by produceState<android.graphics.Bitmap?>(null, c.filePath) { value = Thumbnails.load(c.filePath) }
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier.size(92.dp, 120.dp).clip(RoundedCornerShape(8.dp))
                .border(if (selected) 4.dp else 1.dp, if (selected) MaterialTheme.colorScheme.primary else Color.Gray, RoundedCornerShape(8.dp))
                .background(Color.DarkGray).clickable(onClick = onClick),
        ) {
            bmp?.let { Image(it.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop) }
            Text(
                Format.duration(c.durationMs) + if (c.source == ClipSource.RECOVERED) " ↺" else "",
                color = Color.White,
                modifier = Modifier.align(Alignment.BottomStart).background(Color(0xAA000000)).padding(horizontal = 4.dp),
            )
        }
        IconButton(onClick = onDelete, modifier = Modifier.size(48.dp)) {
            Icon(Icons.Filled.Delete, contentDescription = "Borrar clip")
        }
    }
}
