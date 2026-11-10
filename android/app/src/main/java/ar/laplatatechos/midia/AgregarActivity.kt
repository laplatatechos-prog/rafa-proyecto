package ar.laplatatechos.midia

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.widget.LinearLayout

/** Ventanita que abre el widget: escucha, anota en el calendario, confirma en voz y se cierra. */
class AgregarActivity : Activity() {
    private lateinit var oido: Oido
    private lateinit var voz: Hablador
    private val main = Handler(Looper.getMainLooper())
    private lateinit var lbl: android.widget.TextView
    private lateinit var botones: LinearLayout
    private var ultimoId = -1L

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        if (!Agenda.tienePermiso(this) || checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            startActivity(Intent(this, MainActivity::class.java)); finish(); return
        }
        val p = Paleta(this)
        val c = columna(14).apply {
            setPadding(dp(22), dp(22), dp(22), dp(22)); gravity = Gravity.CENTER_HORIZONTAL
            background = redondeado(p.tarjeta, dp(22))
        }
        c.addView(centrado(texto("¿Qué anoto?", 22f, p.texto, true)), lleno())
        lbl = centrado(texto("🎙️ Te escucho…", 18f, p.suave))
        c.addView(lbl, lleno())
        botones = columna(8); c.addView(botones, lleno())
        setContentView(c)
        window.setLayout((resources.displayMetrics.widthPixels * 0.9).toInt(), -2)
        oido = Oido(this)
        voz = Hablador(this, comoAlarma = false)
        ponerBotones()
        escuchar()
    }

    private fun ponerBotones(conDeshacer: Boolean = false) {
        botones.removeAllViews()
        if (conDeshacer) botones.addView(boton("Deshacer") { deshacer() }, lleno())
        botones.addView(boton("Hablar de nuevo") { escuchar() }, lleno())
        botones.addView(boton("Abrir Mi Día") { startActivity(Intent(this, MainActivity::class.java)); finish() }, lleno())
    }

    private fun escuchar() {
        main.removeCallbacksAndMessages(null)
        lbl.text = "🎙️ Te escucho…\nEj: \"a las 2 presupuesto para Gómez\""
        oido.escuchar(alParcial = { lbl.text = "🎙️ $it" }) { t ->
            if (t.isNullOrBlank()) { lbl.text = "No te escuché. Tocá \"Hablar de nuevo\"."; return@escuchar }
            val r = Asistente.agregar(this, t)
            ultimoId = r.eventoId
            lbl.text = "“$t”\n\n${r.mensaje}"
            ponerBotones(conDeshacer = r.eventoId >= 0)
            voz.decir(r.mensaje) { main.postDelayed({ finish() }, 4000) }
        }
    }

    private fun deshacer() {
        main.removeCallbacksAndMessages(null)
        Asistente.deshacer(this, ultimoId); ultimoId = -1
        lbl.text = "Borrado."
        ponerBotones()
        voz.decir("Listo, lo borré.")
    }

    override fun onDestroy() {
        if (::oido.isInitialized) oido.cancelar()
        if (::voz.isInitialized) voz.cerrar()
        main.removeCallbacksAndMessages(null)
        super.onDestroy()
    }

}
