import com.android.build.api.variant.ApplicationAndroidComponentsExtension

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
}

android {
    namespace = "com.reelobra.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.reelobra.app"
        minSdk = 29          // Android 10: almacenamiento con alcance + MediaStore sin permisos de escritura
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0-etapa1"
        // Solo ARM64: los motores de voz nativos (Etapa 3+) se distribuyen para arm64-v8a.
        ndk { abiFilters += listOf("arm64-v8a") }
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Firma de release: se configura en la etapa de release (ver BUILD.md).
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures { compose = true }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
    lint {
        abortOnError = true
        checkReleaseBuilds = true
        disable += listOf("GradleDependency", "NewerVersionAvailable", "AndroidGradlePluginVersion", "OldTargetApi")
    }
}

kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }

ksp { arg("room.schemaLocation", "$projectDir/schemas") }

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.camera.core)
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.video)
    implementation(libs.androidx.camera.view)
    implementation(libs.androidx.media3.exoplayer)
    implementation(libs.androidx.media3.ui)
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.kotlinx.coroutines.android)
    debugImplementation(libs.androidx.compose.ui.tooling)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
}

// ---------------------------------------------------------------------------
// Auditoría offline: falla la compilación si el manifiesto final pide red.
// ---------------------------------------------------------------------------
val forbiddenPermissions = listOf(
    "android.permission.INTERNET",
    "android.permission.ACCESS_NETWORK_STATE",
    "android.permission.ACCESS_WIFI_STATE",
    "com.google.android.gms.permission.AD_ID",
)

extensions.getByType<ApplicationAndroidComponentsExtension>().onVariants { variant ->
    val cap = variant.name.replaceFirstChar { it.uppercase() }
    val manifestFile = variant.artifacts.get(com.android.build.api.artifact.SingleArtifact.MERGED_MANIFEST)
    val task = tasks.register("verifyOffline$cap") {
        group = "verification"
        description = "Verifica que el manifiesto final de ${variant.name} no tenga permisos de red."
        inputs.file(manifestFile)
        doLast {
            val text = manifestFile.get().asFile.readText()
            val found = forbiddenPermissions.filter { text.contains("\"$it\"") }
            if (found.isNotEmpty()) throw GradleException("OFFLINE AUDIT FAILED (${variant.name}): $found")
            println("OFFLINE AUDIT OK (${variant.name}): sin permisos de red")
        }
    }
    afterEvaluate { tasks.findByName("assemble$cap")?.finalizedBy(task) }
}
