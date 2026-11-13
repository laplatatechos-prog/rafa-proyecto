package com.reelobra.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.reelobra.app.ui.camera.CameraScreen
import com.reelobra.app.ui.home.HomeScreen
import com.reelobra.app.ui.project.ProjectScreen
import com.reelobra.app.ui.theme.ReelObraTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val container = (application as ReelObraApp).container
        setContent {
            ReelObraTheme {
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    val nav = rememberNavController()
                    val idArg = listOf(navArgument("id") { type = NavType.LongType })
                    NavHost(nav, startDestination = "home") {
                        composable("home") {
                            HomeScreen(
                                container = container,
                                openCamera = { id -> nav.navigate("camera/$id") },
                                openProject = { id -> nav.navigate("project/$id") },
                            )
                        }
                        composable("camera/{id}", idArg) { e ->
                            val id = e.arguments!!.getLong("id")
                            CameraScreen(
                                container = container,
                                projectId = id,
                                onDone = {
                                    nav.navigate("project/$id") { popUpTo("home") }
                                },
                                onAbandon = { nav.popBackStack("home", inclusive = false) },
                            )
                        }
                        composable("project/{id}", idArg) { e ->
                            val id = e.arguments!!.getLong("id")
                            ProjectScreen(
                                container = container,
                                projectId = id,
                                openCamera = { nav.navigate("camera/$id") },
                                onBack = { nav.popBackStack("home", inclusive = false) },
                            )
                        }
                    }
                }
            }
        }
    }
}
