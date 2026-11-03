package ar.laplatatechos.burbuja

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONObject
import kotlin.concurrent.thread
import kotlin.math.abs

/**
 * Burbuja flotante: un toque abre el panel y empieza a escuchar.
 * Lo dictado va a Claude, que devuelve una propuesta; recién al tocar "Cargar" se guarda.
 */
class BubbleService : Service() {
    private lateinit var wm: WindowManager
    private lateinit var burbuja: ImageView
    private lateinit var bParams: WindowManager.LayoutParams
    private var panel: View? = null
    private var recognizer: SpeechRecognizer? = null
    private var propuesta: JSONObject? = null
    private val ui = Handler(Looper.getMainLooper())
    private val dp get() = resources.displayMetrics.density

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        wm = getSystemService(WINDOW_SERVICE) as WindowManager
        arrancarPrimerPlano()
        crearBurbuja()
    }

    override fun onDestroy() {
        recognizer?.destroy()
        panel?.let { wm.removeView(it) }
        if (::burbuja.isInitialized) wm.removeView(burbuja)
        super.onDestroy()
    }

    private fun arrancarPrimerPlano() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel("burbuja", "Burbuja", NotificationManager.IMPORTANCE_MIN))
        val abrir = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val n = Notification.Builder(this, "burbuja")
            .setContentTitle("TPL Burbuja activa")
            .setContentText("Tocá la burbuja para dictar")
            .setSmallIcon(R.drawable.ic_burbuja)
            .setContentIntent(abrir)
            .build()
        if (Build.VERSION.SDK_INT >= 29) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        else startForeground(1, n)
    }

    private fun tipoOverlay() = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY

    @SuppressLint("ClickableViewAccessibility")
    private fun crearBurbuja() {
        val size = (60 * dp).toInt()
        burbuja = ImageView(this).apply {
            setImageResource(R.drawable.ic_burbuja)
            elevation = 8 * dp
        }
        bParams = WindowManager.LayoutParams(
            size, size, tipoOverlay(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply { gravity = Gravity.TOP or Gravity.START; x = 0; y = (200 * dp).toInt() }

        var x0 = 0; var y0 = 0; var tx = 0f; var ty = 0f; var movio = false
        burbuja.setOnTouchListener { _, e ->
            when (e.action) {
                MotionEvent.ACTION_DOWN -> { x0 = bParams.x; y0 = bParams.y; tx = e.rawX; ty = e.rawY; movio = false; true }
                MotionEvent.ACTION_MOVE -> {
                    val dx = e.rawX - tx; val dy = e.rawY - ty
                    if (abs(dx) > 10 * dp || abs(dy) > 10 * dp) movio = true
                    bParams.x = x0 + dx.toInt(); bParams.y = y0 + dy.toInt()
                    wm.updateViewLayout(burbuja, bParams); true
                }
                MotionEvent.ACTION_UP -> {
                    if (!movio) { if (panel == null) abrirPanel() else cerrarPanel() }
                    else { // se pega al borde más cercano
                        val ancho = resources.displayMetrics.widthPixels
                        bParams.x = if (bParams.x + bParams.width / 2 < ancho / 2) 0 else ancho - bParams.width
                        wm.updateViewLayout(burbuja, bParams)
                    }
                    true
                }
                else -> false
            }
        }
        wm.addView(burbuja, bParams)
    }

    // ---------- panel ----------
    private lateinit var estado: TextView
    private lateinit var texto: EditText
    private lateinit var resumen: TextView
    private lateinit var bCargar: Button
    private lateinit var bMic: Button

    private fun boton(t: String, primario: Boolean, f: () -> Unit) = Button(this).apply {
        text = t; isAllCaps = false; textSize = 15f
        setTextColor(if (primario) Color.WHITE else Color.parseColor("#7A1F2B"))
        background = GradientDrawable().apply {
            cornerRadius = 10 * dp
            setColor(if (primario) Color.parseColor("#7A1F2B") else Color.WHITE)
            setStroke((1 * dp).toInt(), Color.parseColor("#7A1F2B"))
        }
        layoutParams = LinearLayout.LayoutParams(0, -2, 1f).apply { marginStart = (4 * dp).toInt(); marginEnd = (4 * dp).toInt() }
        setOnClickListener { f() }
    }

    private fun abrirPanel() {
        propuesta = null
        val pad = (14 * dp).toInt()
        val caja = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
            background = GradientDrawable().apply { cornerRadius = 18 * dp; setColor(Color.parseColor("#F6F4F2")) }
            elevation = 12 * dp
        }
        caja.addView(TextView(this).apply {
            text = "Dictado TPL"; textSize = 18f; setTextColor(Color.parseColor("#7A1F2B"))
        })
        estado = TextView(this).apply { textSize = 14f; setTextColor(Color.DKGRAY); setPadding(0, pad / 2, 0, pad / 2) }
        caja.addView(estado)
        texto = EditText(this).apply {
            hint = "Lo que dictás aparece acá (podés corregir)"; minLines = 2; maxLines = 5; textSize = 15f
            setBackgroundColor(Color.WHITE); setPadding(pad / 2, pad / 2, pad / 2, pad / 2)
        }
        caja.addView(texto)
        resumen = TextView(this).apply { textSize = 15f; setTextColor(Color.BLACK); setPadding(0, pad / 2, 0, pad / 2) }
        caja.addView(ScrollView(this).apply {
            addView(resumen)
            layoutParams = LinearLayout.LayoutParams(-1, -2).apply { height = -2 }
        })
        val fila1 = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        bMic = boton("🎤 Dictar", false) { escuchar() }
        fila1.addView(bMic)
        fila1.addView(boton("Interpretar", false) { interpretar() })
        caja.addView(fila1)
        val fila2 = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(0, pad / 2, 0, 0) }
        fila2.addView(boton("Cerrar", false) { cerrarPanel() })
        fila2.addView(boton("Tablero", false) {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(Api.TABLERO)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); cerrarPanel()
        })
        bCargar = boton("Cargar", true) { cargar() }.apply { isEnabled = false; alpha = .5f }
        fila2.addView(bCargar)
        caja.addView(fila2)

        val p = WindowManager.LayoutParams(
            -1, -2, tipoOverlay(),
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.BOTTOM
            softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
            horizontalMargin = 0.02f; verticalMargin = 0.02f
        }
        panel = caja
        wm.addView(caja, p)
        escuchar()
    }

    private fun cerrarPanel() {
        recognizer?.destroy(); recognizer = null
        panel?.let { wm.removeView(it) }; panel = null
    }

    // ---------- voz ----------
    private fun escuchar() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            estado.text = "Este celular no tiene reconocimiento de voz. Usá el micrófono del teclado."; return
        }
        recognizer?.destroy()
        val base = texto.text.toString()
        recognizer = SpeechRecognizer.createSpeechRecognizer(this).apply {
            setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(p: Bundle?) { estado.text = "Escuchando… hablá."; bMic.text = "🔴 Escuchando" }
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(v: Float) {}
                override fun onBufferReceived(b: ByteArray?) {}
                override fun onEndOfSpeech() { bMic.text = "🎤 Dictar" }
                override fun onError(error: Int) {
                    bMic.text = "🎤 Dictar"
                    estado.text = when (error) {
                        SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "No se escuchó. Tocá Dictar de nuevo."
                        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Falta permiso de micrófono (abrí TPL Burbuja)."
                        else -> "Error de voz ($error). Probá de nuevo o escribí."
                    }
                }
                override fun onPartialResults(r: Bundle?) {
                    val t = r?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: return
                    texto.setText(listOf(base, t).filter { it.isNotBlank() }.joinToString(" "))
                }
                override fun onResults(r: Bundle?) {
                    val t = r?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: ""
                    texto.setText(listOf(base, t).filter { it.isNotBlank() }.joinToString(" "))
                    bMic.text = "🎤 Dictar"
                    if (texto.text.isNotBlank()) interpretar()
                }
                override fun onEvent(t: Int, b: Bundle?) {}
            })
        }
        val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-AR")
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2500L)
        }
        recognizer?.startListening(i)
    }

    // ---------- Claude ----------
    private fun interpretar() {
        val t = texto.text.toString().trim()
        if (t.isEmpty()) return
        recognizer?.stopListening()
        estado.text = "Claude está ordenando los datos…"
        bCargar.isEnabled = false; bCargar.alpha = .5f
        thread {
            var p: JSONObject? = null
            val err = try { p = Api.dictado(this, t); "" } catch (e: Api.Error) { e.message ?: "Error" } catch (e: Exception) { "Sin conexión" }
            ui.post {
                if (panel == null) return@post
                if (err.isNotEmpty() || p == null) { estado.text = "Error: $err"; return@post }
                propuesta = p
                resumen.text = describir(propuesta!!)
                estado.text = "Revisá y tocá Cargar."
                bCargar.isEnabled = true; bCargar.alpha = 1f
            }
        }
    }

    private fun describir(p: JSONObject): String {
        val sb = StringBuilder(p.optString("resumen"))
        val o = p.optJSONObject("obra")
        if (o != null) {
            fun l(k: String, n: String) { if (!o.isNull(k) && o.optString(k).isNotBlank()) sb.append("\n• $n: ${o.optString(k)}") }
            l("cliente", "Cliente"); l("tel", "Tel"); l("dir", "Dirección"); l("trabajo", "Trabajo"); l("situacion", "Situación")
            l("fecha", "Inicio"); l("dias", "Días"); l("total", "Total $"); l("pedido_estado", "Pedido"); l("urgencia", "Urgencia")
            val m = o.optJSONArray("materiales")
            if (m != null) for (i in 0 until m.length()) {
                val x = m.getJSONObject(i)
                sb.append("\n• ${x.optString("cantidad")} ${x.optString("unidad", "")} ${x.optString("nombre")}")
            }
        }
        val c = p.optJSONObject("cobro")
        if (c != null) sb.append("\n• Cobro: $${c.optString("monto")} ${c.optString("medio", "")}")
        return sb.toString()
    }

    private fun cargar() {
        val p = propuesta ?: return
        bCargar.isEnabled = false; bCargar.alpha = .5f
        estado.text = "Guardando…"
        thread {
            val err = try { Api.confirmar(this, p); "" } catch (e: Api.Error) { e.message ?: "Error" } catch (e: Exception) { "Sin conexión" }
            ui.post {
                if (err.isNotEmpty()) { estado.text = "Error: $err"; bCargar.isEnabled = true; bCargar.alpha = 1f; return@post }
                estado.text = "Cargado ✔"
                ui.postDelayed({ cerrarPanel() }, 900)
            }
        }
    }
}
