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

    private fun rest(path: String, metodo: String = "GET", body: String? = null, extra: Map<String, String> = emptyMap()): String {
        val (code, txt) = http("$SUPABASE/rest/v1/$path", metodo, sbHeaders + extra, body)
        if (code !in 200..299) throw Error("Base: $code ${txt.take(120)}")
        return txt
    }

    private fun enc(s: String) = java.net.URLEncoder.encode(s, "UTF-8")

    /** Datos extra de la obra (detalle, materiales, cobros) guardados en presupuestos con id "org-<obra>". */
    private fun extra(id: String): JSONObject {
        val r = JSONArray(rest("presupuestos?select=data&id=eq.${enc("org-$id")}"))
        return if (r.length() > 0) r.getJSONObject(0).optJSONObject("data") ?: JSONObject() else JSONObject()
    }

    private fun guardarExtra(obra: JSONObject, det: JSONObject, mats: JSONArray, cobros: JSONArray) {
        val data = JSONObject().put("org", true).put("cli", obra.optString("cliente")).put("num", "ORG").put("vend", "organizador")
            .put("fecha", hoy()).put("detalle", det).put("materiales", mats).put("cobros", cobros)
        val fila = JSONObject().put("id", "org-" + obra.getString("id")).put("num", "ORG").put("vend", "organizador")
            .put("cli", obra.optString("cliente")).put("total", obra.optDouble("total", 0.0).let { if (it.isNaN()) 0.0 else it })
            .put("data", data).put("updated_at", java.time.Instant.now().toString())
        rest("presupuestos?on_conflict=id", "POST", JSONArray().put(fila).toString(),
            mapOf("Prefer" to "resolution=merge-duplicates,return=minimal"))
    }

    /** Lista de obras (solo lo que necesita el dictado: id, cliente, dir, fecha, estado + extras). */
    fun obras(ctx: Context): JSONArray = JSONArray(rest("obras?select=*"))

    private fun obra(id: String): JSONObject? {
        val r = JSONArray(rest("obras?select=*&id=eq.${enc(id)}"))
        return if (r.length() > 0) r.getJSONObject(0) else null
    }

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
        if (p.optString("accion") == "cobro" && p.optJSONObject("cobro") != null) {
            val c = p.getJSONObject("cobro")
            val ob = obra(c.getString("obra_id")) ?: throw Error("No encontré esa obra")
            val ex = extra(ob.getString("id"))
            val cobros = ex.optJSONArray("cobros") ?: JSONArray()
            cobros.put(JSONObject().put("id", java.util.UUID.randomUUID().toString())
                .put("fecha", if (c.isNull("fecha")) hoy() else c.getString("fecha"))
                .put("monto", c.getDouble("monto")).put("medio", c.opt("medio")).put("nota", JSONObject.NULL))
            guardarExtra(ob, ex.optJSONObject("detalle") ?: JSONObject(), ex.optJSONArray("materiales") ?: JSONArray(), cobros)
            return
        }
        val n = p.optJSONObject("obra") ?: JSONObject()
        val prev = if (!n.isNull("id") && n.optString("id").isNotBlank()) obra(n.getString("id")) else null
        val id = prev?.getString("id") ?: ("o" + java.util.UUID.randomUUID().toString().replace("-", ""))
        fun v(k: String, d: Any? = JSONObject.NULL): Any? = if (n.has(k) && !n.isNull(k)) n.get(k) else prev?.opt(k) ?: d
        val notas = listOf(prev?.optString("notas", "") ?: "", if (n.isNull("notas")) "" else n.optString("notas"))
            .filter { it.isNotBlank() && it != "null" }.joinToString("\n")
        val ob = JSONObject().put("id", id)
            .put("fecha", v("fecha", hoy())).put("dias", v("dias", 1))
            .put("hora", prev?.opt("hora") ?: JSONObject.NULL).put("hora_fin", prev?.opt("hora_fin") ?: JSONObject.NULL)
            .put("cliente", v("cliente", "")).put("tel", v("tel")).put("dir", v("dir"))
            .put("cuadrilla", prev?.opt("cuadrilla") ?: JSONObject.NULL).put("estado", v("estado", "aceptado"))
            .put("pres_id", prev?.opt("pres_id") ?: JSONObject.NULL).put("pres_num", prev?.opt("pres_num") ?: JSONObject.NULL)
            .put("total", v("total")).put("notas", if (notas.isEmpty()) JSONObject.NULL else notas)
            .put("cargo", prev?.opt("cargo") ?: JSONObject.NULL).put("updated_by", "organizador")
        rest("rpc/guardar_obra", "POST", JSONObject().put("p_obra", ob).toString())
        val ex = extra(id)
        val det = ex.optJSONObject("detalle") ?: JSONObject()
        for (k in listOf("trabajo", "situacion", "pedido_estado", "pedido_pagado", "urgencia", "cliente_desde", "esperando_desde"))
            if (n.has(k) && !n.isNull(k)) det.put(k, n.get(k))
        if (prev == null && !det.has("esperando_desde")) det.put("esperando_desde", hoy())
        val mats = ex.optJSONArray("materiales") ?: JSONArray()
        n.optJSONArray("materiales")?.let {
            for (i in 0 until it.length()) {
                val m = it.getJSONObject(i)
                if (m.isNull("precio_unit")) m.put("precio_unit", 0)
                m.put("id", java.util.UUID.randomUUID().toString())
                mats.put(m)
            }
        }
        guardarExtra(ob, det, mats, ex.optJSONArray("cobros") ?: JSONArray())
    }
}
