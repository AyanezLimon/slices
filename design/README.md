# Slices

Slices es la app de quehaceres de la familia Limón. Un limón entero se reparte en gajos: cada quien tiene su parte de la casa, y la app responde una sola pregunta, **¿qué me toca hoy?**

La identidad sale de un limón criollo, de cáscara verde y pulpa clara, cortado a la mitad. La media rodaja con un gajo que se asoma hacia arriba es el ícono ("tu parte"), y la misma media rodaja es el medidor del día en la pantalla Hoy.

## Voz

- Español, de tú, cercano y corto: "Hoy te toca", "Isis te cubrió", "¿Lo cubres?".
- Los botones dicen exactamente lo que pasa: **Hecho**, **No puedo**, **Yo la hice**, **Enviar pedido a Isis**.
- Nada de culpa ni regaños. Una tarea pendiente es "pendiente", nunca "atrasada" ni "fallaste".
- Fechas como las dice la gente: "el martes 20", "hoy", "mañana".

## Ícono y logotipo

- **Ícono**: media rodaja sobre `icono-fondo`, cáscara `icono-cascara`, médula `icono-medula`, cinco gajos `icono-pulpa` con el central separado hacia arriba. Esquina `radius-icono`. Es igual en tema claro y oscuro (usa los tokens `icono-*`, que no cambian con el tema).
- Exportes para la PWA: 512 y 192 px (`purpose: any`), 512 px maskable con la rodaja dentro del 80 % central, y `apple-touch-icon` de 180 px.
- **Logotipo**: la palabra "Slices" en Fraunces 600 (estilo `logotipo`), siempre con mayúscula inicial. Sobre `marca` va en `sobre-marca`; sobre `fondo` va en `marca` (claro) o `tinta` (oscuro).
- No girar el ícono, no cambiar el número de gajos, no usar limón amarillo.

## Color

Dos temas, **Claro** y **Oscuro**. Cada persona elige en su Perfil: *Sistema* (sigue al teléfono, por defecto), *Claro* u *Oscuro*. La app pone `data-theme="light|dark"` en `<html>` cuando la persona eligió uno; con *Sistema* no pone nada y manda `prefers-color-scheme`.

- Fondos: `fondo` para la pantalla, `superficie` para tarjetas, `superficie-tenue` para bloques suaves dentro de una tarjeta.
- Texto: `tinta` y `tinta-suave`. Ambos pasan 4.5:1 sobre los tres fondos en los dos temas.
- Acción: `primario` / `sobre-primario`. En claro es verde bosque con texto médula; en oscuro se invierte a pulpa con texto bosque, para que el botón principal siga siendo lo más visible.
- Progreso: `pulpa` (hecho) contra `pendiente` (por hacer), con `cascara` como borde del medidor.
- Estados: `aviso` + `aviso-fondo` para cubierta, devolución y avisos que no llegan; `peligro` solo para Quitar.
- Personas: `persona-1` … `persona-5` con `sobre-persona` para las iniciales. Cada miembro guarda su índice de color; no se reutiliza un color dentro de la casa.

## Tipografía

- **Fraunces** (display): solo logotipo, el saludo de Hoy, títulos de pantalla y de hojas. Una vez por pantalla como máximo además del logotipo.
- **Plus Jakarta Sans** (interfaz): todo lo demás. Nombres de tareas en `tarea`, metadatos en `meta`, eyebrows en `etiqueta`.
- Ambas desde Google Fonts. Fallbacks en `type.families`.

## Forma y espacio

- Pantalla de celular con margen lateral `space-5`; tarjetas con padding `space-4`, radio `radius-lg` y `sombra-tarjeta`.
- Botones de 44 px de alto como mínimo, radio `radius-md`. Interruptores y chips de persona en `radius-pill`.
- Hojas inferiores con radio `radius-xl` arriba y `sombra-hoja`.
- Secciones separadas por `space-6`.

## Iconografía

Íconos de trazo, 24 px, `stroke-width` 2, puntas redondeadas, en `currentColor`. Nunca emoji. Los avatares predeterminados usan el mismo estilo sobre un círculo de color de persona.

## Componentes

- **AppIcon**: el ícono en sus tamaños de exporte.
- **Medidor**: la media rodaja de progreso de la casa; tu gajo pendiente se asoma.
- **Button**: primario, secundario y de texto.
- **TaskCard**: la tarjeta de "Lo que me toca", pendiente y hecha.
- **Chip**: estados Hecha, Cubierta, Devolución.

Las vistas previas son HTML de referencia construido solo con los tokens; la app real (Preact) debe reproducirlas con las mismas variables CSS de `tokens.css`.
