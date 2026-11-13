package com.reelobra.app.project

/**
 * Decide qué archivos de video en disco no están registrados en la base
 * (p. ej. la app se cerró durante una grabación o una importación).
 * Lógica pura para poder probarla sin Android.
 */
object RecoveryPlanner {
    data class Candidate(val projectId: Long, val path: String, val sizeBytes: Long)

    sealed interface Action {
        data class Register(val c: Candidate) : Action
        data class Discard(val c: Candidate) : Action
        data class Orphan(val c: Candidate) : Action   // carpeta de proyecto sin proyecto en DB
    }

    /** Menos de esto no puede contener un video válido. */
    const val MIN_VALID_BYTES = 16 * 1024L

    fun plan(onDisk: List<Candidate>, knownPaths: Set<String>, knownProjects: Set<Long>): List<Action> =
        onDisk.filter { it.path !in knownPaths }.map { c ->
            when {
                c.projectId !in knownProjects -> Action.Orphan(c)
                c.sizeBytes < MIN_VALID_BYTES -> Action.Discard(c)
                else -> Action.Register(c)
            }
        }
}
