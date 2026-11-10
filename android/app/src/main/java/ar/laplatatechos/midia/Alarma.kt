package ar.laplatatechos.midia

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import java.time.LocalDateTime
import java.time.ZoneId

/** Programa la alarma diaria con el reloj del sistema (sale en la barra como cualquier despertador). */
object Alarma {
    const val SONAR = "ar.laplatatechos.midia.SONAR"
    private const val RC_DIARIA = 1
    private const val RC_POSPUESTA = 2

    private fun am(ctx: Context) = ctx.getSystemService(AlarmManager::class.java)

    private fun disparo(ctx: Context, rc: Int) = PendingIntent.getBroadcast(
        ctx, rc, Intent(ctx, AlarmaReceiver::class.java).setAction(SONAR),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

    private fun mostrar(ctx: Context) = PendingIntent.getActivity(
        ctx, 10, Intent(ctx, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

    fun puedeExacta(ctx: Context) = Build.VERSION.SDK_INT < 31 || am(ctx).canScheduleExactAlarms()

    /** Próximo momento en que tiene que sonar, o null si está apagada. */
    fun proxima(ctx: Context, desde: LocalDateTime = LocalDateTime.now()): LocalDateTime? {
        val p = Prefs(ctx)
        if (!p.alarmaActiva || p.dias.isEmpty()) return null
        var t = desde.toLocalDate().atTime(p.hora, p.minuto)
        if (!t.isAfter(desde)) t = t.plusDays(1)
        repeat(8) {
            if (t.dayOfWeek.value in p.dias) return t
            t = t.plusDays(1)
        }
        return null
    }

    fun programar(ctx: Context) {
        val pi = disparo(ctx, RC_DIARIA)
        val t = proxima(ctx)
        if (t == null) { am(ctx).cancel(pi); return }
        programarEn(ctx, t.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli(), pi)
    }

    fun posponer(ctx: Context, minutos: Int) {
        programarEn(ctx, System.currentTimeMillis() + minutos * 60_000L, disparo(ctx, RC_POSPUESTA))
    }

    private fun programarEn(ctx: Context, ms: Long, pi: PendingIntent) {
        if (puedeExacta(ctx)) am(ctx).setAlarmClock(AlarmManager.AlarmClockInfo(ms, mostrar(ctx)), pi)
        else am(ctx).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, ms, pi)
    }
}

class AlarmaReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        when (intent.action) {
            Alarma.SONAR -> {
                val i = Intent(ctx, AlarmaService::class.java).setAction(AlarmaService.SONAR)
                if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
                Alarma.programar(ctx) // deja lista la de mañana
            }
            else -> { Alarma.programar(ctx); MiDiaWidget.actualizar(ctx) } // reinicio, cambio de hora, actualización
        }
    }
}

/** Hace sonar el timbre y muestra la pantalla de despertar encima del bloqueo. */
class AlarmaService : Service() {
    companion object {
        const val SONAR = "sonar"
        const val SILENCIAR = "silenciar"
        const val TERMINAR = "terminar"
        const val CANAL = "alarma"
        const val NOTIF = 6
        @Volatile var activa = false
    }

    private var player: MediaPlayer? = null
    private var vibrador: Vibrator? = null
    private val main = Handler(Looper.getMainLooper())
    private val corte = Runnable { detenerTodo() }

    override fun onBind(i: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            SILENCIAR -> silenciar()
            TERMINAR -> detenerTodo()
            else -> sonar()
        }
        return START_NOT_STICKY
    }

    private fun sonar() {
        activa = true
        crearCanal(this)
        val pantalla = PendingIntent.getActivity(
            this, 20, Intent(this, DespertarActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val n = Notification.Builder(this, CANAL)
            .setSmallIcon(R.drawable.ic_sol)
            .setContentTitle("Despertate, ${Prefs(this).nombre}")
            .setContentText("Tocá para apagar y escuchar tu día")
            .setCategory(Notification.CATEGORY_ALARM)
            .setFullScreenIntent(pantalla, true)
            .setContentIntent(pantalla)
            .setOngoing(true)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .addAction(Notification.Action.Builder(null, "Estoy despierto", pantalla).build())
            .build()
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        else startForeground(NOTIF, n)
        // Si el celu está desbloqueado, abrir la pantalla igual (permitido para alarmas en varias marcas).
        runCatching { pantalla.send() }
        timbre()
        main.removeCallbacks(corte)
        main.postDelayed(corte, 15 * 60_000L) // nunca más de 15 minutos
    }

    private fun timbre() {
        if (player != null) return
        val uri = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        player = runCatching {
            MediaPlayer().apply {
                setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                setDataSource(this@AlarmaService, uri)
                isLooping = true
                prepare()
                start()
            }
        }.getOrNull()
        vibrador = if (Build.VERSION.SDK_INT >= 31) getSystemService(VibratorManager::class.java).defaultVibrator
        else @Suppress("DEPRECATION") getSystemService(Vibrator::class.java)
        vibrador?.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 800, 600), 0))
    }

    fun silenciar() {
        runCatching { player?.stop() }; runCatching { player?.release() }
        player = null
        vibrador?.cancel()
    }

    private fun detenerTodo() {
        activa = false
        silenciar()
        main.removeCallbacks(corte)
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() { silenciar(); activa = false; super.onDestroy() }
}

fun crearCanal(ctx: Context) {
    val nm = ctx.getSystemService(NotificationManager::class.java)
    if (nm.getNotificationChannel(AlarmaService.CANAL) == null) {
        val c = NotificationChannel(AlarmaService.CANAL, "Despertador", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "La alarma de la mañana"
            setSound(null, null) // el sonido lo pone la app, con volumen de alarma
            enableVibration(false)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            setBypassDnd(true)
        }
        nm.createNotificationChannel(c)
    }
}
