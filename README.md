# Hexacraft

Demo web de un juego de bloques con **prismas hexagonales**, hecha para el vídeo
**"¿Minecraft es mejor con hexágonos?"** del canal de YouTube
**[Mente Tangente](https://www.youtube.com/@MenteTangente)**.

El objetivo no es un juego completo, sino una demo que se ve bien en cámara y
que permite comparar la misma escena con **hexágonos** y con **cuadrados**
cambiando de rejilla con una tecla.

> Proyecto de fan sin afiliación con Mojang ni Microsoft.

## ¡Juega online!

**→ [mentetangente.github.io/hexacraft](https://mentetangente.github.io/hexacraft/)**

Se abre directamente en el navegador, sin instalar nada.

## Controles

- **Clic** en el canvas para bloquear el puntero.
- **WASD** mover, **Espacio** saltar / nadar arriba / subir en vuelo,
  **Shift** sprint (andando) o bajar (en vuelo).
- **F** alterna vuelo, **G** alterna rejilla (hexágonos ↔ cuadrados),
  **V** vista dividida (hex a la izquierda, cuadrados a la derecha).
- **T** alterna texturas ↔ colores planos, **X** alambre.
- **+** y **−** ajustan la distancia de render.
- **1..9** o **rueda del ratón** eligen bloque de la barra; **clic izquierdo** rompe,
  **clic derecho** coloca (mantener repite cada 0,25 s).
- **C** copia la URL con el estado actual (rejilla, semilla, posición, orientación,
  modo, distancia, texturas).
- **B** exporta las construcciones a un archivo JSON, **N** importa uno,
  **Supr** borra las construcciones de la semilla actual (con confirmación).
  Las construcciones se autoguardan en `localStorage` por semilla y rejilla.
- **F3** panel de depuración, **F1** modo cine.

URL:

- `?distancia=96` fija la distancia inicial (clamp `[16, 256]`).
- `?benchmark=1` (opcional `&grid=hex|square`) vuela una órbita fija de 30 s y
  muestra un resumen copiable con fps, p95 de frame, y tiempos de gen/mesh.
- Hash `#grid=…&seed=…&pos=…&rot=…&mode=…&dist=…&tex=…` restaura un estado.

## Licencia

Código bajo licencia [MIT](LICENSE) © 2026 Mente Tangente. Todas las texturas,
sonidos y modelos se generan por código: **no hay assets de Minecraft ni de Mojang**.
