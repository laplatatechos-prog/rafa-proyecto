package ar.laplatatechos.midia

import android.app.Activity
import android.content.Context
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/** Paleta y piezas de interfaz (sin librerías externas). Pizarra de obra + amarillo casco. */
class Paleta(ctx: Context) {
    private val noche = (ctx.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
    val fondo = if (noche) 0xFF121614.toInt() else 0xFFF4F5F2.toInt()
    val tarjeta = if (noche) 0xFF1C221F.toInt() else 0xFFFFFFFF.toInt()
    val tarjeta2 = if (noche) 0xFF2A312D.toInt() else 0xFFE7E9E3.toInt()
    val texto = if (noche) 0xFFEEF1EC.toInt() else 0xFF1B1F1C.toInt()
    val suave = if (noche) 0xFF9AA49D.toInt() else 0xFF5D655F.toInt()
    val acento = if (noche) 0xFFF2B229.toInt() else 0xFFE8A20C.toInt()
    val sobreAcento = 0xFF1B1508.toInt()
    val rojo = if (noche) 0xFFF07A64.toInt() else 0xFFC2412D.toInt()
}

fun Context.dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

fun redondeado(color: Int, radio: Int) = GradientDrawable().apply { setColor(color); cornerRadius = radio.toFloat() }

fun Context.texto(t: String, tam: Float = 16f, color: Int = Paleta(this).texto, negrita: Boolean = false) = TextView(this).apply {
    text = t; textSize = tam; setTextColor(color)
    if (negrita) typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
}

fun Context.boton(t: String, principal: Boolean = false, alTocar: () -> Unit): Button {
    val p = Paleta(this)
    return Button(this).apply {
        text = t; isAllCaps = false; textSize = if (principal) 19f else 16f
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        setTextColor(if (principal) p.sobreAcento else p.texto)
        background = redondeado(if (principal) p.acento else p.tarjeta2, dp(14))
        stateListAnimator = null
        minHeight = dp(if (principal) 60 else 50)
        setPadding(dp(16), dp(10), dp(16), dp(10))
        setOnClickListener { alTocar() }
    }
}

fun Context.columna(espacio: Int = 12) = LinearLayout(this).apply {
    orientation = LinearLayout.VERTICAL
    showDividers = LinearLayout.SHOW_DIVIDER_MIDDLE
    dividerDrawable = GradientDrawable().apply { setSize(1, dp(espacio)); setColor(Color.TRANSPARENT) }
}

fun Context.tarjeta(): LinearLayout = columna(10).apply {
    background = redondeado(Paleta(this@tarjeta).tarjeta, dp(18))
    setPadding(dp(16), dp(16), dp(16), dp(16))
}

fun lleno() = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)

/** Android 15 dibuja la app detrás de las barras: se compensa con relleno. */
fun Activity.respetarBarras(raiz: View, extra: Int = 0) {
    val base = dp(extra)
    raiz.setOnApplyWindowInsetsListener { v, ins ->
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            val b = ins.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime())
            v.setPadding(b.left + base, b.top + base, b.right + base, b.bottom + base)
        } else {
            @Suppress("DEPRECATION")
            v.setPadding(ins.systemWindowInsetLeft + base, ins.systemWindowInsetTop + base, ins.systemWindowInsetRight + base, ins.systemWindowInsetBottom + base)
        }
        ins
    }
}

fun centrado(v: TextView) = v.apply { gravity = Gravity.CENTER }
