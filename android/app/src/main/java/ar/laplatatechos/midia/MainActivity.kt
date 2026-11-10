package ar.laplatatechos.midia

import android.Manifest
import android.app.Activity
import android.app.NotificationManager
import android.app.TimePickerDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.speech.tts.TextToSpeech
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.SeekBar
import android.widget.Spinner
import android.widget.Switch
import android.widget.TextView
import java.time.LocalDate
import java.time.format.TextStyle
import java.util.Locale

class MainActivity : Activity() {
    private lateinit var p: Paleta
    private lateinit var prefs: Prefs
    private var voz: Hablador? = null
    private lateinit var oido: Oido

    private lateinit var avisos: LinearLayout
    private lateinit var lblAlarma: TextView
    private lateinit var swAlarma: Switch
    private lateinit var listaHoy: LinearLayout
    private lateinit var listaManana: LinearLayout
    private lateinit var lblResultado: TextView
    private lateinit var btnDeshacer: View
    private lateinit var entrada: EditText
    private lateinit var spVoz: Spinner
    private lateinit var spCal: Spinner
    private var ultimoId = -1L

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        p = Paleta(this); prefs = Prefs(this); oido = Oido(this)
        window.statusBarColor = p.fondo
        armar()
        voz = Hablador(this, comoAlarma = false) { runOnUiThread { cargarVoces() } }
        pedirPermisos()
        crearCanal(this)
        Alarma.programar(this)
        if (intent?.action == ACCION_ESCUCHAR) window.decorView.post { escucharDia() }
    }

    override fun onResume() {
        super.onResume()
        refrescar()
    }

    override fun onDestroy() { voz?.cerrar(); oido.cancelar(); super.onDestroy() }

    /* ---------- interfaz ---------- */
    private fun armar() {
        val scroll = ScrollView(this).apply { setBackgroundColor(p.fondo); isFillViewport = true }
        val c = columna(16).apply { setPadding(dp(16), dp(8), dp(16), dp(32)) }
        scroll.addView(c)
        respetarBarras(scroll)

        val hoy = LocalDate.now()
        c.addView(texto(hoy.dayOfWeek.getDisplayName(TextStyle.FULL, Locale("es", "AR")).uppercase() + " " + hoy.dayOfMonth +
            " DE " + Parser.MESES[hoy.monthValue - 1].uppercase(), 13f, p.suave, true))
        c.addView(texto("Mi día", 34f, p.texto, true))

        avisos = columna(8); c.addView(avisos, lleno())

        // Agregar
        val tAgregar = tarjeta()
        tAgregar.addView(boton("🎙️  Agregar por voz", principal = true) { escucharParaAgregar() }, lleno())
        val fila = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        entrada = EditText(this).apply {
            hint = "o escribí: mañana 10 hs presupuesto a Gómez"
            setTextColor(p.texto); setHintTextColor(p.suave); textSize = 16f
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
            imeOptions = EditorInfo.IME_ACTION_SEND
            background = redondeado(p.tarjeta2, dp(12)); setPadding(dp(12), dp(12), dp(12), dp(12))
            setOnEditorActionListener { _, a, _ -> if (a == EditorInfo.IME_ACTION_SEND) { enviarTexto(); true } else false }
        }
        fila.addView(entrada, LinearLayout.LayoutParams(0, -2, 1f))
        fila.addView(boton("Anotar") { enviarTexto() }, LinearLayout.LayoutParams(-2, -2).apply { leftMargin = dp(8) })
        tAgregar.addView(fila, lleno())
        lblResultado = texto("", 15f, p.suave)
        btnDeshacer = boton("Deshacer") { deshacer() }.apply { visibility = View.GONE }
        tAgregar.addView(lblResultado, lleno()); tAgregar.addView(btnDeshacer, lleno())
        c.addView(tAgregar, lleno())

        // Hoy
        c.addView(boton("▶  Escuchar mi día", principal = true) { escucharDia() }, lleno())
        c.addView(texto("HOY", 13f, p.suave, true))
        listaHoy = columna(8); c.addView(listaHoy, lleno())
        c.addView(texto("MAÑANA", 13f, p.suave, true))
        listaManana = columna(8); c.addView(listaManana, lleno())

        // Alarma
        c.addView(texto("DESPERTADOR", 13f, p.suave, true))
        val tAl = tarjeta()
        val filaAl = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        lblAlarma = texto("", 44f, p.texto, true).apply { setOnClickListener { elegirHora() } }
        swAlarma = Switch(this).apply {
            isChecked = prefs.alarmaActiva
            setOnCheckedChangeListener { _, v -> prefs.alarmaActiva = v; Alarma.programar(this@MainActivity); pintarAlarma() }
        }
        filaAl.addView(lblAlarma, LinearLayout.LayoutParams(0, -2, 1f)); filaAl.addView(swAlarma)
        tAl.addView(filaAl, lleno())
        tAl.addView(texto("Tocá la hora para cambiarla. Días que suena:", 14f, p.suave))
        val filaDias = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        listOf("L" to 1, "M" to 2, "M" to 3, "J" to 4, "V" to 5, "S" to 6, "D" to 7).forEach { (letra, n) ->
            filaDias.addView(CheckBox(this).apply {
                text = letra; setTextColor(p.texto); isChecked = n in prefs.dias
                setOnCheckedChangeListener { _, v ->
                    prefs.dias = if (v) prefs.dias + n else prefs.dias - n
                    Alarma.programar(this@MainActivity); pintarAlarma()
                }
            }, LinearLayout.LayoutParams(0, -2, 1f))
        }
        tAl.addView(filaDias, lleno())
        tAl.addView(texto("Qué te dice para despertarte:", 14f, p.suave))
        tAl.addView(campo(prefs.fraseDespertar) { prefs.fraseDespertar = it }, lleno())
        tAl.addView(texto("Tu nombre:", 14f, p.suave))
        tAl.addView(campo(prefs.nombre) { prefs.nombre = it }, lleno())
        tAl.addView(boton("Probar la alarma ahora") { probarAlarma() }, lleno())
        c.addView(tAl, lleno())

        // Voz
        c.addView(texto("VOZ", 13f, p.suave, true))
        val tVoz = tarjeta()
        tVoz.addView(texto("Elegí cómo te habla:", 14f, p.suave))
        spVoz = Spinner(this); tVoz.addView(spVoz, lleno())
        tVoz.addView(texto("Velocidad", 14f, p.suave))
        tVoz.addView(barra(((prefs.velocidad - 0.5f) * 100).toInt(), 150) { prefs.velocidad = 0.5f + it / 100f; voz?.aplicarAjustes() }, lleno())
        tVoz.addView(texto("Tono (grave ↔ agudo)", 14f, p.suave))
        tVoz.addView(barra(((prefs.tono - 0.5f) * 100).toInt(), 100) { prefs.tono = 0.5f + it / 100f; voz?.aplicarAjustes() }, lleno())
        tVoz.addView(boton("Probar voz") { voz?.decir("Buen día ${prefs.nombre}. Hoy a las 9 de la mañana tenés que ir a la obra.") }, lleno())
        tVoz.addView(boton("Descargar más voces") { masVoces() }, lleno())
        tVoz.addView(texto("Las voces vienen del motor de voz del celular. Para mejores voces y reconocimiento, instalá o actualizá \"Servicios de voz de Google\" desde Play Store.", 13f, p.suave))
        tVoz.addView(boton("Abrir Servicios de voz de Google en Play Store") { abrirPlay("com.google.android.tts") }, lleno())
        c.addView(tVoz, lleno())

        // Calendario
        c.addView(texto("CALENDARIO", 13f, p.suave, true))
        val tCal = tarjeta()
        tCal.addView(texto("Dónde anoto lo que me dictás:", 14f, p.suave))
        spCal = Spinner(this); tCal.addView(spCal, lleno())
        tCal.addView(texto("Leo todos los calendarios visibles del celular (los de Google se sincronizan solos).", 13f, p.suave))
        c.addView(tCal, lleno())

        setContentView(scroll)
        pintarAlarma()
    }

    private fun campo(valor: String, alCambiar: (String) -> Unit) = EditText(this).apply {
        setText(valor); setTextColor(p.texto); textSize = 16f
        background = redondeado(p.tarjeta2, dp(12)); setPadding(dp(12), dp(12), dp(12), dp(12))
        setOnFocusChangeListener { _, f -> if (!f) alCambiar(text.toString()) }
        imeOptions = EditorInfo.IME_ACTION_DONE; inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
        setOnEditorActionListener { v, _, _ -> alCambiar(v.text.toString()); v.clearFocus(); false }
    }

    private fun barra(valor: Int, max: Int, alCambiar: (Int) -> Unit) = SeekBar(this).apply {
        this.max = max; progress = valor.coerceIn(0, max)
        setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(s: SeekBar?, v: Int, user: Boolean) { if (user) alCambiar(v) }
            override fun onStartTrackingTouch(s: SeekBar?) {}
            override fun onStopTrackingTouch(s: SeekBar?) {}
        })
    }

    private fun pintarAlarma() {
        lblAlarma.text = "%02d:%02d".format(prefs.hora, prefs.minuto)
        lblAlarma.setTextColor(if (prefs.alarmaActiva) p.texto else p.suave)
    }

    private fun refrescar() {
        pintarAvisos()
        pintarLista(listaHoy, Agenda.eventosDelDia(this, LocalDate.now()), true)
        pintarLista(listaManana, Agenda.eventosDelDia(this, LocalDate.now().plusDays(1)), false)
        cargarCalendarios()
        MiDiaWidget.actualizar(this)
    }

    private fun pintarLista(cont: LinearLayout, eventos: List<Evento>, esHoy: Boolean) {
        cont.removeAllViews()
        if (!Agenda.tienePermiso(this)) { cont.addView(texto("Falta el permiso del calendario.", 15f, p.suave)); return }
        if (eventos.isEmpty()) { cont.addView(texto(if (esHoy) "Nada agendado. Tocá \"Agregar por voz\"." else "Nada agendado.", 15f, p.suave)); return }
        val ahora = System.currentTimeMillis()
        eventos.forEach { e ->
            val fila = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
                background = redondeado(p.tarjeta, dp(14)); setPadding(dp(14), dp(12), dp(14), dp(12))
                alpha = if (e.hecho || (esHoy && !e.todoElDia && e.fin < ahora)) 0.5f else 1f
            }
            val hora = if (e.todoElDia) "TAREA" else e.inicioLocal.let { "%02d:%02d".format(it.hour, it.minute) }
            fila.addView(texto(hora, if (e.todoElDia) 12f else 18f, if (e.todoElDia) p.acento else p.texto, true),
                LinearLayout.LayoutParams(dp(66), -2))
            val cuerpo = columna(2)
            cuerpo.addView(texto(e.titulo.removePrefix("📌").trim(), 16f, p.texto, true))
            val sub = listOf(e.lugar.substringBefore(","), e.calendario).filter { it.isNotBlank() }.joinToString(" · ")
            if (sub.isNotEmpty()) cuerpo.addView(texto(sub, 13f, p.suave))
            fila.addView(cuerpo, LinearLayout.LayoutParams(0, -2, 1f))
            if (e.todoElDia && !e.hecho && esHoy) {
                fila.addView(boton("Hecho") { Agenda.marcarHecho(this, e); refrescar() })
            }
            cont.addView(fila, lleno())
        }
    }

    private fun pintarAvisos() {
        avisos.removeAllViews()
        fun aviso(t: String, boton: String, accion: () -> Unit) {
            val a = tarjeta().apply { background = redondeado(p.tarjeta, dp(14)) }
            a.addView(texto(t, 15f, p.texto))
            a.addView(boton(boton, principal = true, alTocar = accion), lleno())
            avisos.addView(a, lleno())
        }
        if (!Agenda.tienePermiso(this) || checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
            aviso("Necesito permiso para el calendario y el micrófono.", "Dar permisos") { pedirPermisos() }
        if (!Alarma.puedeExacta(this))
            aviso("Para que la alarma suene en hora exacta, activá \"Alarmas y recordatorios\".", "Activar") {
                startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$packageName")))
            }
        if (Build.VERSION.SDK_INT >= 34 && !getSystemService(NotificationManager::class.java).canUseFullScreenIntent())
            aviso("Para que la alarma aparezca en pantalla completa con el celu bloqueado, activá el permiso.", "Activar") {
                startActivity(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:$packageName")))
            }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            aviso("Activá las notificaciones: sin eso la alarma no puede mostrarse.", "Activar") { pedirPermisos() }
    }

    private fun pedirPermisos() {
        val faltan = mutableListOf(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR, Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= 33) faltan.add(Manifest.permission.POST_NOTIFICATIONS)
        val pedir = faltan.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
        if (pedir.isNotEmpty()) requestPermissions(pedir.toTypedArray(), 1)
    }

    override fun onRequestPermissionsResult(rc: Int, perms: Array<out String>, res: IntArray) {
        super.onRequestPermissionsResult(rc, perms, res)
        refrescar()
    }

    /* ---------- acciones ---------- */
    private fun escucharParaAgregar() {
        if (!oido.disponible) { mostrar("Este celu no tiene reconocimiento de voz. Escribilo abajo."); entrada.requestFocus(); return }
        voz?.callar()
        mostrar("🎙️ Te escucho…")
        oido.escuchar(alParcial = { mostrar("🎙️ $it") }) { t ->
            if (t.isNullOrBlank()) mostrar("No te escuché. Probá de nuevo.") else agregar(t)
        }
    }

    private fun enviarTexto() {
        val t = entrada.text.toString()
        if (t.isBlank()) return
        entrada.setText("")
        agregar(t)
    }

    private fun agregar(t: String) {
        val r = Asistente.agregar(this, t)
        ultimoId = r.eventoId
        mostrar("“$t”\n${r.mensaje}")
        btnDeshacer.visibility = if (r.eventoId >= 0) View.VISIBLE else View.GONE
        voz?.decir(r.mensaje)
        refrescar()
    }

    private fun deshacer() {
        if (Asistente.deshacer(this, ultimoId)) { mostrar("Borrado."); voz?.decir("Listo, lo borré.") }
        ultimoId = -1; btnDeshacer.visibility = View.GONE
        refrescar()
    }

    private fun mostrar(t: String) { lblResultado.text = t }

    private fun escucharDia() {
        val r = Asistente.resumenDelDia(this)
        mostrar(r)
        voz?.decir(r)
    }

    private fun elegirHora() {
        TimePickerDialog(this, { _, h, m ->
            prefs.hora = h; prefs.minuto = m; prefs.alarmaActiva = true; swAlarma.isChecked = true
            Alarma.programar(this); pintarAlarma()
            mostrar("Alarma a las %02d:%02d.".format(h, m))
        }, prefs.hora, prefs.minuto, true).show()
    }

    private fun probarAlarma() {
        startActivity(Intent(this, DespertarActivity::class.java))
    }

    private fun masVoces() {
        runCatching { startActivity(Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA)) }
            .onFailure { runCatching { startActivity(Intent("com.android.settings.TTS_SETTINGS")) } }
    }

    private fun abrirPlay(paquete: String) {
        runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$paquete"))) }
            .onFailure { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$paquete"))) }
    }

    private fun cargarVoces() {
        val v = voz ?: return
        val voces = v.voces()
        val nombres = listOf("Automática (castellano)") + voces.mapIndexed { i, it -> "${i + 1}. " + Hablador.nombreLindo(it) }
        spVoz.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, nombres)
        val sel = voces.indexOfFirst { it.name == prefs.voz }
        spVoz.setSelection(if (sel >= 0) sel + 1 else 0, false)
        spVoz.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(a: AdapterView<*>?, view: View?, pos: Int, id: Long) {
                val nueva = if (pos == 0) null else voces[pos - 1].name
                if (nueva == prefs.voz) return
                prefs.voz = nueva
                v.aplicarAjustes()
                v.decir("Hola ${prefs.nombre}, así te voy a hablar.")
            }
            override fun onNothingSelected(a: AdapterView<*>?) {}
        }
    }

    private fun cargarCalendarios() {
        val cals = Agenda.calendarios(this, soloEscribibles = true)
        if (cals.isEmpty()) return
        spCal.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, cals.map { "${it.nombre} (${it.cuenta})" })
        val actual = Agenda.calendarioDestino(this)
        spCal.setSelection(cals.indexOfFirst { it.id == actual }.coerceAtLeast(0), false)
        spCal.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(a: AdapterView<*>?, view: View?, pos: Int, id: Long) { prefs.calendarioId = cals[pos].id }
            override fun onNothingSelected(a: AdapterView<*>?) {}
        }
    }

    companion object { const val ACCION_ESCUCHAR = "ar.laplatatechos.midia.ESCUCHAR" }
}
