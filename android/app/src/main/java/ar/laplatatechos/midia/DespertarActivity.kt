package ar.laplatatechos.midia

import android.app.Activity
import android.content.Intent
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.ScrollView
import java.time.LocalTime

/**
 * La conversación de la mañana:
 * 1. "Despertate, Rafael. Despertate." hasta que digas "estoy despierto" (o toques el botón).
 * 2. "¿Te cuento lo que tenés hoy?" -> "sí, decime".
 * 3. Lee lo que tenés que hacer hoy, con horarios.
 * 4. "¿Querés que anote algo?" -> lo agenda.
 */
class DespertarActivity : Activity() {
    private enum class Fase { DESPERTAR, PREGUNTAR, LEER, AGREGAR, FIN }

    private lateinit var voz: Hablador
    private lateinit var oido: Oido
    private val main = Handler(Looper.getMainLooper())
    private var fase = Fase.DESPERTAR
    private var intentos = 0
    private var preguntas = 0
    private var volumenOriginal = -1
    private var tono: ToneGenerator? = null

    private lateinit var lblHora: android.widget.TextView
    private lateinit var lblGrande: android.widget.TextView
    private lateinit var lblTexto: android.widget.TextView
    private lateinit var lblEscucho: android.widget.TextView
    private lateinit var botones: LinearLayout

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true); setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        armarPantalla()
        subirVolumen()
        // apaga el timbre: ahora habla la voz
        startService(Intent(this, AlarmaService::class.java).setAction(AlarmaService.SILENCIAR))
        oido = Oido(this)
        voz = Hablador(this, comoAlarma = true) { main.postDelayed({ despertar() }, 300) }
    }

    private fun armarPantalla() {
        val p = Paleta(this)
        val raiz = columna(18).apply { gravity = Gravity.CENTER; setBackgroundColor(p.fondo) }
        respetarBarras(raiz, 24)
        lblHora = centrado(texto(LocalTime.now().let { "%02d:%02d".format(it.hour, it.minute) }, 64f, p.texto, true))
        lblGrande = centrado(texto("Despertate, ${Prefs(this).nombre}", 28f, p.acento, true))
        lblTexto = centrado(texto("", 18f, p.suave))
        lblEscucho = centrado(texto("", 16f, p.suave))
        botones = columna(10)
        raiz.addView(lblHora, lleno()); raiz.addView(lblGrande, lleno())
        val scroll = ScrollView(this).apply { addView(lblTexto) }
        raiz.addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f))
        raiz.addView(lblEscucho, lleno())
        raiz.addView(botones, lleno())
        setContentView(raiz)
        botonesDespertar()
    }

    private fun ponerBotones(vararg bs: Pair<String, () -> Unit>) {
        botones.removeAllViews()
        bs.forEachIndexed { i, (t, f) -> botones.addView(boton(t, principal = i == 0, alTocar = f), lleno()) }
    }

    private fun botonesDespertar() = ponerBotones(
        "Estoy despierto" to { despierto() },
        "Posponer 10 minutos" to { posponer() }
    )

    /* ---------- 1. despertar ---------- */
    private fun despertar() {
        if (fase != Fase.DESPERTAR) return
        intentos++
        if (intentos > 25) { terminar("Te dejo tranquilo. Cuando quieras, abrí Mi Día."); return }
        val p = Prefs(this)
        val frase = if (intentos > 3) "${p.fraseDespertar} ¡Arriba, ${p.nombre}!" else p.fraseDespertar
        lblTexto.text = "Decí \"estoy despierto\""
        voz.decir(frase) {
            if (fase != Fase.DESPERTAR) return@decir
            escuchar { dicho ->
                if (fase != Fase.DESPERTAR) return@escuchar
                if (dicho != null && Asistente.diceDespierto(dicho)) despierto()
                else if (intentos % 3 == 0) pitar { despertar() }
                else despertar()
            }
        }
    }

    private fun pitar(despues: () -> Unit) {
        runCatching {
            if (tono == null) tono = ToneGenerator(AudioManager.STREAM_ALARM, 100)
            tono?.startTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 2500)
        }
        main.postDelayed(despues, 2800)
    }

    private fun despierto() {
        if (fase != Fase.DESPERTAR) return
        fase = Fase.PREGUNTAR
        oido.cancelar(); voz.callar()
        startService(Intent(this, AlarmaService::class.java).setAction(AlarmaService.SILENCIAR))
        lblGrande.text = "Buen día, ${Prefs(this).nombre}"
        ponerBotones("Sí, decime" to { leer() }, "Ahora no" to { terminar("Dale. Cuando quieras, abrí la app y tocá Escuchar mi día.") })
        preguntar()
    }

    /* ---------- 2. preguntar ---------- */
    private fun preguntar() {
        if (fase != Fase.PREGUNTAR) return
        preguntas++
        lblTexto.text = "¿Te cuento lo que tenés hoy?"
        voz.decir("Bien. ¿Te cuento lo que tenés hoy?") {
            escuchar { dicho ->
                if (fase != Fase.PREGUNTAR) return@escuchar
                when {
                    dicho != null && Asistente.diceNo(dicho) -> terminar("Dale. Cuando quieras, abrí la app y tocá Escuchar mi día.")
                    dicho != null && Asistente.diceSi(dicho) -> leer()
                    preguntas < 3 -> preguntar()
                    else -> lblEscucho.text = "Tocá \"Sí, decime\" cuando quieras."
                }
            }
        }
    }

    /* ---------- 3. leer el día ---------- */
    private fun leer() {
        if (fase == Fase.LEER || fase == Fase.FIN) return
        fase = Fase.LEER
        oido.cancelar()
        val resumen = Asistente.resumenDelDia(this)
        lblGrande.text = "Tu día"
        lblTexto.text = resumen.replace(". ", ".\n")
        ponerBotones("Agregar algo" to { pedirAgregar() }, "Listo, cerrar" to { terminar("Perfecto. A laburar.") })
        voz.decir(resumen) { if (fase == Fase.LEER) { fase = Fase.AGREGAR; preguntarAgregar("¿Querés que anote algo más?") } }
    }

    /* ---------- 4. agregar ---------- */
    private fun preguntarAgregar(pregunta: String) {
        if (fase != Fase.AGREGAR) return
        lblEscucho.text = pregunta
        voz.decir(pregunta) {
            escuchar { dicho ->
                if (fase != Fase.AGREGAR) return@escuchar
                when {
                    dicho == null || Asistente.diceNo(dicho) -> terminar("Perfecto. A laburar.")
                    Asistente.soloSi(dicho) -> { voz.decir("Decime.") { escuchar { d -> anotar(d) } } }
                    else -> anotar(dicho)
                }
            }
        }
    }

    private fun pedirAgregar() {
        fase = Fase.AGREGAR
        voz.callar(); oido.cancelar()
        voz.decir("Decime.") { escuchar { d -> anotar(d) } }
    }

    private fun anotar(dicho: String?) {
        if (dicho.isNullOrBlank()) { terminar("Perfecto. A laburar."); return }
        val r = Asistente.agregar(this, dicho)
        lblTexto.text = r.mensaje
        preguntarAgregar(r.mensaje + " ¿Algo más?")
    }

    /* ---------- utilidades ---------- */
    private fun escuchar(alTerminar: (String?) -> Unit) {
        if (!oido.disponible) { lblEscucho.text = "Usá los botones."; return }
        lblEscucho.text = "🎙️ Te escucho…"
        oido.escuchar(alParcial = { lblEscucho.text = "🎙️ $it" }) { t ->
            lblEscucho.text = t?.let { "“$it”" } ?: ""
            alTerminar(t)
        }
    }

    private fun posponer() {
        fase = Fase.FIN
        Alarma.posponer(this, 10)
        voz.callar(); oido.cancelar()
        voz.decir("Bueno, diez minutos más.") { cerrarTodo() }
        main.postDelayed({ cerrarTodo() }, 4000)
    }

    private fun terminar(despedida: String) {
        if (fase == Fase.FIN) return
        fase = Fase.FIN
        oido.cancelar()
        lblEscucho.text = ""
        ponerBotones("Cerrar" to { cerrarTodo() })
        voz.decir(despedida) { cerrarTodo() }
        main.postDelayed({ cerrarTodo() }, 12000)
    }

    private var cerrado = false
    private fun cerrarTodo() {
        if (cerrado) return
        cerrado = true
        startService(Intent(this, AlarmaService::class.java).setAction(AlarmaService.TERMINAR))
        restaurarVolumen()
        MiDiaWidget.actualizar(this)
        finish()
    }

    private fun subirVolumen() {
        val am = getSystemService(AudioManager::class.java)
        val max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM)
        val actual = am.getStreamVolume(AudioManager.STREAM_ALARM)
        if (actual < max * 0.6) {
            volumenOriginal = actual
            runCatching { am.setStreamVolume(AudioManager.STREAM_ALARM, (max * 0.75).toInt(), 0) }
        }
    }

    private fun restaurarVolumen() {
        if (volumenOriginal >= 0) runCatching {
            getSystemService(AudioManager::class.java).setStreamVolume(AudioManager.STREAM_ALARM, volumenOriginal, 0)
        }
        volumenOriginal = -1
    }

    override fun onDestroy() {
        oido.cancelar(); voz.cerrar(); tono?.release()
        if (!cerrado) startService(Intent(this, AlarmaService::class.java).setAction(AlarmaService.TERMINAR))
        restaurarVolumen()
        super.onDestroy()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() { /* no se cierra con atrás: hay que despertarse */ }

}
