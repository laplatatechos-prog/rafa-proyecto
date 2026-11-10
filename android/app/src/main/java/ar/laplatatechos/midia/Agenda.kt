package ar.laplatatechos.midia

import android.Manifest
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.provider.CalendarContract.Attendees
import android.provider.CalendarContract.Calendars
import android.provider.CalendarContract.Events
import android.provider.CalendarContract.Instances
import android.provider.CalendarContract.Reminders
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.TimeZone

data class Evento(
    val id: Long, val calId: Long, val titulo: String, val inicio: Long, val fin: Long,
    val todoElDia: Boolean, val lugar: String, val calendario: String
) {
    val hecho get() = titulo.startsWith("✅")
    val inicioLocal: LocalDateTime get() = LocalDateTime.ofInstant(java.time.Instant.ofEpochMilli(inicio), ZoneId.systemDefault())
}

data class Calendario(val id: Long, val nombre: String, val cuenta: String, val principal: Boolean)

/**
 * Lee y escribe en los calendarios del celular (los de Google se sincronizan solos).
 * No necesita internet ni claves: usa el proveedor de calendario de Android.
 */
object Agenda {
    /** Eventos que no son tareas: el aviso viejo de la app web y los informes. */
    private val EXCLUIR = Regex("""^(☀️\s*Mi Día|🔔\s*Informe)""")

    fun tienePermiso(ctx: Context) =
        ctx.checkSelfPermission(Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED &&
            ctx.checkSelfPermission(Manifest.permission.WRITE_CALENDAR) == PackageManager.PERMISSION_GRANTED

    fun calendarios(ctx: Context, soloEscribibles: Boolean = false): List<Calendario> {
        if (!tienePermiso(ctx)) return emptyList()
        val out = mutableListOf<Calendario>()
        val proy = arrayOf(Calendars._ID, Calendars.CALENDAR_DISPLAY_NAME, Calendars.ACCOUNT_NAME,
            Calendars.CALENDAR_ACCESS_LEVEL, Calendars.IS_PRIMARY, Calendars.VISIBLE, Calendars.OWNER_ACCOUNT)
        ctx.contentResolver.query(Calendars.CONTENT_URI, proy, null, null, null)?.use { c ->
            while (c.moveToNext()) {
                val acceso = c.getInt(3)
                if (soloEscribibles && acceso < Calendars.CAL_ACCESS_CONTRIBUTOR) continue
                if (c.getInt(5) == 0) continue
                val principal = c.getInt(4) == 1 || (c.getString(2) != null && c.getString(2) == c.getString(6))
                out.add(Calendario(c.getLong(0), c.getString(1) ?: "Calendario", c.getString(2) ?: "", principal))
            }
        }
        return out.sortedByDescending { it.principal }
    }

    fun calendarioDestino(ctx: Context): Long {
        val elegido = Prefs(ctx).calendarioId
        val lista = calendarios(ctx, soloEscribibles = true)
        return lista.firstOrNull { it.id == elegido }?.id ?: lista.firstOrNull()?.id ?: -1
    }

    fun eventosDelDia(ctx: Context, dia: LocalDate): List<Evento> {
        if (!tienePermiso(ctx)) return emptyList()
        val zona = ZoneId.systemDefault()
        val desde = dia.atStartOfDay(zona).toInstant().toEpochMilli()
        val hasta = dia.plusDays(1).atStartOfDay(zona).toInstant().toEpochMilli()
        val diaUtc = dia.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        val uri = Instances.CONTENT_URI.buildUpon().also {
            ContentUris.appendId(it, desde - 86_400_000L)
            ContentUris.appendId(it, hasta + 86_400_000L)
        }.build()
        val proy = arrayOf(Instances.EVENT_ID, Instances.CALENDAR_ID, Instances.TITLE, Instances.BEGIN, Instances.END,
            Instances.ALL_DAY, Instances.EVENT_LOCATION, Instances.CALENDAR_DISPLAY_NAME, Instances.SELF_ATTENDEE_STATUS,
            Instances.VISIBLE, Instances.STATUS)
        val vistos = HashSet<String>()
        val out = mutableListOf<Evento>()
        ctx.contentResolver.query(uri, proy, null, null, "${Instances.BEGIN} ASC")?.use { c ->
            while (c.moveToNext()) {
                if (c.getInt(9) == 0) continue
                if (c.getInt(10) == Events.STATUS_CANCELED) continue
                if (c.getInt(8) == Attendees.ATTENDEE_STATUS_DECLINED) continue
                val titulo = c.getString(2) ?: "(sin título)"
                if (EXCLUIR.containsMatchIn(titulo)) continue
                val todo = c.getInt(5) == 1
                val ini = c.getLong(3)
                val fin = c.getLong(4)
                val delDia = if (todo) ini <= diaUtc && fin > diaUtc else ini >= desde && ini < hasta
                if (!delDia) continue
                if (!vistos.add("$titulo|$ini")) continue
                out.add(Evento(c.getLong(0), c.getLong(1), titulo, ini, fin, todo, c.getString(6) ?: "", c.getString(7) ?: ""))
            }
        }
        return out.sortedWith(compareBy<Evento> { it.todoElDia }.thenBy { it.inicio })
    }

    /** Crea un evento. Sin hora = todo el día. Devuelve el id o -1. */
    fun crear(ctx: Context, titulo: String, dia: LocalDate, hora: Hora?, minutos: Int, avisoMin: Int?, descripcion: String): Long {
        val cal = calendarioDestino(ctx)
        if (cal < 0) return -1
        val v = ContentValues().apply {
            put(Events.CALENDAR_ID, cal)
            put(Events.TITLE, titulo)
            put(Events.DESCRIPTION, descripcion)
            if (hora != null) {
                val ini = dia.atTime(hora.h, hora.m).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
                put(Events.DTSTART, ini)
                put(Events.DTEND, ini + minutos * 60_000L)
                put(Events.EVENT_TIMEZONE, TimeZone.getDefault().id)
            } else {
                val ini = dia.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
                put(Events.DTSTART, ini)
                put(Events.DTEND, ini + 86_400_000L)
                put(Events.ALL_DAY, 1)
                put(Events.EVENT_TIMEZONE, "UTC")
            }
            put(Events.HAS_ALARM, if (avisoMin != null) 1 else 0)
        }
        val uri = ctx.contentResolver.insert(Events.CONTENT_URI, v) ?: return -1
        val id = ContentUris.parseId(uri)
        if (avisoMin != null) {
            ctx.contentResolver.insert(Reminders.CONTENT_URI, ContentValues().apply {
                put(Reminders.EVENT_ID, id)
                put(Reminders.MINUTES, avisoMin)
                put(Reminders.METHOD, Reminders.METHOD_ALERT)
            })
        }
        return id
    }

    fun borrar(ctx: Context, id: Long): Boolean =
        ctx.contentResolver.delete(ContentUris.withAppendedId(Events.CONTENT_URI, id), null, null) > 0

    fun marcarHecho(ctx: Context, e: Evento) {
        val v = ContentValues().apply { put(Events.TITLE, "✅ " + e.titulo.removePrefix("📌").trim()) }
        ctx.contentResolver.update(ContentUris.withAppendedId(Events.CONTENT_URI, e.id), v, null, null)
    }

}
