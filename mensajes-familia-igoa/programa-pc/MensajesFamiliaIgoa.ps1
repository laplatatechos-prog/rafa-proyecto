# ==========================================================
#  Mensajes Familia Igoa - programa para la compu (Windows)
#  Muestra los mensajes que manda la familia desde el celular,
#  deja responder, y si alguien aprieta "Llamar a la compu"
#  sube el volumen y dice con voz: "Abrí la computadora".
# ==========================================================

# --- Configuración (la misma que usa la app del celular) ---
$SupabaseUrl  = "https://dowtczgckcuvxwpgqcpq.supabase.co"
$ClavePublica = "sb_publishable_v6n2zkJXpBEUpR0TlULEVA_UwVMlwoa"
$Codigo       = "96obsairztk9"
$NombrePC     = "Compu"
$CadaCuanto   = 3000   # milisegundos entre cada revisión de mensajes

$Carpeta = Split-Path -Parent $MyInvocation.MyCommand.Path
$Icono   = Join-Path $Carpeta "icono.ico"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Speech
[System.Windows.Forms.Application]::EnableVisualStyles()
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# --- Que no se abra dos veces ---
$creado = $false
$mutex = New-Object System.Threading.Mutex($true, "MensajesFamiliaIgoa", [ref]$creado)
if (-not $creado) { exit }

# --- Accesos directos: escritorio y arranque automático con Windows ---
function Crear-Acceso($ruta) {
  try {
    $wsh = New-Object -ComObject WScript.Shell
    $lnk = $wsh.CreateShortcut($ruta)
    $lnk.TargetPath = "$env:WINDIR\System32\wscript.exe"
    $lnk.Arguments = '"' + (Join-Path $Carpeta "iniciar.vbs") + '"'
    $lnk.WorkingDirectory = $Carpeta
    $lnk.IconLocation = $Icono
    $lnk.Description = "Mensajes Familia Igoa"
    $lnk.Save()
  } catch {}
}
Crear-Acceso (Join-Path ([Environment]::GetFolderPath("Desktop")) "Mensajes Familia Igoa.lnk")
Crear-Acceso (Join-Path ([Environment]::GetFolderPath("Startup")) "Mensajes Familia Igoa.lnk")

# --- Hablar con el buzón (Supabase) ---
function Llamar-Funcion($nombre, $datos) {
  $json  = $datos | ConvertTo-Json -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $wc = New-Object System.Net.WebClient
  $wc.Encoding = [System.Text.Encoding]::UTF8
  $wc.Headers.Add("apikey", $ClavePublica)
  $wc.Headers.Add("Content-Type", "application/json")
  $resp = $wc.UploadData("$SupabaseUrl/rest/v1/rpc/$nombre", "POST", $bytes)
  return ([System.Text.Encoding]::UTF8.GetString($resp) | ConvertFrom-Json)
}

# --- La ventana ---
$form = New-Object System.Windows.Forms.Form
$form.Text = "Mensajes Familia Igoa"
$form.Size = New-Object System.Drawing.Size(520, 640)
$form.StartPosition = "CenterScreen"
$form.Font = New-Object System.Drawing.Font("Segoe UI", 11)
$form.BackColor = [System.Drawing.Color]::FromArgb(238, 242, 247)
if (Test-Path $Icono) { $form.Icon = New-Object System.Drawing.Icon($Icono) }

$titulo = New-Object System.Windows.Forms.Label
$titulo.Text = "  Mensajes Familia Igoa"
$titulo.Dock = "Top"; $titulo.Height = 46
$titulo.BackColor = [System.Drawing.Color]::FromArgb(37, 99, 235)
$titulo.ForeColor = [System.Drawing.Color]::White
$titulo.Font = New-Object System.Drawing.Font("Segoe UI", 14, [System.Drawing.FontStyle]::Bold)
$titulo.TextAlign = "MiddleLeft"

$historial = New-Object System.Windows.Forms.RichTextBox
$historial.Dock = "Fill"; $historial.ReadOnly = $true
$historial.BackColor = [System.Drawing.Color]::White
$historial.BorderStyle = "None"
$historial.Font = New-Object System.Drawing.Font("Segoe UI", 12)

$abajo = New-Object System.Windows.Forms.Panel
$abajo.Dock = "Bottom"; $abajo.Height = 54; $abajo.Padding = New-Object System.Windows.Forms.Padding(8)

$boton = New-Object System.Windows.Forms.Button
$boton.Text = "Enviar"; $boton.Dock = "Right"; $boton.Width = 100
$boton.BackColor = [System.Drawing.Color]::FromArgb(37, 99, 235)
$boton.ForeColor = [System.Drawing.Color]::White; $boton.FlatStyle = "Flat"

$caja = New-Object System.Windows.Forms.TextBox
$caja.Dock = "Fill"; $caja.Font = New-Object System.Drawing.Font("Segoe UI", 13)
$caja.MaxLength = 1000

$estado = New-Object System.Windows.Forms.Label
$estado.Dock = "Bottom"; $estado.Height = 22; $estado.Text = "Conectando..."
$estado.ForeColor = [System.Drawing.Color]::Gray; $estado.Padding = New-Object System.Windows.Forms.Padding(8, 0, 0, 0)

$abajo.Controls.Add($caja); $abajo.Controls.Add($boton)
$form.Controls.Add($historial); $form.Controls.Add($abajo); $form.Controls.Add($estado); $form.Controls.Add($titulo)
$form.AcceptButton = $boton

# --- Icono junto al reloj (bandeja) ---
$bandeja = New-Object System.Windows.Forms.NotifyIcon
$bandeja.Text = "Mensajes Familia Igoa"
if (Test-Path $Icono) { $bandeja.Icon = New-Object System.Drawing.Icon($Icono) } else { $bandeja.Icon = [System.Drawing.SystemIcons]::Information }
$bandeja.Visible = $true
$menu = New-Object System.Windows.Forms.ContextMenuStrip
[void]$menu.Items.Add("Abrir", $null, { Mostrar-Ventana })
[void]$menu.Items.Add("Salir", $null, { $script:saliendo = $true; $bandeja.Visible = $false; $form.Close() })
$bandeja.ContextMenuStrip = $menu
$bandeja.add_DoubleClick({ Mostrar-Ventana })

function Mostrar-Ventana {
  $form.Show(); $form.WindowState = "Normal"
  $form.TopMost = $true; $form.Activate(); $form.TopMost = $false
}

# Cerrar con la X la esconde (sigue escuchando). Para cerrar de verdad: clic derecho en el icono > Salir.
$script:saliendo = $false
$form.add_FormClosing({
  param($s, $e)
  if (-not $script:saliendo) { $e.Cancel = $true; $form.Hide()
    $bandeja.ShowBalloonTip(3000, "Mensajes Familia Igoa", "Sigo escuchando mensajes aca abajo.", "Info") }
})

# --- Mostrar un mensaje en la ventana ---
function Agregar-Mensaje($m) {
  $hora = ([DateTime]::Parse($m.creado)).ToLocalTime().ToString("HH:mm")
  if ($m.tipo -eq "llamar") { $quien = "LLAMADA de $($m.autor)"; $color = [System.Drawing.Color]::FromArgb(185, 28, 28) }
  elseif ($m.desde_pc)      { $quien = "Compu";                   $color = [System.Drawing.Color]::FromArgb(180, 83, 9) }
  else                      { $quien = $m.autor;                  $color = [System.Drawing.Color]::FromArgb(37, 99, 235) }
  $historial.SelectionStart = $historial.TextLength
  $historial.SelectionFont = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
  $historial.SelectionColor = $color
  $historial.AppendText("$quien  ($hora)`n")
  $historial.SelectionFont = New-Object System.Drawing.Font("Segoe UI", 12)
  $historial.SelectionColor = [System.Drawing.Color]::Black
  $historial.AppendText("$($m.texto)`n`n")
  $historial.ScrollToCaret()
}

# --- La voz seria: sube el volumen y habla ---
$voz = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $es = $voz.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like "es*" } | Select-Object -First 1
  if ($es) { $voz.SelectVoice($es.VoiceInfo.Name) }
} catch {}
$voz.Volume = 100
$voz.Rate = -2   # un poco más lento, suena más serio

$Timbre = Join-Path $Carpeta "timbre.wav"
$script:fraseLlamada = ""
$relojVoz = New-Object System.Windows.Forms.Timer
$relojVoz.Interval = 11500   # lo que dura el timbre
$relojVoz.add_Tick({
  $relojVoz.Stop()
  $voz.SpeakAsyncCancelAll()
  $voz.SpeakAsync("$($script:fraseLlamada) $($script:fraseLlamada) $($script:fraseLlamada)") | Out-Null
})

# Alarma: sube el volumen, suena como un telefono viejo y despues la voz seria habla.
function Llamar-Fuerte($texto) {
  try {
    $wsh = New-Object -ComObject WScript.Shell
    for ($i = 0; $i -lt 30; $i++) { $wsh.SendKeys([char]175) }   # tecla "subir volumen"
  } catch {}
  $script:fraseLlamada = "Atención. $texto."
  if (Test-Path $Timbre) {
    try { $script:reproductor = New-Object System.Media.SoundPlayer($Timbre); $script:reproductor.Play() } catch {}
    $relojVoz.Stop(); $relojVoz.Start()
  } else {
    $relojVoz.Interval = 100; $relojVoz.Start()
  }
}

# --- Revisar mensajes nuevos cada 3 segundos ---
$script:ultimoId = 0
$script:primeraVez = $true

function Revisar {
  try {
    $nuevos = @(Llamar-Funcion "fam_leer" @{ p_codigo = $Codigo; p_desde_id = $script:ultimoId })
    foreach ($m in $nuevos) {
      if ($null -eq $m.id) { continue }
      Agregar-Mensaje $m
      $script:ultimoId = [Math]::Max($script:ultimoId, [int64]$m.id)
      if (-not $script:primeraVez -and -not $m.desde_pc) {
        Mostrar-Ventana
        $bandeja.ShowBalloonTip(5000, "Mensaje de $($m.autor)", $m.texto, "Info")
        if ($m.tipo -eq "llamar") { Llamar-Fuerte $m.texto } else { [System.Media.SystemSounds]::Asterisk.Play() }
      }
    }
    $script:primeraVez = $false
    $estado.Text = "Conectado - " + (Get-Date).ToString("HH:mm:ss")
  } catch {
    $estado.Text = "Sin conexión, reintentando..."
  }
}

$boton.add_Click({
  $t = $caja.Text.Trim()
  if ($t -eq "") { return }
  try {
    Llamar-Funcion "fam_enviar" @{ p_codigo = $Codigo; p_autor = $NombrePC; p_texto = $t; p_desde_pc = $true; p_tipo = "msg" } | Out-Null
    $caja.Text = ""
    Revisar
  } catch { [System.Windows.Forms.MessageBox]::Show("No se pudo enviar. Revisá internet.") | Out-Null }
})

$reloj = New-Object System.Windows.Forms.Timer
$reloj.Interval = $CadaCuanto
$reloj.add_Tick({ Revisar })
$form.add_Shown({ Revisar; $reloj.Start(); $caja.Focus() })

[System.Windows.Forms.Application]::Run($form)
$bandeja.Dispose()
$mutex.ReleaseMutex()
