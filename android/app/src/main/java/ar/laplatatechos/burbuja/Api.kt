package ar.laplatatechos.burbuja

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.LocalDate
import java.time.ZoneId

/**
 * Habla directo con la base (Supabase tpl-presupuestos, funciones org_*) y con Claude.
 * Las dos claves (admin del sistema y API de Claude) quedan guardadas solo en este celular.
 */
object Api {
    const val SUPABASE = "https://hvgwikhzxxkhmbjnyohl.supabase.co"
    const val PUBLISHABLE = "sb_publishable_xUj53gV1c6xo6Y6t52R-Vw_hTS-P29s"
    const val TABLERO = "https://laplatatechos-prog.github.io/rafa-proyecto/obras/"
    private const val MODELO = "claude-opus-5-5"

    class Error(msg: String) : Exception(msg)

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("tpl", Context.MODE_PRIVATE)
    fun clave(ctx: Context): String = prefs(ctx).getString("clave", "") ?: ""
    fun claveClaude(ctx: Context): String = prefs(ctx).getString("claude", "") ?: ""
    fun guardarClaves(ctx: Context, clave: String, claude: String) =
        prefs(ctx).edit().putString("clave", clave).putString("claude", claude).apply()

    private fun hoy() = LocalDate.now(ZoneId.of("America/Argentina/Buenos_Aires")).toString()

    private fun http(url: String, metodo: String, headers: Map<String, String>, body: String?): Pair<Int, String> {
        val c = URL(url).openConnection() as HttpURLConnection
        c.requestMethod = metodo
        c.connectTimeout = 15000
        c.readTimeout = 180000
        headers.forEach { (k, v) -> c.setRequestProperty(k, v) }
        if (body != null) {
            c.doOutput = true
            c.outputStream.use { it.write(body.toByteArray()) }
        }
        val code = c.responseCode
        val txt = (if (code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
        return code to txt
    }

    private val sbHeaders = mapOf(
        "apikey" to PUBLISHABLE, "Authorization" to "Bearer $PUBLISHABLE", "Content-Type" to "application/json"
    )

    /** Llama una función org_* de la base. Devuelve el JSON crudo. */
    fun rpc(fn: String, args: JSONObject): String {
        val (code, txt) = http("$SUPABASE/rest/v1/rpc/$fn", "POST", sbHeaders, args.toString())
        if (code !in 200..299) throw Error(if (txt.contains("clave incorrecta")) "Clave de administrador incorrecta" else "Base: $code")
        return txt
    }

    fun obras(ctx: Context): JSONArray = JSONArray(rpc("org_listar", JSONObject().put("p_key", clave(ctx))))

    private fun catalogo(): JSONArray {
        val (code, txt) = http("$SUPABASE/rest/v1/catalogo?select=id,nom,uni,pre", "GET", sbHeaders, null)
        return if (code in 200..299) JSONArray(txt) else JSONArray()
    }

    private fun claude(ctx: Context, payload: JSONObject): String {
        payload.put("model", MODELO)
        val (code, txt) = http(
            "https://api.anthropic.com/v1/messages", "POST",
            mapOf("content-type" to "application/json", "x-api-key" to claveClaude(ctx), "anthropic-version" to "2023-06-01"),
            payload.toString()
        )
        val j = try { JSONObject(txt) } catch (e: Exception) { JSONObject() }
        if (code == 401) throw Error("Clave de Claude inválida. Abrí TPL Burbuja y cargala de nuevo.")
        if (code !in 200..299) throw Error(j.optJSONObject("error")?.optString("message") ?: "Claude respondió $code")
        if (j.optString("stop_reason") == "refusal") throw Error("Claude no procesó ese dictado.")
        val content = j.getJSONArray("content")
        val sb = StringBuilder()
        for (i in 0 until content.length()) {
            val b = content.getJSONObject(i)
            if (b.optString("type") == "text") sb.append(b.optString("text"))
        }
        return sb.toString()
    }

    /** Convierte lo dictado en una propuesta (no guarda nada). */
    fun dictado(ctx: Context, texto: String): JSONObject {
        val cfg = JSONObject(ctx.assets.open("dictado.json").bufferedReader().use { it.readText() })
        val obras = obras(ctx)
        val lista = JSONArray()
        for (i in 0 until obras.length()) {
            val o = obras.getJSONObject(i)
            lista.put(JSONObject().put("id", o.opt("id")).put("cliente", o.opt("cliente")).put("dir", o.opt("dir"))
                .put("fecha", o.opt("fecha")).put("estado", o.opt("estado")))
        }
        val payload = JSONObject()
            .put("max_tokens", 4000)
            .put("system", cfg.getString("system"))
            .put("output_config", JSONObject().put("effort", "low")
                .put("format", JSONObject().put("type", "json_schema").put("schema", cfg.getJSONObject("schema"))))
            .put("messages", JSONArray().put(JSONObject().put("role", "user").put("content",
                "Hoy: ${hoy()}\nObras existentes: $lista\nCatálogo: ${catalogo()}\n\nDictado:\n$texto")))
        return JSONObject(claude(ctx, payload))
    }

    /** Guarda la propuesta que Rafael confirmó, combinándola con la obra existente. */
    fun confirmar(ctx: Context, p: JSONObject) {
        val key = clave(ctx)
        if (p.optString("accion") == "cobro" && p.optJSONObject("cobro") != null) {
            rpc("org_cobro", JSONObject().put("p_key", key).put("p", p.getJSONObject("cobro"))); return
        }
        val n = p.optJSONObject("obra") ?: JSONObject()
        val obras = obras(ctx)
        var ex: JSONObject? = null
        if (!n.isNull("id")) for (i in 0 until obras.length()) if (obras.getJSONObject(i).optString("id") == n.optString("id")) ex = obras.getJSONObject(i)
        val base = ex ?: JSONObject().put("id", "").put("fecha", hoy()).put("dias", 1).put("estado", "aceptado")
        fun pick(k: String): Any? = if (n.has(k) && !n.isNull(k)) n.get(k) else base.opt(k)
        val det = base.optJSONObject("detalle")?.let { JSONObject(it.toString()) } ?: JSONObject()
        for (k in listOf("trabajo", "situacion", "pedido_estado", "pedido_pagado", "urgencia", "cliente_desde", "esperando_desde"))
            if (n.has(k) && !n.isNull(k)) det.put(k, n.get(k))
        val notas = listOf(base.optString("notas", ""), if (n.isNull("notas")) "" else n.optString("notas"))
            .filter { it.isNotBlank() && it != "null" }.joinToString("\n")
        val out = JSONObject()
            .put("id", ex?.optString("id") ?: "")
            .put("cliente", pick("cliente")).put("tel", pick("tel")).put("dir", pick("dir"))
            .put("fecha", pick("fecha")).put("dias", pick("dias")).put("estado", pick("estado"))
            .put("total", pick("total")).put("cuadrilla", base.opt("cuadrilla"))
            .put("notas", if (notas.isEmpty()) JSONObject.NULL else notas)
            .put("detalle", det)
        val nm = n.optJSONArray("materiales")
        if (nm != null && nm.length() > 0) {
            val mats = JSONArray()
            base.optJSONArray("materiales")?.let { for (i in 0 until it.length()) mats.put(it.get(i)) }
            for (i in 0 until nm.length()) {
                val m = nm.getJSONObject(i)
                if (m.isNull("precio_unit")) m.put("precio_unit", 0)
                mats.put(m)
            }
            out.put("materiales", mats)
        }
        rpc("org_guardar", JSONObject().put("p_key", key).put("p", out))
    }
}
