<div align="center">

[English](README.en.md) · **Español**

# Hermes to DSH

**Explora en la barra lateral de DeepSeek Harness Web las habilidades / servidores MCP / historial de conversaciones de la instancia local de Hermes, e inyecta en el agente actual las habilidades y la configuración MCP seleccionadas.**

</div>

---

**Hermes to DSH** (`hermes-to-dsh`) es un plugin de DSH (`dsh.bundle`) que presenta los activos locales de [Hermes](https://github.com/anthropics/hermes) (habilidades, servidores MCP, historial de conversaciones) como una fila propia de la barra lateral en la interfaz web de DeepSeek Harness —junto a Plugins y Tareas de automatización— cuya página se abre en la columna central. Ofrece dos modos de inyección:

- **Activo** — marcas las habilidades/MCP que realmente vas a usar; el plugin lee los `SKILL.md` seleccionados + la configuración MCP y los inyecta en el prompt de sistema del agente actual (con aviso de longitud y límite total).
- **Pasivo** — aviso por contacto; solo cuando falte alguna capacidad, el agente lee bajo demanda el `SKILL.md` de la habilidad o la configuración MCP.

## Funciones

- **Fila en la barra lateral**: icono outline y página completa en la columna central, con el mismo diseño que las páginas nativas de Plugins y Tareas.
- **Búsqueda global**: nombre/id de conversación, nombre/descripción de habilidad, nombre de servidor MCP.
- **Vista previa de conversación**: abre cualquier conversación para ver `inicio X + recientes Y` (el número de cada lado se configura por separado).
- **Filtro por origen**: filtra por `source` de la conversación (desktop/cron/…).
- **Filtro por tipo de mensaje**: ver solo pregunta `user` / respuesta `assistant` / herramienta `tool`; al elegir un tipo, se **autorrellena** hasta la cantidad fijada (tomando de otros tipos si hace falta).
- **Copiar dirección**: copia el id de la sesión.
- **Detalle de MCP**: consulta el bloque de configuración de un servidor antes de marcarlo.
- **Persistencia de la selección activa**: escribe en `~/hermes-active-selection.json` y notifica a la sesión actual, para que el agente conozca tu selección.

## Superficies

| Superficie | Descripción |
|---|---|
| **UI** | Fila propia en `sidebar.panellist` (order 5) y página en el slot `main` (clave `hermes`) |
| **Handlers del host** | `inspect`, `chatPreview`, `mcpDetail`, `setMode`, `detail` |
| **Inyección** | `systemPrompt.section` `hermes:mode` (activo → texto completo de los SKILL.md seleccionados + configuración MCP; pasivo → aviso por contacto) |

## Instalación

```bash
# bundle: entra en la pila de capas del profile (surte efecto al reiniciar web)
dsh plugin --profile web add github:beimianism/Hermes-to-DSH

# o Cordis puro: vía HMR de configuración, sin reinicio
dsh plugin add github:beimianism/Hermes-to-DSH
```

> Las dependencias públicas `@deepseek-ai/*` y `cordis` se omiten a propósito (las inyecta el cierre de pnpm del profile).

Requisitos: los datos de [Hermes](https://github.com/anthropics/hermes) locales en `%LOCALAPPDATA%\hermes\state.db` (solo lectura), y `python` disponible en el `PATH` para los scripts auxiliares.

## Arquitectura nativa (se carga al iniciar)

El plugin es un **bundle + client nativos**, que se cargan automáticamente cada vez que arranca `dsh web`, sin plugin dinámico ni lanzador:

- **Mitad host** (`index.js`): registra `ctx.connection.rpc.handle('/hermes', …, {authority:'trusted-host'})` y expone cinco endpoints: `inspect` / `chatPreview` / `mcpDetail` / `setMode` / `detail`; `systemPrompt.section('hermes:mode')` inyecta el prompt de modo activo/pasivo (si el host no ofrece el servicio `systemPrompt` —como un profile puramente web— el segmento de inyección se omite solo y el resto de funciones no se ve afectado).
- **Mitad client** (`client/index.js`, generado por `client/_make_native.cjs`): bundle de `__ModuleLoader__.load`, `require('react')`, `host.call` adaptado a `ctx.connection.rpc.call('/hermes', …)`, estilos inyectados vía `<style>`; registra una fila en el slot de lista `sidebar.panellist` (id `hermes`, order 5, entre las filas de Plugins y Tareas) y la página que abre en el slot con clave `main` bajo la misma clave.
- La selección activa se guarda en `~/hermes-active-selection.json` y añade un mensaje a la sesión para notificar al agente.

## Uso

1. Abre la interfaz **web** de DeepSeek Harness.
2. Pulsa la fila **`Activos de Hermes`** de la barra lateral (entre Plugins y Tareas) para abrir su página.
3. En la parte superior de la página: ajusta los conteos de inicio/recientes, el filtro por origen, la búsqueda y el tipo de mensaje; en la cabecera cambia **activo/pasivo**.
4. En modo activo, marca las habilidades / servidores MCP que necesites — la página escribirá la selección y notificará a la sesión.

## Gestión del plugin

Gestiona los plugins activos desde la **consola del navegador de DSH / el gestor de plugins**. Este bundle se instala con el nombre `hermes-to-dsh`; para desinstalarlo, elimina su línea de la pila de capas del profile y reinicia web.

## Estructura

```
Hermes-to-DSH/
├── package.json          # manifiesto (name, exports, dsh.bundle.patch, dsh.client)
├── cordis.patch.yml     # fila del bundle, inserta el plugin
├── index.js              # mitad Node (host) —— plugin Cordis
├── client/index.js       # mitad client web —— panel lateral (artefacto ya compilado)
├── client/_make_native.cjs  # generador del client (solo desarrollo; el panel fuente está fuera del workspace)
├── scripts/              # scripts python de solo lectura
│   ├── _hermes_scan.py       # escanea projects/repos/chats/skills/mcp
│   ├── _chat_preview.py      # inicio X + recientes Y (autorrelleno por tipo de mensaje)
│   └── _mcp_detail.py        # lee el bloque de configuración de un servidor
├── AGENTS.md
├── LICENSE (MIT)
└── README / README.en
```

## Licencia

[MIT](./LICENSE)
