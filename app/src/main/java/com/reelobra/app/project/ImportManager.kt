package com.reelobra.app.project

import android.net.Uri
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Importa videos en el ámbito de la aplicación: sigue aunque el usuario cambie de pantalla.
 */
class ImportManager(private val scope: CoroutineScope, private val repo: ProjectRepository) {
    data class State(val projectId: Long, val index: Int, val total: Int, val fraction: Float, val failed: Int)

    private val _state = MutableStateFlow<State?>(null)
    val state: StateFlow<State?> = _state.asStateFlow()
    private var job: Job? = null

    /** Último resultado: cuántos fallaron (para avisar). */
    private val _lastFailures = MutableStateFlow(0)
    val lastFailures: StateFlow<Int> = _lastFailures.asStateFlow()

    fun start(projectId: Long, uris: List<Uri>) {
        if (uris.isEmpty() || job?.isActive == true) return
        job = scope.launch {
            var failed = 0
            try {
                uris.forEachIndexed { i, uri ->
                    _state.value = State(projectId, i, uris.size, 0f, failed)
                    val ok = repo.importClip(projectId, uri) { f ->
                        _state.value = State(projectId, i, uris.size, f, failed)
                    }
                    if (ok == null) failed++
                }
            } finally {
                _lastFailures.value = failed
                _state.value = null
            }
        }
    }

    fun cancel() { job?.cancel() }
}
