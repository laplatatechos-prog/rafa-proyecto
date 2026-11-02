package ar.laplatatechos.burbuja

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.InputType
import android.view.Gravity
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import kotlin.concurrent.thread

/** Pantalla de configuración: clave, permisos y encender la burbuja. */
class MainActivity : Activity() {
    private lateinit var estado: TextView
    private lateinit var clave: EditText
    private lateinit var claveClaude: EditText

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (20 * resources.displayMetrics.density).toInt()
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad * 2, pad, pad)
            setBackgroundColor(Color.parseColor("#F6F4F2"))
        }
        root.addView(TextView(this).apply {
            text = "TPL Burbuja"; textSize = 26f; setTextColor(Color.parseColor("#7A1F2B"))
        })
        root.addView(TextView(this).apply {
            text = "Apretá la burbuja desde cualquier app, dictá y Claude lo carga en tus obras después de que confirmes."
            textSize = 15f; setTextColor(Color.DKGRAY); setPadding(0, pad / 2, 0, pad)
        })
        clave = EditText(this).apply {
            hint = "Clave de administrador (la del sistema de presupuestos)"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            setText(Api.clave(this@MainActivity))
        }
        root.addView(clave)
        claveClaude = EditText(this).apply {
            hint = "Clave de la API de Claude (sk-ant-...)"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            setText(Api.claveClaude(this@MainActivity))
        }
        root.addView(claveClaude)
        estado = TextView(this).apply { textSize = 15f; setPadding(0, pad / 2, 0, pad / 2) }
        root.addView(estado)
        root.addView(boton("Encender burbuja") { encender() })
        root.addView(boton("Apagar burbuja") { stopService(Intent(this, BubbleService::class.java)); refrescar() })
        root.addView(boton("Abrir tablero") { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(Api.TABLERO))) })
        setContentView(root)
    }

    override fun onResume() { super.onResume(); refrescar() }

    private fun boton(t: String, f: () -> Unit) = Button(this).apply {
        text = t; setOnClickListener { f() }
        setBackgroundColor(Color.parseColor("#7A1F2B")); setTextColor(Color.WHITE)
        layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = 16 }
        gravity = Gravity.CENTER
    }

    private fun refrescar() {
        val faltan = mutableListOf<String>()
        if (!Settings.canDrawOverlays(this)) faltan += "mostrar sobre otras apps"
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) faltan += "micrófono"
        if (Api.clave(this).isEmpty()) faltan += "clave"
        if (Api.claveClaude(this).isEmpty()) faltan += "clave de Claude"
        estado.text = if (faltan.isEmpty()) "Todo listo." else "Falta: " + faltan.joinToString(", ")
    }

    private fun encender() {
        val k = clave.text.toString().trim()
        val kc = claveClaude.text.toString().trim()
        if (k.isEmpty() || kc.isEmpty()) { toast("Poné las dos claves"); return }
        if (!Settings.canDrawOverlays(this)) {
            toast("Activá \"Mostrar sobre otras apps\" para TPL Burbuja y volvé")
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
            return
        }
        val pedir = mutableListOf<String>()
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) pedir += Manifest.permission.RECORD_AUDIO
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) pedir += Manifest.permission.POST_NOTIFICATIONS
        if (pedir.isNotEmpty()) { requestPermissions(pedir.toTypedArray(), 1); return }
        // Verifica la clave contra el servidor antes de guardarla.
        estado.text = "Verificando clave…"
        Api.guardarClaves(this, k, kc)
        thread {
            val err = try { Api.obras(this); "" } catch (e: Api.Error) { e.message ?: "Error" } catch (e: Exception) { "Sin conexión" }
            runOnUiThread {
                if (err.contains("Clave", true)) { estado.text = err; return@runOnUiThread }
                startForegroundService(Intent(this, BubbleService::class.java))
                toast("Burbuja encendida"); refrescar()
                if (err.isNotEmpty()) estado.text = "Burbuja encendida. Aviso del servidor: $err"
                moveTaskToBack(true)
            }
        }
    }

    override fun onRequestPermissionsResult(rc: Int, p: Array<out String>, g: IntArray) {
        super.onRequestPermissionsResult(rc, p, g)
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) encender()
        else toast("Sin micrófono no se puede dictar")
    }

    private fun toast(t: String) = Toast.makeText(this, t, Toast.LENGTH_LONG).show()
}
