package ar.laplatatechos.midia

import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import java.util.Locale
import java.util.UUID

/** Habla con la voz elegida (motor de voz de Android: Google, Samsung, etc.). */
class Hablador(private val ctx: Context, private val comoAlarma: Boolean, private val alListo: (Boolean) -> Unit = {}) {
    private val main = Handler(Looper.getMainLooper())
    private val pendientes = HashMap<String, () -> Unit>()
    var listo = false
        private set
    private val tts: TextToSpeech = TextToSpeech(ctx.applicationContext) { st -> main.post { iniciar(st) } }

    private fun iniciar(estado: Int) {
        if (estado != TextToSpeech.SUCCESS) { alListo(false); return }
        listo = true
        aplicarAjustes()
        tts.setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(if (comoAlarma) AudioAttributes.USAGE_ALARM else AudioAttributes.USAGE_ASSISTANT)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
        )
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(id: String?) {}
            override fun onDone(id: String?) { fin(id) }
            @Deprecated("Deprecated in Java") override fun onError(id: String?) { fin(id) }
            override fun onError(id: String?, code: Int) { fin(id) }
        })
        alListo(true)
    }

    private fun fin(id: String?) {
        main.post { id?.let { pendientes.remove(it)?.invoke() } }
    }

    fun aplicarAjustes() {
        if (!listo) return
        val p = Prefs(ctx)
        val elegida = p.voz?.let { nombre -> runCatching { tts.voices }.getOrNull()?.firstOrNull { it.name == nombre } }
        if (elegida != null) tts.voice = elegida
        else {
            val r = tts.setLanguage(Locale("es", "AR"))
            if (r < 0) tts.setLanguage(Locale("es", "US")).let { if (it < 0) tts.setLanguage(Locale("es")) }
        }
        tts.setSpeechRate(p.velocidad)
        tts.setPitch(p.tono)
    }

    /** Voces en castellano disponibles, las de mejor calidad primero. */
    fun voces(): List<Voice> = runCatching { tts.voices }.getOrNull().orEmpty()
        .filter { it.locale.language == "es" && !it.features.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED) }
        .sortedWith(compareBy<Voice>({ paisOrden(it.locale.country) }, { -it.quality }, { it.name }))

    private fun paisOrden(c: String) = when (c) { "AR" -> 0; "US" -> 1; "MX" -> 2; "ES" -> 3; else -> 4 }

    fun decir(texto: String, alTerminar: (() -> Unit)? = null) {
        if (!listo) { main.postDelayed({ if (listo) decir(texto, alTerminar) else alTerminar?.invoke() }, 700); return }
        val id = UUID.randomUUID().toString()
        if (alTerminar != null) pendientes[id] = alTerminar
        val r = tts.speak(texto, TextToSpeech.QUEUE_FLUSH, Bundle(), id)
        if (r != TextToSpeech.SUCCESS) { pendientes.remove(id); alTerminar?.invoke() }
    }

    fun callar() { pendientes.clear(); if (listo) tts.stop() }
    fun cerrar() { callar(); tts.shutdown() }

    companion object {
        fun nombreLindo(v: Voice): String {
            val pais = when (v.locale.country) {
                "AR" -> "Argentina"; "US" -> "Latino (EE.UU.)"; "MX" -> "México"; "ES" -> "España"
                "CO" -> "Colombia"; "CL" -> "Chile"; "" -> "Castellano"; else -> v.locale.displayCountry
            }
            val red = if (v.isNetworkConnectionRequired) " · con internet" else ""
            val calidad = if (v.quality >= Voice.QUALITY_HIGH) " · alta calidad" else ""
            val cod = v.name.substringAfterLast("-x-", "").substringBefore("-").takeIf { it.isNotEmpty() }?.let { " ($it)" } ?: ""
            return "$pais$cod$calidad$red"
        }
    }
}

/** Escucha una frase con el reconocedor de voz del celular. */
class Oido(ctx: Context) {
    private val app = ctx.applicationContext
    private val main = Handler(Looper.getMainLooper())
    private var rec: SpeechRecognizer? = null
    val disponible = SpeechRecognizer.isRecognitionAvailable(app)
    private var activo = false

    fun escuchar(alParcial: (String) -> Unit = {}, alTerminar: (String?) -> Unit) {
        main.post {
            cancelar()
            if (!disponible) { alTerminar(null); return@post }
            val r = SpeechRecognizer.createSpeechRecognizer(app)
            rec = r
            activo = true
            var entregado = false
            fun entregar(t: String?) {
                if (entregado) return
                entregado = true; activo = false
                main.post { alTerminar(t) }
            }
            r.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(p: Bundle?) {}
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(v: Float) {}
                override fun onBufferReceived(b: ByteArray?) {}
                override fun onEndOfSpeech() {}
                override fun onError(e: Int) { entregar(null) }
                override fun onResults(b: Bundle?) {
                    entregar(b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull())
                }
                override fun onPartialResults(b: Bundle?) {
                    b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let { alParcial(it) }
                }
                override fun onEvent(t: Int, b: Bundle?) {}
            })
            val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-AR")
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1800L)
            }
            runCatching { r.startListening(i) }.onFailure { entregar(null) }
        }
    }

    fun parar() { main.post { runCatching { rec?.stopListening() } } }
    fun cancelar() {
        activo = false
        rec?.let { runCatching { it.cancel() }; runCatching { it.destroy() } }
        rec = null
    }
}
