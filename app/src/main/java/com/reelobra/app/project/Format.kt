package com.reelobra.app.project

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object Format {
    /** 75_400 ms -> "1:15" ; 3_725_000 -> "1:02:05" */
    fun duration(ms: Long): String {
        val total = (ms.coerceAtLeast(0) + 500) / 1000
        val h = total / 3600
        val m = (total % 3600) / 60
        val s = total % 60
        return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
    }

    private val AR = Locale.forLanguageTag("es-AR")

    fun defaultTitle(now: Long): String =
        "Reel " + SimpleDateFormat("dd/MM HH:mm", AR).format(Date(now))

    fun dateTime(ts: Long): String = SimpleDateFormat("dd/MM/yyyy HH:mm", AR).format(Date(ts))
}
