package ar.laplatatechos.burbuja

import android.content.Context
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Habla con la función "asistente" de Supabase (la misma que usa el tablero web). */
object Api {
    const val SUPABASE = "https://hvgwikhzxxkhmbjnyohl.supabase.co"
    const val PUBLISHABLE = "sb_publishable_xUj53gV1c6xo6Y6t52R-Vw_hTS-P29s"
    const val TABLERO = "https://laplatatechos-prog.github.io/rafa-proyecto/"

    fun clave(ctx: Context): String =
        ctx.getSharedPreferences("tpl", Context.MODE_PRIVATE).getString("clave", "") ?: ""

    fun guardarClave(ctx: Context, clave: String) =
        ctx.getSharedPreferences("tpl", Context.MODE_PRIVATE).edit().putString("clave", clave).apply()

    /** Llamada bloqueante: usar fuera del hilo principal. */
    fun asistente(ctx: Context, body: JSONObject): JSONObject {
        body.put("key", clave(ctx))
        val c = URL("$SUPABASE/functions/v1/asistente").openConnection() as HttpURLConnection
        c.requestMethod = "POST"
        c.connectTimeout = 15000
        c.readTimeout = 120000
        c.doOutput = true
        c.setRequestProperty("Content-Type", "application/json")
        c.setRequestProperty("apikey", PUBLISHABLE)
        c.setRequestProperty("Authorization", "Bearer $PUBLISHABLE")
        c.outputStream.use { it.write(body.toString().toByteArray()) }
        val code = c.responseCode
        val txt = (if (code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
        val j = try { JSONObject(txt) } catch (e: Exception) { JSONObject().put("error", "Respuesta inválida ($code)") }
        if (code !in 200..299 && !j.has("error")) j.put("error", "Error $code")
        return j
    }
}
