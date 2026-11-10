package ar.laplatatechos.midia

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDateTime

/** Mismos casos que tests/parser.test.js. Martes 10/11/2026 10:00. */
class ParserTest {
    private val ahora = LocalDateTime.of(2026, 11, 10, 10, 0)
    private val fallas = mutableListOf<String>()

    private fun caso(frase: String, esperado: Map<String, Any?>) {
        val r = Parser.interpretar(frase, ahora)
        val real = mutableMapOf<String, Any?>(
            "tipo" to r.tipo, "titulo" to r.titulo, "fecha" to r.fecha?.toString(),
            "hora" to r.hora?.let { "%02d:%02d".format(it.h, it.m) }
        )
        r.deuda?.let {
            real["persona"] = it.persona; real["monto"] = it.monto; real["moneda"] = it.moneda
            real["direccion"] = it.direccion; real["concepto"] = it.concepto
        }
        val mal = esperado.filter { (k, v) -> real[k] != v }
        if (mal.isNotEmpty()) fallas.add("\"$frase\" esperado=$esperado obtenido=$real")
    }

    @Test
    fun frases() {
        caso("agregame a las 2 de la tarde una cita con Pérez", mapOf("tipo" to "evento", "titulo" to "Cita con Pérez", "fecha" to "2026-11-10", "hora" to "14:00"))
        caso("Agendame mañana a las 9 de la mañana medición en Gonnet", mapOf("tipo" to "evento", "titulo" to "Medición en Gonnet", "fecha" to "2026-11-11", "hora" to "09:00"))
        caso("reunión con el arquitecto el viernes a las 10 y media", mapOf("tipo" to "evento", "titulo" to "Reunión con el arquitecto", "fecha" to "2026-11-13", "hora" to "10:30"))
        caso("a las 3 presupuesto para la señora Gómez", mapOf("tipo" to "evento", "titulo" to "Presupuesto para la señora Gómez", "fecha" to "2026-11-10", "hora" to "15:00"))
        caso("visita obra City Bell 17:45", mapOf("tipo" to "evento", "titulo" to "Visita obra City Bell", "fecha" to "2026-11-10", "hora" to "17:45"))
        caso("el 15 de diciembre a las 8 entrega de materiales", mapOf("tipo" to "evento", "titulo" to "Entrega de materiales", "fecha" to "2026-12-15", "hora" to "08:00"))
        caso("llamar al proveedor de chapa a las dos", mapOf("tipo" to "evento", "titulo" to "Llamar al proveedor de chapa", "fecha" to "2026-11-10", "hora" to "14:00"))
        caso("dentista a las 7 menos cuarto de la tarde", mapOf("tipo" to "evento", "titulo" to "Dentista", "fecha" to "2026-11-10", "hora" to "18:45"))
        caso("agregame una cita con Juan Carlos el lunes al mediodía", mapOf("tipo" to "evento", "titulo" to "Cita con Juan Carlos", "fecha" to "2026-11-16", "hora" to "12:00"))
        caso("a las 8 de la mañana ir al corralón", mapOf("tipo" to "evento", "titulo" to "Ir al corralón", "fecha" to "2026-11-11", "hora" to "08:00"))
        caso("pasado mañana a la tarde pasar por lo de Martínez", mapOf("tipo" to "evento", "titulo" to "Pasar por lo de Martínez", "fecha" to "2026-11-12", "hora" to "16:00"))
        caso("el 20 a las 11 firma de contrato", mapOf("tipo" to "evento", "titulo" to "Firma de contrato", "fecha" to "2026-11-20", "hora" to "11:00"))
        caso("cena a las 21 hs", mapOf("tipo" to "evento", "titulo" to "Cena", "fecha" to "2026-11-10", "hora" to "21:00"))
        caso("Agendá para el jueves a las 4 y cuarto la inspección del techo de Ramírez", mapOf("tipo" to "evento", "titulo" to "Inspección del techo de Ramírez", "fecha" to "2026-11-12", "hora" to "16:15"))
        caso("agregame que tengo que ir a buscar las membranas", mapOf("tipo" to "tarea", "titulo" to "Ir a buscar las membranas", "fecha" to "2026-11-10", "hora" to null))
        caso("recordame mañana comprar tornillos autoperforantes", mapOf("tipo" to "tarea", "titulo" to "Comprar tornillos autoperforantes", "fecha" to "2026-11-11", "hora" to null))
        caso("anotá mandar la memoria técnica a López el miércoles", mapOf("tipo" to "tarea", "titulo" to "Mandar la memoria técnica a López", "fecha" to "2026-11-11", "hora" to null))
        caso("le debo 50 mil a Juan", mapOf("tipo" to "deuda", "persona" to "Juan", "monto" to 50000L, "moneda" to "ARS", "direccion" to "DEBO", "fecha" to null))
        caso("agregame una deuda con Corralón Norte de $350.000 por las chapas", mapOf("tipo" to "deuda", "persona" to "Corralón Norte", "monto" to 350000L, "direccion" to "DEBO", "concepto" to "Las chapas"))
        caso("tengo que pagarle a Pedro 120000 el viernes", mapOf("tipo" to "deuda", "persona" to "Pedro", "monto" to 120000L, "fecha" to "2026-11-13", "direccion" to "DEBO"))
        caso("le debo 300 dólares a mi cuñado", mapOf("tipo" to "deuda", "persona" to "Mi cuñado", "monto" to 300L, "moneda" to "USD"))
        caso("Gómez me debe 1,5 millones de la obra de Tolosa", mapOf("tipo" to "deuda", "persona" to "Gómez", "monto" to 1500000L, "direccion" to "ME_DEBEN", "concepto" to "Obra de Tolosa"))
        caso("me deben 80 lucas de Fernández", mapOf("tipo" to "deuda", "persona" to "Fernández", "monto" to 80000L, "direccion" to "ME_DEBEN"))
        caso("tengo que cobrarle a Ramírez cincuenta mil el 25", mapOf("tipo" to "deuda", "persona" to "Ramírez", "monto" to 50000L, "direccion" to "ME_DEBEN", "fecha" to "2026-11-25"))
        caso("debo 25.500 al gomero", mapOf("tipo" to "deuda", "persona" to "Gomero", "monto" to 25500L, "direccion" to "DEBO"))
        assertEquals(fallas.joinToString("\n"), 0, fallas.size)
    }

    @Test
    fun formatos() {
        assertEquals("a las 2 de la tarde", Parser.horaHablada(14, 0))
        assertEquals("a las 8 y media de la mañana", Parser.horaHablada(8, 30))
        assertEquals("a la 1 de la tarde", Parser.horaHablada(13, 0))
        assertEquals("a las 12 del mediodía", Parser.horaHablada(12, 0))
        assertEquals("a las 7 menos cuarto de la tarde", Parser.horaHablada(18, 45))
        assertEquals("1.500.000", Parser.formatearMiles(1500000))
    }
}
