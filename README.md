# Pollos Campeón · web + Campe-IA + pedidos + backoffice

Sitio de marketing y pedidos de **Pollos Campeón** («El pollo #1 de Bolivia», tradición desde 1981, Santa Cruz de la Sierra), con:

- **Campe-IA**: asistente de pedidos con herramientas determinísticas, carrito en vivo y modo voz.
- **Pedidos registrados** en Supabase (Postgres + Auth + Realtime), con código `PC-XXXXX`.
- **Seguí tu pollo**: página pública de seguimiento (`/sigue-tu-pollo/?t=<token>`).
- **Campeón Admin** (`/admin`): tablero de pedidos en vivo, nuevo pedido, clientes, sucursales, agotados, menú, reportes, equipo y auditoría.

Sitio estático sin build + funciones serverless de Vercel. Node ≥ 20.

## Stack y archivos

```
index.html               home + SEO (Open Graph, schema.org Restaurant)
css/styles.css           sistema de diseño (tokens de marca arriba, con el origen de cada color)
js/data.js               ← TODO el contenido + catalog(): lo usan la web, Campe-IA y el seed de la base
js/config.js             config pública del backend (supabaseUrl, clave publishable, siteUrl)
js/app.js                render, carrusel, carrito, embudo de WhatsApp, estado de sucursales, chat + voz
api/campeia.js           endpoint de la IA: loop de herramientas, stream NDJSON, guardas del servidor
api/_tools.js            herramientas determinísticas (menú, carrito, promos, pedido, derivación) + esquemas
api/_prompt.js           prompt del sistema + contexto en vivo
api/_persona.js          frases propias de Campe-IA
api/_backend.js          llama a place_order / track_order con la clave publishable (timeout 6 s)
sigue-tu-pollo/          página pública de seguimiento
admin/                   backoffice (supabase-js vendorizado en admin/vendor, sin CDN)
supabase/migrations/     001_core_schema · 002_ops_security_rpcs · 003_rpcs
supabase/seed.sql        generado desde data.js (no editar a mano)
scripts/seed-sql.js      node scripts/seed-sql.js > supabase/seed.sql
scripts/dev-server.js    servidor local sin login de Vercel
tests/tools.test.js      tests de las herramientas (npm test)
tests/db.local.sql       tests de la base en Postgres local (tests/db-local.sh)
tests/backend.e2e.js     chequeos en vivo contra Supabase (crea y cancela pedidos de prueba)
```

Todas las fotos y videos son de la propia marca (Instagram @polloscampeon.oficial y polloscampeon.com), descargados y optimizados en `assets/`. Cada dato de `js/data.js` tiene su fuente en un comentario.

## Funciones de la web

Ticker de promos · header con menú en píldora · carrusel de 5 banners (Combo Champion, Pack Navideño, pollo a la brasa con reel, Combo Ejecutivo, pollo entero) · «¿Dónde querés tu pedido?» · fila de promos · combos del día con **Hoy** marcado solo · Pack Navideño · menú con pestañas · combos y destacados · reels · **embudo de WhatsApp en 4 pasos** con vista previa en vivo · 16 sucursales con estado · historia 45 años · Instagram · footer.

`?day=0…6` en la URL simula el día de la semana (para revisar «Hoy»).

## Campe-IA

- El modelo **propone**; `api/_tools.js` **calcula** todo (precios, combos, ahorros, totales, horarios). La base vuelve a cotizar cada pedido desde `menu_items`.
- Eventos NDJSON: `text`, `cart`, `options`, `readback`, `location`, `order`, `track`, `handoff`, `state`, `error`.
- Guardas del servidor: un «sí» claro a un resumen lo confirma **el servidor** antes de que hable el modelo; cualquier `place_order` del modelo sin esa condición se rechaza. Repetir «sí» no crea dos pedidos.
- Los combos del día solo valen ese día y no en Luján; el Combo Dupla es solo por Yango; la Lasaña de Pollo no está en Ventura Mall.
- **Enseñarle palabras nuevas**: buscá en los logs de Vercel `{"evt":"campeia_miss",…}`, agregá la palabra a `SYNONYMS` en `api/_tools.js` y un test en `tests/tools.test.js`.

| Variable (Vercel → Settings → Environment Variables) | Para qué |
|---|---|
| `ANTHROPIC_API_KEY` | Clave de Claude |
| `CAMPEIA_MODEL` / `CAMPEIA_VOICE_MODEL` | Opcional (por defecto `claude-sonnet-5-5` / `claude-haiku-5-5`) |
| `NVIDIA_API_KEY` | Clave de NVIDIA NIM (alternativa) |
| `CAMPEIA_NVIDIA_MODEL` | Opcional, debe soportar tool calling (por defecto `meta/llama-3.3-70b-instruct`) |
| `CAMPEIA_PROVIDER` | Opcional: fuerza `anthropic` o `nvidia` |

Después de cargar la clave, **Redeploy**. Sin clave el chat muestra «Campe-IA se está preparando…» y todo lo demás funciona.

## Backend (Supabase)

1. Crear un proyecto en **sa-east-1 (São Paulo)**.
2. Aplicar en orden `supabase/migrations/001…003` (SQL Editor o `supabase db push`) y luego `supabase/seed.sql`.
3. Completar en `js/config.js` el **Project URL** y la clave **publishable** (`sb_publishable_…`). Es pública por diseño: la seguridad la da RLS. La clave secreta / service-role **no** se usa nunca.
4. Crear el primer **dueño**: Authentication → Add user, y después
   `insert into public.staff (user_id, full_name, email, role) select id, 'Dueño', email, 'owner' from auth.users where email = '<correo>';`
   El resto del equipo se crea desde `/admin` → Equipo.
5. Dashboard: Authentication → desactivar **Allow new users to sign up**; activar **leaked password protection**. Correr los *advisors* de seguridad y rendimiento.

**Esquema**: `stores`, `menu_items` (con `available_days`, `valid_until`, `excluded_stores`), `store_item_availability` (agotados), `staff`, `customers` (CRM), `customer_addresses`, `orders` (código, `client_ref` idempotente, `tracking_token`, número diario por sucursal), `order_items`, `order_events`, `audit_log`, `cancel_reasons`.

**Seguridad**: RLS en todas las tablas; la clave pública solo puede leer menú/sucursales y llamar `place_order` / `track_order`. El estado y los precios cambian solo por RPC. Cocina solo confirma → listo; repartidor solo despacha/entrega; cancelar después de empezar y volver atrás requiere gerente; cada gerente ve solo su sucursal; precios, agotados, equipo y cambios de pedidos quedan en `audit_log`.

**Roles**: dueño, administrador, gerente, caja, cocina, repartidor.

**Precios sincronizados**: la web muestra `js/data.js`; la base cobra `menu_items`. Tras cambiar un precio, actualizá ambos (en `/admin` → Menú y en `data.js`, o regenerá el seed y volvé a correrlo).

## Embudo de WhatsApp y ruteo por sucursal

El paso 4 registra el pedido con `place_order` (un `client_ref` por envío: doble clic = un pedido), agrega el código y el link de seguimiento al mensaje y abre `wa.me/<sucursal>`. Si la base rechaza (agotado, pausada, sin delivery…) se muestra el motivo. Si la base no responde, WhatsApp se abre igual, sin código.

Hoy solo **Villa 1ro de Mayo** tiene WhatsApp propio (650-60555); el resto va a la central **798-88975**. Cuando cada sucursal tenga su número, cargalo en `js/data.js` (`branches[].whatsapp`) y en `/admin` → Sucursales.

## Correr local y tests

```bash
npm install
npm test                       # 34 tests de las herramientas y del loop de la IA
node scripts/dev-server.js     # http://localhost:3000 (sirve /api/campeia también)
```

Tests de la base con un Postgres local (no toca Supabase):

```bash
PGHOST=… PGUSER=postgres tests/db-local.sh   # imprime "ALL DB CHECKS PASSED"
```

En vivo, con el proyecto creado:

```bash
SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… OWNER_EMAIL=… MANAGER_EMAIL=… KITCHEN_EMAIL=… node tests/backend.e2e.js <ownerPw> <managerPw> <kitchenPw>
```

## Actualizar contenido

Todo en `js/data.js`: precios, combos del día (`weekly`, `combos`, `weeklyUntil`), Pack Navideño (`special`, se oculta solo después del 20/12/2026), sucursales, reels y feed. Los banners del carrusel están en `index.html`: mantené sus precios iguales a `data.js`. Después: `node scripts/seed-sql.js > supabase/seed.sql` y correr el seed.

**Vencimientos**: los combos de noviembre (Trío lunes Bs 95, Ejecutivo martes Bs 130, Dupla miércoles Bs 60 solo Yango, Champion jueves Bs 70) dicen «de noviembre» → se ocultan solos después del **30/11/2026**. El Pack Navideño se reserva hasta el **20/12/2026**. Para diciembre, actualizá `weekly`, `combos`, los banners 1 y 4 y el seed.

## Falta confirmar con el dueño

| Dato | Dónde va |
|---|---|
| **Horarios** de cada sucursal (no están publicados). Al cargarlos se activan Abierta / Cierra pronto / Cerrada y «X de 16 abiertas». | `branches[].open/close` en `data.js` + `/admin` → Sucursales |
| WhatsApp propio de cada sucursal (solo Villa 1ro de Mayo es público) | `branches[].whatsapp` + `/admin` |
| Dirección exacta de **Luján** y si **Ventura Sur** es una sucursal nueva (aparece en un reel) | `branches` |
| Costo y zonas de delivery | `/admin` → Sucursales (costo) |
| Medios de pago aceptados (efectivo, QR, tarjeta…) | enum `payment_method` + `facts` |
| Precio de las sodas sueltas / bebidas | `drinks` en `data.js` |
| Ingredientes y alérgenos de cada plato; qué trae el pollo entero «con guarniciones» | `menu[].items[].desc` |
| Sucursales 1 y 8 comparten Av. Cañoto 571 (se muestran como una) | `branches` |
| Combos de diciembre y si hay combo los viernes | `weekly`, `combos` |
| Requisitos de factura (NIT/razón social) | ya hay campos en clientes y pedidos |
| Dominio definitivo (canonical y Open Graph usan `polloscampeon.vercel.app`) | `index.html`, `js/config.js` (`siteUrl`) |
