package com.reelobra.app.ui.home

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.reelobra.app.data.AppContainer
import com.reelobra.app.data.ProjectSummary
import com.reelobra.app.project.Format
import com.reelobra.app.ui.BigButton
import kotlinx.coroutines.launch

@Composable
fun HomeScreen(container: AppContainer, openCamera: (Long) -> Unit, openProject: (Long) -> Unit) {
    val projects by container.projects.observeSummaries().collectAsStateWithLifecycle(emptyList())
    val importing by container.imports.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var pendingImportProject by rememberSaveable { mutableLongStateOf(-1L) }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(20)) { uris ->
        val pid = pendingImportProject
        pendingImportProject = -1L
        if (pid < 0) return@rememberLauncherForActivityResult
        if (uris.isEmpty()) {
            scope.launch { container.projects.deleteProject(pid) }   // no dejar proyectos vacíos
        } else {
            container.imports.start(pid, uris)
            openProject(pid)
        }
    }

    Column(
        Modifier.fillMaxSize().safeDrawingPadding().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text("ReelObra", style = MaterialTheme.typography.headlineLarge, color = MaterialTheme.colorScheme.primary)

        BigButton("NUEVO REEL", Icons.Filled.Videocam, onClick = {
            scope.launch { openCamera(container.projects.createProject()) }
        })
        BigButton("USAR VIDEOS DEL TELÉFONO", Icons.Filled.PhotoLibrary, primary = false, enabled = importing == null, onClick = {
            scope.launch {
                pendingImportProject = container.projects.createProject()
                picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.VideoOnly))
            }
        })

        importing?.let {
            Text("Importando video ${it.index + 1} de ${it.total}…", style = MaterialTheme.typography.bodyLarge)
            LinearProgressIndicator(progress = { it.fraction }, modifier = Modifier.fillMaxWidth())
        }

        Text("Proyectos", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 8.dp))
        if (projects.isEmpty()) {
            Text("Todavía no hay reels. Tocá NUEVO REEL para grabar.", style = MaterialTheme.typography.bodyLarge)
        }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), contentPadding = PaddingValues(bottom = 24.dp)) {
            items(projects, key = { it.id }) { p -> ProjectRow(p) { openProject(p.id) } }
        }
    }
}

@Composable
private fun ProjectRow(p: ProjectSummary, onClick: () -> Unit) {
    Card(
        Modifier.fillMaxWidth().clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(p.title, style = MaterialTheme.typography.titleMedium)
                Text(
                    "${p.clipCount} clip${if (p.clipCount == 1) "" else "s"} · ${Format.duration(p.totalDurationMs)} · ${Format.dateTime(p.updatedAt)}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Icon(Icons.Filled.ChevronRight, contentDescription = "Abrir")
        }
    }
}
