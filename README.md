# Pollos Campeón · sitio web + Campe-IA

Sitio de marketing y pedidos para **Pollos Campeón** («El pollo #1 de Bolivia», tradición desde 1981, Santa Cruz de la Sierra), con una recepcionista virtual con IA: **Campe-IA**.

Sitio estático sin build + una sola función serverless de Vercel.

```
index.html        estructura + SEO (Open Graph, schema.org Restaurant)
css/styles.css    sistema de diseño (tokens de marca arriba, con el origen de cada color)
js/data.js        ← TODO el contenido: menú, promos, sucursales, datos (lo usan la web y la IA)
js/app.js         render, carrito, embudo de WhatsApp, estado en vivo, chat de Campe-IA
api/campeia.js    endpoint de IA (stream de texto; Claude o NVIDIA NIM)
api/_prompt.js    arma el conocimiento de la IA desde js/data.js + contexto en vivo
assets/img        fotos de producto     assets/stores   fotos de sucursales
assets/brand      íconos, imagen para compartir
```

Todas las fotos son de la propia marca (polloscampeon.com). Cada dato de `js/data.js` tiene su fuente en un comentario.

## Correr local

```bash
npm install
npx vercel dev
```

## Variables de entorno (Vercel → Project → Settings → Environment Variables)

| Variable | Para qué |
|---|---|
| `ANTHROPIC_API_KEY` | Clave de Claude (proveedor por defecto) |
| `CAMPEIA_MODEL` | Opcional: otro modelo de Claude (por defecto `claude-sonnet-5-5`) |
| `NVIDIA_API_KEY` | Clave de NVIDIA NIM (si usás NVIDIA) |
| `CAMPEIA_NVIDIA_MODEL` | Opcional: modelo NIM (por defecto `meta/llama-3.3-70b-instruct`) |
| `CAMPEIA_PROVIDER` | Opcional: fuerza `anthropic` o `nvidia` |

Después de cargar la clave, **hacé Redeploy**. Sin clave el chat muestra «Campe-IA se está preparando…» y el resto del sitio funciona igual.

## Actualizar contenido

Todo se edita en `js/data.js`: precios, promos, sucursales, el especial de temporada. La web y Campe-IA leen ese mismo archivo, así nunca se contradicen.

- `?day=0…6` en la URL simula el día (para revisar la tarjeta «Hoy» de promos).
- El **Pack Navideño** (`special`) se oculta solo después del `reserveUntil` (2026-12-20).

## Falta confirmar con el dueño

| Dato | Dónde va en `js/data.js` |
|---|---|
| **Horarios de atención** de cada sucursal (no están publicados). Con `open`/`close` se activan solos los estados Abierto / Cierra pronto / Cerrado y el contador «X de 15 abiertas». | `branches[].open`, `branches[].close` (`"HH:MM"`) |
| WhatsApp propio de cada sucursal (solo Villa 1ro de Mayo tiene uno público). Sin número, el pedido va a la central 798-88975. | `branches[].whatsapp` (`"591…"`) |
| Fotos de las sucursales Zona Sur, Zona Oeste, Villa 1ro de Mayo y Av. Brasil (la web oficial repite fotos de otros locales). | `branches[].img` |
| ¿Sigue vigente el calendario de promos de lunes a viernes? Se publicó para **julio 2026**. | `weekly` |
| Costo/zonas/tiempo de delivery y medios de pago. | `facts` |
| Precios de sodas sueltas y bebidas. | nuevo grupo en `addons` |
| Descripciones/ingredientes de cada plato y qué guarniciones trae el pollo entero. | `menu[].items[].desc` |
| Sucursales 1 y 8 comparten dirección (Av. Cañoto 571): se mostraron como una sola. Confirmar. | `branches` |
| Datos para «Trabajá con nosotros» (la web oficial tiene el enlace pero sin detalle). | nueva sección |
| Fotos o videos propios del Instagram (reels) para el hero y una sección de reels. | `assets/` |
