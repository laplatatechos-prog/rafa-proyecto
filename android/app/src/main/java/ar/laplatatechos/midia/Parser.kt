package ar.laplatatechos.midia

import java.text.Normalizer
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.temporal.ChronoUnit

/**
 * Intérprete de frases en castellano rioplatense.
 * "agregame a las 2 de la tarde una cita con Pérez" -> evento hoy 14:00 "Cita con Pérez".
 * Port fiel de apps-script/Parser.gs (mismas reglas, mismas pruebas).
 */
data class Hora(val h: Int, val m: Int)

data class Deuda(
    val direccion: String, // DEBO | ME_DEBEN
    val persona: String,
    val monto: Long,
    val moneda: String, // ARS | USD
    val concepto: String,
    val vence: LocalDate?
)

data class Interpretacion(
    val tipo: String, // evento | tarea | deuda
    val titulo: String,
    val fecha: LocalDate?,
    val hora: Hora?,
    val deuda: Deuda?
)

object Parser {
    // índice = día de semana estilo JS (0 = domingo)
    val DIAS = listOf("domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado")
    val DIAS_ACENTO = listOf("domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado")
    val MESES = listOf("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
        "septiembre", "octubre", "noviembre", "diciembre")

    private val NUMEROS = mapOf(
        "una" to 1, "uno" to 1, "un" to 1, "dos" to 2, "tres" to 3, "cuatro" to 4, "cinco" to 5, "seis" to 6,
        "siete" to 7, "ocho" to 8, "nueve" to 9, "diez" to 10, "once" to 11, "doce" to 12, "quince" to 15,
        "veinte" to 20, "treinta" to 30, "cuarenta" to 40, "cincuenta" to 50, "sesenta" to 60,
        "setenta" to 70, "ochenta" to 80, "noventa" to 90, "cien" to 100, "doscientos" to 200,
        "trescientos" to 300, "cuatrocientos" to 400, "quinientos" to 500
    )

    private val CORTE = setOf(
        "de", "del", "por", "para", "el", "la", "los", "las", "que", "hasta", "antes",
        "manana", "hoy", "pasado", "y", "en", "al", "a", "con", "mil", "pesos", "dolares", "lucas",
        "vence", "este", "esta", "proximo", "semana", "mes", "me", "le", "les", "lo", "se", "debo",
        "debe", "deben", "pagar", "pagarle", "cobrar", "cobrarle", "tengo", "tiene", "son", "es"
    ) + DIAS

    fun jsDia(d: LocalDate) = d.dayOfWeek.value % 7

    /** Minúsculas sin acentos, conservando el largo exacto. */
    fun normalizar(s: String): String = buildString(s.length) {
        for (c in s) {
            val d = Normalizer.normalize(c.toString(), Normalizer.Form.NFD)
            append(if (d.isEmpty()) c else d[0].lowercaseChar())
        }
    }

    private fun numerosEnPalabras(texto: String): String {
        val claves = NUMEROS.keys.joinToString("|")
        var s = texto
        s = Regex("""\b(las?)\s+($claves)\b""", RegexOption.IGNORE_CASE).replace(s) {
            it.groupValues[1] + " " + NUMEROS[it.groupValues[2].lowercase()]
        }
        s = Regex("""\b(y|menos)\s+($claves)\b(?!\s+mil)""", RegexOption.IGNORE_CASE).replace(s) {
            it.groupValues[1] + " " + NUMEROS[it.groupValues[2].lowercase()]
        }
        s = Regex("""\b($claves)\s+(mil|mill[oó]n|millones|lucas?|pesos|d[oó]lares)\b""", RegexOption.IGNORE_CASE).replace(s) {
            NUMEROS[it.groupValues[1].lowercase()].toString() + " " + it.groupValues[2]
        }
        return s
    }

    private class Texto(var o: String) {
        var n: String = normalizar(o)
        fun quitar(re: Regex): MatchResult? {
            val m = re.find(n) ?: return null
            val ini = m.range.first
            val fin = m.range.last + 1
            o = o.substring(0, ini) + " " + o.substring(fin)
            n = n.substring(0, ini) + " " + n.substring(fin)
            return m
        }
        fun buscar(re: Regex): MatchResult? = re.find(n)
    }

    private fun MatchResult.g(i: Int): String? = groups[i]?.value?.takeIf { it.isNotEmpty() }

    private const val PERIODO = """(?:\s*(?:de|a|en|por)\s+la\s+(manana|tarde|noche|madrugada)|\s*(a\.?\s?m\.?|p\.?\s?m\.?)(?![a-z]))?"""
    private val RE_MEDIODIA = Regex("""\b(?:al|a\s+el|para\s+el|tipo)\s+mediodia\b""")
    private val RE_HORA = Regex(
        """\b(?:(?:a|para|desde|tipo|como)\s+)?(?:eso\s+de\s+)?(?:las?)\s+(\d{1,2})(?:\s*[:.h]\s*(\d{2}))?(?!\d)""" +
            """(?:\s*(?:hs|horas|h)\b\.?)?""" +
            """(?:\s+y\s+(media|cuarto|\d{1,2}))?""" +
            """(?:\s+menos\s+(cuarto|\d{1,2}))?""" +
            """(?:\s*(?:hs|horas)\b\.?)?""" + PERIODO
    )
    private val RE_HORA2 = Regex("""\b(\d{1,2})(?:\s*[:.]\s*(\d{2})(?!\d)(?:\s*(?:hs|horas)\b\.?)?|\s*(?:hs|horas)\b\.?)()()""" + PERIODO)

    private fun extraerHora(t: Texto): Hora? {
        if (t.quitar(RE_MEDIODIA) != null) return Hora(12, 0)
        val m = t.quitar(RE_HORA) ?: t.quitar(RE_HORA2) ?: return null
        var h = m.g(1)!!.toInt()
        var min = m.g(2)?.toInt() ?: 0
        m.g(3)?.let { min = when (it) { "media" -> 30; "cuarto" -> 15; else -> it.toInt() } }
        m.g(4)?.let {
            h -= 1
            min = if (it == "cuarto") 45 else 60 - it.toInt()
        }
        val per = m.g(5)
        val ampm = m.g(6)?.replace(Regex("[^ap]"), "")
        if (h > 23 || min > 59) return null
        if (per == "tarde" || per == "noche" || ampm == "p") {
            if (h < 12) h += 12
        } else if (per == "manana" || per == "madrugada" || ampm == "a") {
            if (h == 12) h = 0
        } else if (h in 1..6 && m.g(2) == null) {
            h += 12 // "a las 3" en horario de obra = 15 hs
        }
        if (h < 0) h += 24
        return Hora(h, min)
    }

    /** Fecha con desborde estilo JS (31 de un mes de 30 = 1 del siguiente). */
    private fun fechaDesbordada(anio: Int, mes0: Int, dia: Int): LocalDate =
        LocalDate.of(anio, 1, 1).plusMonths(mes0.toLong()).plusDays((dia - 1).toLong())

    private fun fechaExplicita(hoy: LocalDate, dia: Int, mes0: Int, anio: Int?): LocalDate? {
        if (mes0 < 0 || mes0 > 11 || dia < 1 || dia > 31) return null
        var f = fechaDesbordada(anio ?: hoy.year, mes0, dia)
        if (anio == null && f.isBefore(hoy)) f = fechaDesbordada(hoy.year + 1, mes0, dia)
        return f
    }

    private val RE_PASADO = Regex("""\b(?:para\s+)?pasado\s+manana\b""")
    private val RE_MANANA = Regex("""\b(?:para\s+)?manana\b""")
    private val RE_HOY = Regex("""\b(?:para\s+)?hoy\b""")
    private val RE_FECHA_MES = Regex("""\b(?:para\s+)?(?:el\s+)?(?:dia\s+)?(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+(?:de\s+|del\s+)?(\d{4}))?\b""")
    private val RE_FECHA_BARRA = Regex("""\b(?:para\s+)?(?:el\s+)?(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b""")
    private val RE_DIA_SEMANA = Regex("""\b(?:para\s+)?(?:(?:el|este|esta)\s+)?(?:proximo\s+)?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)(?:\s+que\s+viene|\s+proximo)?\b""")
    private val RE_EL_N = Regex("""\b(?:para\s+)?el\s+(?:dia\s+)?(\d{1,2})\b(?!\s*(?:[:.]\d|hs|horas|mil|lucas|pesos|dolares|%))""")
    private val RE_SEMANA = Regex("""\b(?:para\s+)?la\s+semana\s+que\s+viene\b""")

    private fun extraerFecha(t: Texto, hoy: LocalDate): LocalDate? {
        if (t.quitar(RE_PASADO) != null) return hoy.plusDays(2)
        if (t.quitar(RE_MANANA) != null) return hoy.plusDays(1)
        if (t.quitar(RE_HOY) != null) return hoy
        t.quitar(RE_FECHA_MES)?.let { m ->
            val mes = if (m.g(2) == "setiembre") 8 else MESES.indexOf(m.g(2))
            return fechaExplicita(hoy, m.g(1)!!.toInt(), mes, m.g(3)?.toInt())
        }
        t.quitar(RE_FECHA_BARRA)?.let { m ->
            var anio = m.g(3)?.toInt()
            if (anio != null && anio < 100) anio += 2000
            return fechaExplicita(hoy, m.g(1)!!.toInt(), m.g(2)!!.toInt() - 1, anio)
        }
        t.quitar(RE_DIA_SEMANA)?.let { m ->
            val objetivo = DIAS.indexOf(m.g(1))
            var diff = (objetivo - jsDia(hoy) + 7) % 7
            if (diff == 0) diff = 7
            return hoy.plusDays(diff.toLong())
        }
        t.quitar(RE_EL_N)?.let { m ->
            val dia = m.g(1)!!.toInt()
            if (dia in 1..31) {
                var f = fechaDesbordada(hoy.year, hoy.monthValue - 1, dia)
                if (f.isBefore(hoy)) f = fechaDesbordada(hoy.year, hoy.monthValue, dia)
                return f
            }
        }
        if (t.quitar(RE_SEMANA) != null) return hoy.plusDays(7)
        return null
    }

    private val RE_MONTO = Regex("""(?:\$|u\${'$'}s|usd)?\s*\b(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(mil|millon(?:es)?|lucas?|k)?\b\s*(pesos|dolares|usd|mangos|verdes)?""")

    private fun extraerMonto(t: Texto): Pair<Long, String>? {
        val m = t.quitar(RE_MONTO) ?: return null
        val crudo = m.g(1)!!
        var valor = if (Regex("""^\d{1,3}([.,]\d{3})+$""").matches(crudo)) crudo.replace(Regex("[.,]"), "").toDouble()
        else crudo.replace(',', '.').toDouble()
        val mult = m.g(2) ?: ""
        if (mult.startsWith("millon")) valor *= 1_000_000
        else if (mult.startsWith("mil") || mult.startsWith("luca") || mult.startsWith("k")) valor *= 1000
        val moneda = if (Regex("dolar|usd|verde").containsMatchIn(m.g(3) ?: "") || Regex("""u\${'$'}s|usd""").containsMatchIn(m.value)) "USD" else "ARS"
        return Math.round(valor) to moneda
    }

    fun capitalizar(s: String): String {
        val t = s.trim()
        return if (t.isEmpty()) t else t.substring(0, 1).uppercase() + t.substring(1)
    }

    private fun tomarNombre(t: Texto, desde: Int): String? {
        val restoO = t.o.substring(desde)
        val restoN = t.n.substring(desde)
        val pn = restoN.split(Regex("""\s+"""))
        val po = restoO.split(Regex("""\s+"""))
        val out = mutableListOf<String>()
        var consumido = 0
        var i = 0
        while (i < pn.size && pn[i] == "") { consumido += 1; i++ }
        while (i < pn.size && out.size < 4) {
            val p = pn[i].replace(Regex("""[.,;:!?]+$"""), "")
            if (p.isEmpty() || p in CORTE || Regex("""^[\d$]""").containsMatchIn(p)) break
            out.add(po.getOrElse(i) { pn[i] }.replace(Regex("""[.,;:!?]+$"""), ""))
            consumido += pn[i].length + 1
            if (Regex("""[.,;:!?]$""").containsMatchIn(pn[i])) break
            i++
        }
        if (out.isEmpty()) return null
        val fin = minOf(desde + consumido, t.n.length)
        t.o = t.o.substring(0, desde) + " " + t.o.substring(fin)
        t.n = t.n.substring(0, desde) + " " + t.n.substring(fin)
        if (Regex("^(?:mi|tu|su|el|la|los|las)$", RegexOption.IGNORE_CASE).matches(out[0])) return capitalizar(out.joinToString(" "))
        return out.joinToString(" ") { capitalizar(it) }
    }

    private val RE_PREFIJOS = Regex(
        """^\s*(?:che|dale|bueno|por\s+favor|porfa|ok|okey|hola)?[\s,]*(?:(?:agregame|agrega|agregar|agregalo|anadi|anademe|agenda|agendame|agendar|anotame|anota|anotar|poneme|pone|ponme|recordame|recorda|acordame|haceme\s+acordar|creame|crea|crear|guardame|guarda|sumame|suma)\b(?:\s+(?:de|que|para))?)?\s*(?:(?:que\s+)?(?:tengo|tenemos|hay)\s+que\s+)?(?:(?:un|una)\s+)?(?:(?:recordatorio|tarea|evento|pendiente|nota)\b(?:\s+(?:de|para|que))?\s*)?"""
    )
    private val RE_CONECTORES = Regex("""^(?:(?:y|a|el|la|para|de|que|en|con|por|un|una|me|tambien|ademas)\b[\s,]*)+""")

    fun limpiarTitulo(texto: String): String {
        var s = texto.replace(Regex("""\s+"""), " ").replace(Regex("""\s+([,.;:])"""), "$1").trim()
        var n = normalizar(s)
        RE_PREFIJOS.find(n)?.let { m ->
            if (m.value.isNotEmpty()) { s = s.substring(m.value.length); n = n.substring(m.value.length) }
        }
        RE_CONECTORES.find(n)?.let { m ->
            if (m.value.isNotEmpty()) {
                if (n.substring(m.value.length).trim().isEmpty()) return ""
                s = s.substring(m.value.length)
            }
        }
        s = s.replace(Regex("""[\s,;:.]+(?:y|a|el|la|para|de|que|en|con|por|las?)?[\s,;:.]*$""", RegexOption.IGNORE_CASE), "").trim()
        s = s.replace(Regex("""^[\s,;:.]+"""), "")
        return capitalizar(s)
    }

    private val RE_ME_DEBEN = Regex("""\b(?:me\s+deben?|me\s+tienen?\s+que\s+(?:pagar|devolver)|(?:tengo\s+que\s+)?cobrar(?:le|les)?)\b""")
    private val RE_DEBO = Regex("""\b(?:le\s+|les\s+)?debo\b|\bdeuda\b|\bpagar(?:le|les)?\b|\bdevolver(?:le|les)?\b|\bprestamo\b""")

    fun interpretar(texto: String, ahora: LocalDateTime = LocalDateTime.now()): Interpretacion {
        val hoy = ahora.toLocalDate()
        val t = Texto(numerosEnPalabras(texto.trim()))
        val esMeDeben = RE_ME_DEBEN.containsMatchIn(t.n)
        val esDebo = !esMeDeben && RE_DEBO.containsMatchIn(t.n)

        var hora = extraerHora(t)
        val fecha = extraerFecha(t, hoy)
        if (hora == null) {
            t.quitar(Regex("""\b(?:a|por|en|de|durante)\s+la\s+(manana|tarde|noche)\b"""))?.let {
                hora = Hora(mapOf("manana" to 9, "tarde" to 16, "noche" to 20)[it.g(1)]!!, 0)
            }
        }
        if (hora == null) hora = extraerHora(t)

        if (esDebo || esMeDeben) {
            var monto = extraerMonto(t)
            var persona: String? = null
            if (esMeDeben) {
                val mm = t.buscar(Regex("""\b(?:me\s+deben?|me\s+tienen?\s+que\s+(?:pagar|devolver))\b"""))
                val antes = if (mm != null) t.n.substring(0, mm.range.first) else ""
                val limpioAntes = limpiarTitulo(t.o.substring(0, mm?.range?.first ?: 0))
                t.quitar(Regex("""\b(?:que\s+)?(?:me\s+deben?|me\s+tienen?\s+que\s+(?:pagar|devolver)|(?:tengo\s+que\s+)?cobrar(?:le|les)?)\b"""))
                t.buscar(Regex("""\b(?:a|de|con)\s+(?=[^\s\d$])"""))?.let { persona = tomarNombre(t, it.range.last + 1) }
                if (persona == null && limpioAntes.isNotEmpty() && antes.isNotBlank() && mm != null) {
                    persona = limpioAntes.split(Regex("""\s+""")).takeLast(3).joinToString(" ") { capitalizar(it) }
                    t.o = t.o.substring(mm.range.first); t.n = t.n.substring(mm.range.first)
                }
                if (persona == null) t.buscar(Regex("""^\s*(?=[^\s\d$])"""))?.let { persona = tomarNombre(t, it.value.length) }
            } else {
                t.quitar(Regex("""\b(?:que\s+)?(?:(?:le|les)\s+)?(?:debo|tengo\s+que\s+(?:pagar(?:le|les)?|devolver(?:le|les)?)|pagar(?:le|les)?|devolver(?:le|les)?)\b"""))
                t.quitar(Regex("""\b(?:una\s+)?deuda\b"""))
                t.buscar(Regex("""\b(?:a|con|al)\s+(?=[^\s\d$])"""))?.let { persona = tomarNombre(t, it.range.last + 1) }
                if (persona == null) t.buscar(Regex("""^\s*(?:el|la|los|las)?\s*(?=[^\s\d$])"""))?.let { persona = tomarNombre(t, it.value.length) }
            }
            if (monto == null) monto = extraerMonto(t)
            var concepto = limpiarTitulo(t.o.replaceFirst(Regex("""\b(?:por|de|del)\b\s*""", RegexOption.IGNORE_CASE), " "))
            concepto = concepto.replace(Regex("""^(?:por|de|del)\s+""", RegexOption.IGNORE_CASE), "")
            val quien = persona ?: "alguien"
            return Interpretacion(
                tipo = "deuda",
                titulo = (if (esMeDeben) "Cobrar a " else "Pagar a ") + quien,
                fecha = fecha, hora = hora,
                deuda = Deuda(if (esMeDeben) "ME_DEBEN" else "DEBO", persona ?: "Sin nombre",
                    monto?.first ?: 0, monto?.second ?: "ARS", capitalizar(concepto), fecha)
            )
        }

        val titulo = limpiarTitulo(t.o).ifEmpty { "Recordatorio" }
        var f = fecha
        if (f == null) {
            f = hoy
            val hh = hora
            if (hh != null && (hh.h < ahora.hour || (hh.h == ahora.hour && hh.m <= ahora.minute))) f = hoy.plusDays(1)
        }
        return Interpretacion(if (hora != null) "evento" else "tarea", titulo, f, hora, null)
    }

    /* ---------- formatos para hablar ---------- */

    fun horaHablada(h: Int, m: Int): String {
        val periodo = when {
            h == 0 -> "de la noche"
            h < 12 -> "de la mañana"
            h == 12 -> "del mediodía"
            h < 20 -> "de la tarde"
            else -> "de la noche"
        }
        val h12 = if (h % 12 == 0) 12 else h % 12
        var art = if (h12 == 1) "a la 1" else "a las $h12"
        var mins = ""
        when {
            m == 30 -> mins = " y media"
            m == 15 -> mins = " y cuarto"
            m == 45 -> { val s = h12 % 12 + 1; art = if (s == 1) "a la 1" else "a las $s"; mins = " menos cuarto" }
            m > 0 -> mins = " y $m"
        }
        return "$art$mins $periodo"
    }

    fun formatearMiles(n: Long): String {
        var s = Math.abs(n).toString()
        var out = ""
        while (s.length > 3) { out = "." + s.takeLast(3) + out; s = s.dropLast(3) }
        return (if (n < 0) "-" else "") + s + out
    }

    fun montoHablado(valor: Long, moneda: String) = formatearMiles(valor) + if (moneda == "USD") " dólares" else " pesos"

    fun fechaHablada(fecha: LocalDate, hoy: LocalDate = LocalDate.now()): String {
        val diff = ChronoUnit.DAYS.between(hoy, fecha)
        return when {
            diff == 0L -> "hoy"
            diff == 1L -> "mañana"
            diff == 2L -> "pasado mañana"
            diff == -1L -> "ayer"
            diff in 3..6 -> "el " + DIAS_ACENTO[jsDia(fecha)]
            else -> "el " + DIAS_ACENTO[jsDia(fecha)] + " " + fecha.dayOfMonth + " de " + MESES[fecha.monthValue - 1]
        }
    }
}
