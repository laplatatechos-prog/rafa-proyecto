package com.reelobra.app.data

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "projects")
data class ProjectEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val title: String,
    val createdAt: Long,
    val updatedAt: Long,
)

enum class ClipSource { CAMERA, IMPORT, RECOVERED }

/** Un archivo original. NUNCA se modifica: la edición se guarda como datos aparte. */
@Entity(
    tableName = "clips",
    foreignKeys = [ForeignKey(
        entity = ProjectEntity::class,
        parentColumns = ["id"],
        childColumns = ["projectId"],
        onDelete = ForeignKey.CASCADE,
    )],
    indices = [Index("projectId"), Index(value = ["filePath"], unique = true)],
)
data class ClipEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val projectId: Long,
    val filePath: String,
    val durationMs: Long,
    val width: Int,
    val height: Int,
    val source: ClipSource,
    val position: Int,
    val createdAt: Long,
)

data class ProjectSummary(
    val id: Long,
    val title: String,
    val updatedAt: Long,
    val clipCount: Int,
    val totalDurationMs: Long,
)
