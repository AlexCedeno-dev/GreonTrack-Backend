# GreonTrack — Backend

API de ingesta del Sistema Inteligente de Análisis del Consumo Energético.

## Qué hace

Este Backend (Node.js + Express) no calcula ni sirve kWh, costo ni CO2.
Su única función es recibir los reportes de uso que manda el Agente
GreonTrack desde la laptop del usuario por `POST /agent/uso`, validarlos
y guardarlos en Supabase. El cálculo de kWh, costo eléctrico y huella de
carbono lo hace un trigger en la base de datos al insertarse el registro,
y el Frontend lee los resultados directo de Supabase con la sesión del
usuario (el login y registro también se manejan desde el Frontend).

## Autenticación y acceso a la base

El Agente no tiene sesión de usuario: se identifica con un `device_token`
que envía en el header `x-device-token`. El Backend busca ese token en la
tabla `dispositivos` y verifica que el dispositivo tenga origen `agente`.
Como no hay sesión, las consultas y el insert se hacen con la llave
`service_role` de Supabase, que se salta RLS. Por eso esa llave solo debe
vivir en el entorno del servidor y nunca en el Frontend ni en el Agente.

## Stack

- Node.js (CommonJS) y Express
- Supabase (Postgres) mediante `@supabase/supabase-js`

## Configuración y ejecución

```bash
npm install
cp .env.example .env
# completar las variables descritas abajo
npm start        # producción / normal
npm run dev      # con nodemon
```

El proyecto de Supabase al que se conecta el Backend se define únicamente
por variables de entorno (`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`),
así que cambiar de proyecto no requiere tocar el código.

## Variables de entorno

- `PORT` — puerto del servidor (default 3000).
- `DATA_MODE` — usar `supabase`, que es el valor por defecto y el que
  corresponde a un despliegue real. Existe también un modo `mock` con
  datos en memoria, pensado solo para pruebas locales sin base de datos.
- `SUPABASE_URL` — URL del proyecto de Supabase.
- `SUPABASE_SERVICE_ROLE_KEY` — llave service_role, usada para validar el
  `device_token` y escribir en la base.
- `SUPABASE_ANON_KEY` — declarada pero sin uso en el código actual.
- `MAX_USO_SEGUNDOS` — opcional; tope de `uso_segundos` por reporte
  (default 21600, es decir 6 horas).

## Endpoints

### POST /agent/uso

Requiere el header `x-device-token`. Body JSON:

- `uso_segundos` (obligatorio): número finito, mayor o igual a 0 y no
  mayor a `MAX_USO_SEGUNDOS`.
- `fecha` (opcional): `YYYY-MM-DD` o ISO 8601 completo (el Agente manda
  este último); no puede ser futura (se tolera 5 minutos de desfase de
  reloj). Si falta, se usa la fecha actual del servidor.
- `hostname`, `sesion_activa`, `usuario_windows`: informativos.

Si la validación falla responde 400 con un mensaje y no se inserta nada.
Con token ausente o inválido responde 401, y 403 si el dispositivo no es
de origen agente. En éxito responde `{ ok: true, registro_id }`.

### GET /agent/debug/registros

Solo disponible con `DATA_MODE=mock`; en otro caso responde 404.

## CI

El workflow de GitHub Actions (`.github/workflows/ci.yml`) instala
dependencias, revisa la sintaxis, corre `npm audit` como gate real
(falla con vulnerabilidades altas o críticas) y un escaneo Trivy que
también funciona como gate (falla con hallazgos HIGH o CRITICAL). Las
dependencias de producción no tienen vulnerabilidades conocidas
(`npm audit --omit=dev`). Quedan 2 moderadas en `minimatch`, que solo
llega como dependencia de `nodemon` (desarrollo); corregirlas requiere
forzar un salto de versión mayor dentro de nodemon. Dependabot propone
actualizaciones semanales de npm y de GitHub Actions.