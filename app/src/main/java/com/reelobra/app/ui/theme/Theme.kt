package com.reelobra.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// Paleta de alto contraste pensada para leer al sol: fondo casi negro, texto blanco, acento ámbar.
val Amber = Color(0xFFFFB300)
val RecordRed = Color(0xFFE53935)
val Surface = Color(0xFF1B1E22)
val Background = Color(0xFF101214)

private val Colors = darkColorScheme(
    primary = Amber,
    onPrimary = Color.Black,
    secondary = Color.White,
    onSecondary = Color.Black,
    error = RecordRed,
    background = Background,
    onBackground = Color.White,
    surface = Surface,
    onSurface = Color.White,
    surfaceVariant = Color(0xFF2A2E33),
    onSurfaceVariant = Color(0xFFE0E0E0),
)

private val Type = Typography(
    headlineLarge = TextStyle(fontSize = 32.sp, fontWeight = FontWeight.Black),
    headlineMedium = TextStyle(fontSize = 26.sp, fontWeight = FontWeight.Bold),
    titleLarge = TextStyle(fontSize = 22.sp, fontWeight = FontWeight.Bold),
    titleMedium = TextStyle(fontSize = 19.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 18.sp),
    bodyMedium = TextStyle(fontSize = 16.sp),
    labelLarge = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.Bold),
)

/** Altura mínima de botones principales: operables con guantes. */
val BigButtonHeight = 72.dp

@Composable
fun ReelObraTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Colors, typography = Type, content = content)
}
