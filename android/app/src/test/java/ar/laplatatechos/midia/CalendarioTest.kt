package ar.laplatatechos.midia

import android.Manifest
import android.content.ContentProvider
import android.content.ContentUris
import android.content.ContentValues
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.provider.CalendarContract
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.util.TimeZone

/** Calendario de Android simulado en memoria: calendarios, eventos, instancias y avisos. */
class CalendarioFalso : ContentProvider() {
    val eventos = LinkedHashMap<Long, ContentValues>()
    var avisos = 0
    private var sig = 100L
    override fun onCreate() = true
    override fun getType(uri: Uri): String? = null

    override fun query(uri: Uri, proy: Array<out String>?, sel: String?, args: Array<out String>?, orden: String?): Cursor {
        val cols = proy ?: arrayOf()
        val c = MatrixCursor(cols)
        val seg = uri.pathSegments
        when (seg[0]) {
            "calendars" -> c.addRow(cols.map {
                when (it) {
                    CalendarContract.Calendars._ID -> 1L
                    CalendarContract.Calendars.CALENDAR_DISPLAY_NAME -> "La plata techos"
                    CalendarContract.Calendars.ACCOUNT_NAME, CalendarContract.Calendars.OWNER_ACCOUNT -> "yo@gmail.com"
                    CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL -> CalendarContract.Calendars.CAL_ACCESS_OWNER
                    CalendarContract.Calendars.IS_PRIMARY, CalendarContract.Calendars.VISIBLE -> 1
                    else -> null
                }
            }.toTypedArray())
            "instances" -> {
                val desde = seg[2].toLong(); val hasta = seg[3].toLong()
                eventos.entries.sortedBy { it.value.getAsLong(CalendarContract.Events.DTSTART) }.forEach { (id, v) ->
                    val ini = v.getAsLong(CalendarContract.Events.DTSTART); val fin = v.getAsLong(CalendarContract.Events.DTEND)
                    if (ini < hasta && fin > desde) c.addRow(cols.map {
                        when (it) {
                            CalendarContract.Instances.EVENT_ID -> id
                            CalendarContract.Instances.CALENDAR_ID -> 1L
                            CalendarContract.Instances.TITLE -> v.getAsString(CalendarContract.Events.TITLE)
                            CalendarContract.Instances.BEGIN -> ini
                            CalendarContract.Instances.END -> fin
                            CalendarContract.Instances.ALL_DAY -> v.getAsInteger(CalendarContract.Events.ALL_DAY) ?: 0
                            CalendarContract.Instances.EVENT_LOCATION -> v.getAsString(CalendarContract.Events.EVENT_LOCATION) ?: ""
                            CalendarContract.Instances.CALENDAR_DISPLAY_NAME -> "La plata techos"
                            CalendarContract.Instances.SELF_ATTENDEE_STATUS -> 1
                            CalendarContract.Instances.VISIBLE -> 1
                            CalendarContract.Instances.STATUS -> 1
                            else -> null
                        }
                    }.toTypedArray())
                }
            }
        }
        return c
    }

    override fun insert(uri: Uri, v: ContentValues?): Uri? {
        if (uri.pathSegments[0] == "reminders") { avisos++; return ContentUris.withAppendedId(uri, 1) }
        val id = sig++
        eventos[id] = ContentValues(v)
        return ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, id)
    }
    override fun delete(uri: Uri, s: String?, a: Array<out String>?) = if (eventos.remove(ContentUris.parseId(uri)) != null) 1 else 0
    override fun update(uri: Uri, v: ContentValues?, s: String?, a: Array<out String>?): Int {
        eventos[ContentUris.parseId(uri)]?.putAll(v); return 1
    }
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CalendarioTest {
    private lateinit var cal: CalendarioFalso
    private val app get() = RuntimeEnvironment.getApplication()

    @Before fun preparar() {
        TimeZone.setDefault(TimeZone.getTimeZone("America/Argentina/Buenos_Aires"))
        shadowOf(app).grantPermissions(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR)
        cal = Robolectric.setupContentProvider(CalendarioFalso::class.java, CalendarContract.AUTHORITY)
    }

    private val ahora = LocalDateTime.of(2026, 11, 10, 6, 0)
    private val hoy = LocalDate.of(2026, 11, 10)

    @Test fun agendaYLeeElDia() {
        val r1 = Asistente.agregar(app, "agregame a las 2 de la tarde una cita con Pérez", ahora)
        assertEquals("Agendado: Cita con Pérez, hoy a las 2 de la tarde.", r1.mensaje)
        Asistente.agregar(app, "a las 9 y media llamar al proveedor de chapa", ahora)
        Asistente.agregar(app, "recordame comprar membrana", ahora)
        Asistente.agregar(app, "mañana a las 10 presupuesto para Gómez", ahora)
        Asistente.agregar(app, "le debo 50 mil a Juan para el viernes", ahora)
        assertEquals(5, cal.eventos.size)
        assertTrue("los eventos con hora llevan aviso", cal.avisos >= 3)

        val delDia = Agenda.eventosDelDia(app, hoy)
        assertEquals(listOf("Llamar al proveedor de chapa", "Cita con Pérez", "📌 Comprar membrana"), delDia.map { it.titulo })
        val inicio = delDia[0].inicioLocal
        assertEquals(9, inicio.hour); assertEquals(30, inicio.minute)
        // la tarea de hoy no se cuela en mañana, ni la de mañana en hoy
        assertEquals(listOf("Presupuesto para Gómez"), Agenda.eventosDelDia(app, hoy.plusDays(1)).map { it.titulo })
        assertTrue(Agenda.eventosDelDia(app, LocalDate.of(2026, 11, 13)).any { it.titulo.contains("Pagar 50.000 pesos a Juan") })

        val resumen = Asistente.resumenDelDia(app, ahora)
        assertEquals(
            "Hoy es martes 10 de noviembre. Tenés 3 cosas. A las 9 y media de la mañana, Llamar al proveedor de chapa. " +
                "A las 2 de la tarde, Cita con Pérez. Y además, sin horario: Comprar membrana. Eso es todo.", resumen)
    }

    @Test fun deshacerYHecho() {
        val r = Asistente.agregar(app, "recordame llamar a Sosa", ahora)
        val e = Agenda.eventosDelDia(app, hoy).single()
        Agenda.marcarHecho(app, e)
        assertTrue(Agenda.eventosDelDia(app, hoy).single().hecho)
        assertTrue(Asistente.deshacer(app, r.eventoId))
        assertEquals(0, cal.eventos.size)
    }

    @Test fun tareaDeTodoElDiaGuardadaEnUtc() {
        Asistente.agregar(app, "agregame que tengo que ir a buscar las membranas", ahora)
        val v = cal.eventos.values.single()
        assertEquals(1, v.getAsInteger(CalendarContract.Events.ALL_DAY))
        assertEquals("UTC", v.getAsString(CalendarContract.Events.EVENT_TIMEZONE))
        assertEquals(hoy.atStartOfDay(ZoneId.of("UTC")).toInstant().toEpochMilli(), v.getAsLong(CalendarContract.Events.DTSTART))
    }
}
