package ar.laplatatechos.midia

import android.content.Context

/** Ajustes de la app guardados en el celular. */
class Prefs(ctx: Context) {
    private val sp = ctx.getSharedPreferences("midia", Context.MODE_PRIVATE)

    var alarmaActiva: Boolean
        get() = sp.getBoolean("alarma_activa", true)
        set(v) = sp.edit().putBoolean("alarma_activa", v).apply()
    var hora: Int
        get() = sp.getInt("hora", 6)
        set(v) = sp.edit().putInt("hora", v).apply()
    var minuto: Int
        get() = sp.getInt("minuto", 0)
        set(v) = sp.edit().putInt("minuto", v).apply()
    /** Días que suena, estilo java.time: 1 = lunes ... 7 = domingo. */
    var dias: Set<Int>
        get() = (sp.getString("dias", "1234567") ?: "1234567").mapNotNull { it.digitToIntOrNull() }.toSet()
        set(v) = sp.edit().putString("dias", v.sorted().joinToString("")).apply()
    var nombre: String
        get() = sp.getString("nombre", "Rafael") ?: "Rafael"
        set(v) = sp.edit().putString("nombre", v.trim().ifEmpty { "Rafael" }).apply()
    var fraseDespertar: String
        get() = sp.getString("frase", null) ?: "Despertate, $nombre. Despertate."
        set(v) = sp.edit().putString("frase", v.trim().ifEmpty { null }).apply()
    var voz: String?
        get() = sp.getString("voz", null)
        set(v) = sp.edit().putString("voz", v).apply()
    var velocidad: Float
        get() = sp.getFloat("velocidad", 1.0f)
        set(v) = sp.edit().putFloat("velocidad", v).apply()
    var tono: Float
        get() = sp.getFloat("tono", 1.0f)
        set(v) = sp.edit().putFloat("tono", v).apply()
    var calendarioId: Long
        get() = sp.getLong("calendario", -1L)
        set(v) = sp.edit().putLong("calendario", v).apply()
    var ultimoEvento: Long
        get() = sp.getLong("ultimo_evento", -1L)
        set(v) = sp.edit().putLong("ultimo_evento", v).apply()
}
