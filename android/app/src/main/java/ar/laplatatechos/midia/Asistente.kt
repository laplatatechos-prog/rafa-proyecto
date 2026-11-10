package ar.laplatatechos.midia

import android.content.Context
import java.time.LocalDate
import java.time.LocalDateTime

data class Resultado(val mensaje: String, val eventoId: Long)

/** Arma el resumen hablado y agrega cosas desde una frase. */
object Asistente {
    private val EMOJIS = Regex("[\\x{1F000}-\\x{1FFFF}\\x{2600}-\\x{27BF}\\x{FE0F}\\x{200D}]")
    fun paraVoz(s: String) = s.replace(EMOJIS, "").replace(Regex("\\s+"), " ").trim()

    /** Sólo lo que hay que hacer hoy. Sin deudas, sin totales. */
    fun resumenDelDia(ctx: Context, ahora: LocalDateTime = LocalDateTime.now()): String {
        val hoy = ahora.toLocalDate()
        val nowMs = ahora.atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli()
        val eventos = Agenda.eventosDelDia(ctx, hoy).filter { !it.hecho }
        val conHora = eventos.filter { !it.todoElDia && it.fin > nowMs }
        val sinHora = eventos.filter { it.todoElDia }
        val p = mutableListOf<String>()
        p.add("Hoy es ${Parser.DIAS_ACENTO[Parser.jsDia(hoy)]} ${hoy.dayOfMonth} de ${Parser.MESES[hoy.monthValue - 1]}.")
        if (!Agenda.tienePermiso(ctx)) {
            p.add("No tengo permiso para leer tu calendario. Abrí la app y dámelo.")
            return p.joinToString(" ")
        }
        val total = conHora.size + sinHora.size
        if (total == 0) {
            p.add("No tenés nada agendado para hoy.")
            return p.joinToString(" ")
        }
        p.add(if (total == 1) "Tenés una sola cosa." else "Tenés $total cosas.")
        conHora.forEachIndexed { i, e ->
            val t = e.inicioLocal
            var linea = Parser.capitalizar(Parser.horaHablada(t.hour, t.minute)) + ", " + paraVoz(e.titulo)
            if (e.lugar.isNotBlank()) linea += ", en " + paraVoz(e.lugar.substringBefore(","))
            p.add("$linea.")
            if (i == 0 && conHora.size > 2) p.add("Después:")
        }
        if (sinHora.isNotEmpty()) {
            p.add((if (conHora.isEmpty()) "Sin horario: " else "Y además, sin horario: ") +
                sinHora.joinToString("; ") { paraVoz(it.titulo.removePrefix("📌")) } + ".")
        }
        p.add("Eso es todo.")
        return p.joinToString(" ")
    }

    fun agregar(ctx: Context, texto: String, ahora: LocalDateTime = LocalDateTime.now()): Resultado {
        val limpio = texto.trim()
        if (limpio.isEmpty()) return Resultado("No escuché nada.", -1)
        if (!Agenda.tienePermiso(ctx)) return Resultado("Necesito permiso para el calendario. Abrí la app.", -1)
        val r = Parser.interpretar(limpio, ahora)
        val hoy = ahora.toLocalDate()
        val desc = "Creado por Mi Día\nDictado: \"$limpio\""
        val res = when (r.tipo) {
            "evento" -> {
                val id = Agenda.crear(ctx, r.titulo, r.fecha!!, r.hora, 60, 30, desc)
                Resultado("Agendado: ${r.titulo}, ${Parser.fechaHablada(r.fecha, hoy)} ${Parser.horaHablada(r.hora!!.h, r.hora.m)}.", id)
            }
            "tarea" -> {
                val id = Agenda.crear(ctx, "📌 " + r.titulo, r.fecha!!, null, 0, null, desc)
                Resultado("Anotado para ${Parser.fechaHablada(r.fecha, hoy)}: ${r.titulo}.", id)
            }
            else -> {
                val d = r.deuda!!
                val dia: LocalDate = d.vence ?: hoy
                val plata = if (d.monto > 0) Parser.montoHablado(d.monto, d.moneda) else "plata"
                val titulo = (if (d.direccion == "DEBO") "💸 Pagar $plata a " else "💰 Cobrar $plata a ") + d.persona +
                    (if (d.concepto.isNotEmpty()) " (${d.concepto})" else "")
                val id = Agenda.crear(ctx, titulo, dia, r.hora, 30, if (r.hora != null) 60 else null, desc)
                var msg = if (d.direccion == "DEBO") "Anotado: pagarle $plata a ${d.persona}" else "Anotado: cobrarle $plata a ${d.persona}"
                msg += ", " + Parser.fechaHablada(dia, hoy)
                if (d.monto <= 0) msg += ". No entendí el monto"
                Resultado("$msg.", id)
            }
        }
        if (res.eventoId < 0) return Resultado("No pude guardarlo en el calendario. Revisá que tengas una cuenta de Google en el celu.", -1)
        Prefs(ctx).ultimoEvento = res.eventoId
        MiDiaWidget.actualizar(ctx)
        return res
    }

    fun deshacer(ctx: Context, id: Long): Boolean {
        val ok = id >= 0 && Agenda.borrar(ctx, id)
        MiDiaWidget.actualizar(ctx)
        return ok
    }

    /* ---- respuestas por voz ---- */
    private fun n(s: String?) = Parser.normalizar(s ?: "")
    fun diceDespierto(s: String?) = Regex("""despiert|levant|ya estoy|aca estoy|estoy\b|listo|basta|ya va|arriba|\bsi\b|dale|bueno|ok""").containsMatchIn(n(s))
    fun diceSi(s: String?) = Regex("""\b(si|dale|deci|decime|conta|contame|bueno|ok|okey|listo|va|claro|obvio|de una|arranca)\b""").containsMatchIn(n(s))
    fun diceNo(s: String?) = Regex("""^\s*(no|nada|ahora no|despues|mas tarde|no gracias|eso es todo|listo|chau|ninguna?|nada mas|no nada)\b""").containsMatchIn(n(s))
    /** "sí" a secas, sin contenido para anotar. */
    fun soloSi(s: String?) = Regex("""^\s*(si|dale|bueno|ok|okey|claro|si quiero|si dale|va)\s*[.!]?\s*$""").matches(n(s))
}
