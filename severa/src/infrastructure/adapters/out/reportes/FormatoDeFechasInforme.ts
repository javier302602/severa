import { config } from '../../../config/env';

// Fechas tal como se imprimen en los informes (PDF y Word, los dos
// pipelines). Antes cada renderer llamaba toLocaleString()/
// toLocaleDateString() sin argumentos, y el resultado dependía de dónde
// corriera el proceso:
//   - idioma: el del sistema operativo del servidor. En la imagen Docker
//     (node:22-alpine) eso es inglés: "10/8/2026, 2:05:26 PM" en la portada de
//     un informe en castellano, con mes y día en el orden contrario al que
//     lee un usuario peruano;
//   - zona horaria: la del contenedor, UTC salvo que alguien configure otra
//     cosa — la hora de "Generado" salía 5 horas adelantada;
//   - un día "de calendario" guardado a medianoche UTC (el rango de una
//     columna de fecha) se mostraba como el día ANTERIOR en cualquier zona al
//     oeste de Greenwich: una columna que va del 10 de enero al 28 de junio
//     se informaba "del 9 de enero al 27 de junio".
// Las dos funciones de acá no dependen de ninguna de esas tres cosas.

function partes(fecha: Date, zonaHoraria: string): Record<string, string> {
  const formateador = new Intl.DateTimeFormat('es-PE', {
    timeZone: zonaHoraria,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });
  return Object.fromEntries(formateador.formatToParts(fecha).map((parte) => [parte.type, parte.value]));
}

// Un instante real (cuándo se generó el informe, cuándo se importó un
// dataset): día/mes/año y hora de 24 h en la zona configurada
// (ZONA_HORARIA_INFORMES, por defecto America/Lima), con la zona escrita al
// lado para que la hora no sea ambigua fuera de ella. Se arma a mano desde
// formatToParts en vez de usar el string de Intl tal cual: los formatos
// "medium/short" de es-PE meten espacios U+202F/U+00A0 ("2:05 p. m.") que
// las fuentes estándar de pdfkit (WinAnsi) no tienen.
export function formatearMomento(fecha: Date, zonaHoraria: string = config.zonaHorariaInformes): string {
  try {
    const p = partes(fecha, zonaHoraria);
    return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute} (${zonaHoraria})`;
  } catch {
    // Zona mal escrita en la configuración: un informe con la hora en UTC
    // (y diciéndolo) es mejor que no poder generar el informe.
    const p = partes(fecha, 'UTC');
    return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute} (UTC)`;
  }
}

// Un día de calendario sin hora (rango de una columna de fecha, una celda de
// fecha de un .xlsx): AAAA-MM-DD leído en UTC, que es como el dominio lo
// guarda (ver aFechaGenerica en DetectorDeTipoDeColumna.ts) y el mismo
// formato que ya usan los intervalos del histograma de fechas.
export function formatearDiaCalendario(valor: string | Date): string {
  const fecha = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(fecha.getTime()) ? 'fecha inválida' : fecha.toISOString().slice(0, 10);
}
