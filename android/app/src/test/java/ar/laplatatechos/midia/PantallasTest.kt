package ar.laplatatechos.midia

import android.Manifest
import android.app.AlarmManager
import android.app.Application
import android.app.Notification
import android.app.NotificationManager
import android.content.Intent
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowLooper

/** Prueba que las pantallas arrancan y que la alarma queda programada, sin un celular real. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PantallasTest {
    private lateinit var app: Application

    @Before fun preparar() {
        app = org.robolectric.RuntimeEnvironment.getApplication()
        shadowOf(app).grantPermissions(
            Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR,
            Manifest.permission.RECORD_AUDIO, Manifest.permission.POST_NOTIFICATIONS
        )
    }

    private fun botones(v: View): List<Button> = when (v) {
        is Button -> listOf(v)
        is ViewGroup -> (0 until v.childCount).flatMap { botones(v.getChildAt(it)) }
        else -> emptyList()
    }
    private fun textos(v: View): String = when (v) {
        is TextView -> v.text.toString() + "\n"
        is ViewGroup -> (0 until v.childCount).joinToString("") { textos(v.getChildAt(it)) }
        else -> ""
    }

    @Test fun pantallaPrincipalArrancaYProgramaAlarma() {
        val act = Robolectric.buildActivity(MainActivity::class.java).setup().get()
        val raiz = act.window.decorView
        val t = textos(raiz)
        assertTrue(t, t.contains("Mi día"))
        assertTrue(t, t.contains("06:00"))
        assertTrue(botones(raiz).any { it.text.contains("Agregar por voz") })
        val am = app.getSystemService(AlarmManager::class.java)
        val prox = shadowOf(am).nextScheduledAlarm
        assertNotNull("la alarma de las 6 tiene que quedar programada", prox)
        // escribir algo sin calendario real no tiene que romper
        botones(raiz).first { it.text == "Anotar" }.performClick()
    }

    @Test fun apagarAlarmaLaCancela() {
        Prefs(app).alarmaActiva = false
        Alarma.programar(app)
        assertEquals(null, Alarma.proxima(app))
        Prefs(app).alarmaActiva = true
        Prefs(app).dias = setOf(1, 2, 3, 4, 5) // sin fin de semana
        val p = Alarma.proxima(app)!!
        assertTrue(p.dayOfWeek.value in 1..5)
    }

    @Test fun receptorArrancaServicioYServicioMuestraPantallaCompleta() {
        AlarmaReceiver().onReceive(app, Intent(Alarma.SONAR))
        val i = shadowOf(app).nextStartedService
        assertEquals(AlarmaService.SONAR, i.action)
        val ctl = Robolectric.buildService(AlarmaService::class.java, i).create().startCommand(0, 1)
        val nm = app.getSystemService(NotificationManager::class.java)
        val n: Notification = shadowOf(nm).allNotifications.first()
        assertNotNull("tiene que tener pantalla completa", n.fullScreenIntent)
        assertEquals(Notification.CATEGORY_ALARM, n.category)
        ctl.get().onStartCommand(Intent(AlarmaService.TERMINAR), 0, 2)
        ctl.destroy()
    }

    @Test fun despertarConversaYBotonesFuncionan() {
        val ctl = Robolectric.buildActivity(DespertarActivity::class.java).setup()
        val act = ctl.get()
        ShadowLooper.idleMainLooper()
        val raiz = act.window.decorView
        assertTrue(textos(raiz).contains("Despertate, Rafael"))
        botones(raiz).first { it.text == "Estoy despierto" }.performClick()
        ShadowLooper.idleMainLooper()
        assertTrue(textos(raiz).contains("Buen día, Rafael"))
        botones(raiz).first { it.text == "Sí, decime" }.performClick()
        ShadowLooper.idleMainLooper()
        val t = textos(raiz)
        assertTrue(t, t.contains("Hoy es"))
        assertTrue("no tiene que hablar de deudas", !t.contains("debés"))
        botones(raiz).first { it.text == "Listo, cerrar" }.performClick()
        ShadowLooper.idleMainLooper()
        ctl.pause().stop().destroy()
    }

    @Test fun ventanaAgregarYWidget() {
        Robolectric.buildActivity(AgregarActivity::class.java).setup()
        ShadowLooper.idleMainLooper()
        MiDiaWidget.actualizar(app)
        assertTrue(Asistente.resumenDelDia(app).startsWith("Hoy es"))
    }

    @Test fun respuestasDeVoz() {
        assertTrue(Asistente.diceDespierto("ya estoy despierto"))
        assertTrue(Asistente.diceDespierto("sí, ya me levanté"))
        assertTrue(Asistente.diceSi("sí, decime"))
        assertTrue(Asistente.diceSi("dale contame"))
        assertTrue(Asistente.diceNo("no, después"))
        assertTrue(Asistente.soloSi("sí"))
        assertTrue(!Asistente.soloSi("sí, a las 2 llamar a Gómez"))
    }
}
