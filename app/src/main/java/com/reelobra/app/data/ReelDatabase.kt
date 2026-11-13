package com.reelobra.app.data

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(entities = [ProjectEntity::class, ClipEntity::class], version = 1, exportSchema = true)
abstract class ReelDatabase : RoomDatabase() {
    abstract fun projectDao(): ProjectDao
}
