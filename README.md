# Hexacraft

Demo web de un juego de bloques con **prismas hexagonales**, hecha para el vídeo
**"¿Por qué Minecraft no usa hexágonos?"** del canal de YouTube
**[Mente Tangente](https://www.youtube.com/@MenteTangente)**.

El objetivo no es un juego completo, sino una demo que se ve bien en cámara y
que permite comparar la misma escena con **hexágonos** y con **cuadrados**
cambiando de rejilla con una tecla.

> Proyecto de fan sin afiliación con Mojang ni Microsoft.

## Cómo ejecutarlo

Se necesita Node.js 22 o superior.

```bash
npm install
npm run dev
```

Se abre en `http://localhost:5173/hexacraft/`. Para el build de producción:

```bash
npm run build
npm run preview
```

Otros scripts:

```bash
npm run test        # Vitest
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint
```

## Controles

- **Clic** en el canvas para bloquear el puntero.
- **WASD** mover, **Espacio** saltar / nadar arriba / subir en vuelo,
  **Shift** sprint (andando) o bajar (en vuelo).
- **F** alterna vuelo, **G** alterna rejilla (hexágonos ↔ cuadrados), **T** alterna
  texturas ↔ colores planos, **X** alambre.
- **+** y **−** ajustan la distancia de render.
- **1..9** o **rueda del ratón** eligen bloque de la barra; **clic izquierdo** rompe,
  **clic derecho** coloca (mantener repite cada 0,25 s).
- **F3** panel de depuración, **F1** modo cine.

También se puede fijar la distancia de render en la URL, por ejemplo
`?distancia=96` (con clamp `[16, 256]`).

## Licencia

Código bajo licencia [MIT](LICENSE) © 2026 Mente Tangente. Todas las texturas,
sonidos y modelos se generan por código: **no hay assets de Minecraft ni de Mojang**.
