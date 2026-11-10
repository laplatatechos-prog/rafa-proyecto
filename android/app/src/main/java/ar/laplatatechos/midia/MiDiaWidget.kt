package ar.laplatatechos.midia

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import java.time.LocalDate

/** Widget de la pantalla de inicio: próximo pendiente + botón de micrófono para agregar. */
class MiDiaWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) { pintar(ctx, mgr, ids) }

    companion object {
        fun actualizar(ctx: Context) {
            val mgr = AppWidgetManager.getInstance(ctx) ?: return
            val ids = mgr.getAppWidgetIds(ComponentName(ctx, MiDiaWidget::class.java))
            if (ids.isNotEmpty()) pintar(ctx, mgr, ids)
        }

        private fun pintar(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
            val ahora = System.currentTimeMillis()
            val hoy = Agenda.eventosDelDia(ctx, LocalDate.now()).filter { !it.hecho }
            val prox = hoy.firstOrNull { !it.todoElDia && it.fin > ahora }
            val tareas = hoy.count { it.todoElDia }
            val linea1 = when {
                !Agenda.tienePermiso(ctx) -> "Abrí Mi Día para dar permisos"
                prox != null -> prox.inicioLocal.let { "%02d:%02d ".format(it.hour, it.minute) } + Asistente.paraVoz(prox.titulo)
                hoy.isEmpty() -> "Nada pendiente hoy"
                else -> "Sin más horarios hoy"
            }
            val linea2 = if (tareas > 0) "$tareas tarea${if (tareas > 1) "s" else ""} sin horario" else "Tocá 🎙️ para agregar"
            val abrir = PendingIntent.getActivity(ctx, 30, Intent(ctx, MainActivity::class.java),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            val agregar = PendingIntent.getActivity(ctx, 31,
                Intent(ctx, AgregarActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            for (id in ids) {
                val v = RemoteViews(ctx.packageName, R.layout.widget)
                v.setTextViewText(R.id.w_linea1, linea1)
                v.setTextViewText(R.id.w_linea2, linea2)
                v.setOnClickPendingIntent(R.id.w_texto, abrir)
                v.setOnClickPendingIntent(R.id.w_mic, agregar)
                mgr.updateAppWidget(id, v)
            }
        }
    }
}
