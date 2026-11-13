package com.reelobra.app

import com.reelobra.app.project.RecoveryPlanner
import com.reelobra.app.project.RecoveryPlanner.Action
import com.reelobra.app.project.RecoveryPlanner.Candidate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RecoveryPlannerTest {
    private val big = RecoveryPlanner.MIN_VALID_BYTES * 10

    @Test fun knownFilesAreIgnored() {
        val r = RecoveryPlanner.plan(listOf(Candidate(1, "/a.mp4", big)), setOf("/a.mp4"), setOf(1))
        assertTrue(r.isEmpty())
    }

    @Test fun unknownValidFileIsRegistered() {
        val c = Candidate(1, "/b.mp4", big)
        assertEquals(listOf(Action.Register(c)), RecoveryPlanner.plan(listOf(c), emptySet(), setOf(1)))
    }

    @Test fun tinyFileIsDiscarded() {
        val c = Candidate(1, "/c.mp4", 100)
        assertEquals(listOf(Action.Discard(c)), RecoveryPlanner.plan(listOf(c), emptySet(), setOf(1)))
    }

    @Test fun fileOfDeletedProjectIsOrphanNotDeleted() {
        val c = Candidate(9, "/d.mp4", big)
        assertEquals(listOf(Action.Orphan(c)), RecoveryPlanner.plan(listOf(c), emptySet(), setOf(1)))
    }
}
