package com.reelobra.app

import com.reelobra.app.project.Format
import com.reelobra.app.project.ProjectStorage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FormatTest {
    @Test fun durationShort() = assertEquals("1:15", Format.duration(75_400))
    @Test fun durationRoundsHalfUp() = assertEquals("0:01", Format.duration(500))
    @Test fun durationZeroAndNegative() { assertEquals("0:00", Format.duration(0)); assertEquals("0:00", Format.duration(-50)) }
    @Test fun durationHours() = assertEquals("1:02:05", Format.duration(3_725_000))
    @Test fun defaultTitleStartsWithReel() = assertTrue(Format.defaultTitle(0).startsWith("Reel "))
    @Test fun clipNamesAreSortableAndMp4() {
        val a = ProjectStorage.clipFileName(1_700_000_000_000)
        val b = ProjectStorage.clipFileName(1_700_000_000_001)
        assertTrue(a.endsWith(".mp4")); assertTrue(a < b)
    }
}
