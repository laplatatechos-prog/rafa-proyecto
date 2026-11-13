# ReelObra

App Android nativa y **100 % offline** para convertir momentos reales de obra (techos, zinguería, canaletas,
impermeabilizaciones, estructuras) en reels verticales profesionales: video vertical, voz masculina sintética,
subtítulos y marca de la empresa. Sin cuentas, sin servidores, sin pago por video. El código es del dueño del repo.

**Estado:** Etapa 1 (grabar, importar, reproducir y guardar proyectos). Ver [ROADMAP.md](ROADMAP.md).

## Instalar en el teléfono
1. Descargar `ReelObra-0.1.0-etapa1.apk` (release de GitHub o artefacto del CI "Android CI").
2. En el teléfono: abrir el archivo → permitir "instalar apps desconocidas" para el explorador de archivos → Instalar.
3. Requisitos: Android 10 o superior, procesador ARM64 (casi todos los teléfonos desde 2017).

## Uso (Etapa 1)
- **NUEVO REEL** → graba con el botón rojo grande; podés grabar varios clips; **LISTO** para revisar.
- **USAR VIDEOS DEL TELÉFONO** → elegí uno o varios videos de la galería; se copian al proyecto.
- En el proyecto: reproducir todo seguido, tocar una miniatura para saltar a ese clip, borrar clips, renombrar.
- Los proyectos se guardan solos. Si la app se cierra grabando, el clip se recupera al volver a abrirla.

## Documentación
| Documento | Contenido |
|---|---|
| [PRODUCT.md](PRODUCT.md) | Visión, usuario, alcance |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Componentes y flujo de procesamiento |
| [ROADMAP.md](ROADMAP.md) | Etapas y criterios de aceptación |
| [DEPENDENCIES.md](DEPENDENCIES.md) | Librerías, modelos, versiones, licencias |
| [TEST_PLAN.md](TEST_PLAN.md) | Pruebas automáticas y en dispositivo |
| [BUILD.md](BUILD.md) | Cómo compilar el APK |
| [DECISIONS.md](DECISIONS.md) | Decisiones y motivos |
| [KNOWN_ISSUES.md](KNOWN_ISSUES.md) | Pendientes y problemas conocidos |
| [CLAUDE.md](CLAUDE.md) | Reglas para Claude Code |
