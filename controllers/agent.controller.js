const { insertarRegistroUso } = require('../data/mockStore');

const DATA_MODE = process.env.DATA_MODE || 'supabase';

// Tope de uso_segundos por reporte. El Agente limita cada delta a
// MAX_DELTA_SEGUNDOS (default 3 * intervalo = 180 s, configurable), así que el
// Backend usa un techo holgado (6 h) para no rechazar reportes legítimos aun
// con intervalos largos; sirve para frenar valores absurdos. Ajustable por env.
const MAX_USO_SEGUNDOS = Number(process.env.MAX_USO_SEGUNDOS) || 6 * 3600;

// Tolerancia por desfase de reloj entre la laptop del usuario y el servidor.
const TOLERANCIA_FUTURO_MS = 5 * 60 * 1000;

const FECHA_SOLO_DIA = /^\d{4}-\d{2}-\d{2}$/;
// El Agente envía ISO 8601 completo (Date.toISOString), p. ej. 2026-11-04T10:00:00.000Z.
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

// Devuelve un mensaje de error o null si el body es válido.
function validarReporte({ uso_segundos, fecha }) {
  if (uso_segundos === undefined || uso_segundos === null) {
    return 'uso_segundos es requerido';
  }
  if (typeof uso_segundos !== 'number' || !Number.isFinite(uso_segundos)) {
    return 'uso_segundos debe ser un número finito';
  }
  if (uso_segundos < 0) {
    return 'uso_segundos no puede ser negativo';
  }
  if (uso_segundos > MAX_USO_SEGUNDOS) {
    return `uso_segundos no puede superar ${MAX_USO_SEGUNDOS} segundos`;
  }

  if (fecha !== undefined && fecha !== null) {
    if (typeof fecha !== 'string' || !(FECHA_SOLO_DIA.test(fecha) || FECHA_ISO.test(fecha))) {
      return 'fecha debe tener formato YYYY-MM-DD o ISO 8601 (YYYY-MM-DDTHH:mm:ssZ)';
    }
    const ms = new Date(fecha).getTime();
    // Se valida la parte de día aparte: evita días inexistentes como 2026-02-31.
    const [y, m, d] = fecha.slice(0, 10).split('-').map(Number);
    const dia = new Date(Date.UTC(y, m - 1, d));
    const diaValido =
      dia.getUTCFullYear() === y && dia.getUTCMonth() === m - 1 && dia.getUTCDate() === d;
    if (Number.isNaN(ms) || !diaValido) {
      return 'fecha no es una fecha válida';
    }
    if (ms > Date.now() + TOLERANCIA_FUTURO_MS) {
      return 'fecha no puede ser futura';
    }
  }

  return null;
}

async function reportarUso(req, res) {
  const { uso_segundos, sesion_activa, hostname, usuario_windows, fecha } = req.body || {};

  const errorValidacion = validarReporte({ uso_segundos, fecha });
  if (errorValidacion) {
    return res.status(400).json({ error: errorValidacion });
  }

  const horas_uso = Math.round((uso_segundos / 3600) * 10000) / 10000;
  const dispositivo = req.dispositivo;

  let registroId;

  if (DATA_MODE === 'mock') {
    const registro = insertarRegistroUso({
      dispositivo_id: dispositivo.id,
      horas_uso,
      fuente: 'agente',
      fecha: fecha || new Date().toISOString(),
    });

    registroId = registro.id;
  } else {
    const { data, error } = await req.supabaseAdmin
      .from('registros_uso')
      .insert({
        dispositivo_id: dispositivo.id,
        horas_uso,
        fuente: 'agente',
        fecha_uso: fecha || new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      return res.status(500).json({
        error: 'No se pudo guardar el registro de uso',
        detalle: error.message,
      });
    }

    registroId = data.id;
  }

  console.log(
    `[agent] Reporte recibido - dispositivo: ${dispositivo.id}, hostname: ${hostname}, horas: ${horas_uso}`
  );

  return res.status(200).json({ ok: true, registro_id: registroId });
}

module.exports = { reportarUso };
