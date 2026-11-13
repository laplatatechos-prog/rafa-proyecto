package com.reelobra.app.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface ProjectDao {
    @Insert suspend fun insertProject(p: ProjectEntity): Long
    @Update suspend fun updateProject(p: ProjectEntity)
    @Query("DELETE FROM projects WHERE id = :id") suspend fun deleteProject(id: Long)
    @Query("SELECT * FROM projects WHERE id = :id") suspend fun getProject(id: Long): ProjectEntity?
    @Query("SELECT * FROM projects WHERE id = :id") fun observeProject(id: Long): Flow<ProjectEntity?>
    @Query("SELECT id FROM projects") suspend fun allProjectIds(): List<Long>
    @Query("UPDATE projects SET updatedAt = :ts WHERE id = :id") suspend fun touch(id: Long, ts: Long)

    @Query(
        """SELECT p.id, p.title, p.updatedAt,
                  COUNT(c.id) AS clipCount, COALESCE(SUM(c.durationMs), 0) AS totalDurationMs
           FROM projects p LEFT JOIN clips c ON c.projectId = p.id
           GROUP BY p.id ORDER BY p.updatedAt DESC"""
    )
    fun observeSummaries(): Flow<List<ProjectSummary>>

    @Insert suspend fun insertClip(c: ClipEntity): Long
    @Query("DELETE FROM clips WHERE id = :id") suspend fun deleteClip(id: Long)
    @Query("SELECT * FROM clips WHERE id = :id") suspend fun getClip(id: Long): ClipEntity?
    @Query("SELECT * FROM clips WHERE projectId = :projectId ORDER BY position, id")
    fun observeClips(projectId: Long): Flow<List<ClipEntity>>
    @Query("SELECT * FROM clips WHERE projectId = :projectId ORDER BY position, id")
    suspend fun clips(projectId: Long): List<ClipEntity>
    @Query("SELECT filePath FROM clips") suspend fun allClipPaths(): List<String>
    @Query("SELECT COALESCE(MAX(position), -1) + 1 FROM clips WHERE projectId = :projectId")
    suspend fun nextPosition(projectId: Long): Int
}
