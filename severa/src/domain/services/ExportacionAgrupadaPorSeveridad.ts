import { Vulnerabilidad } from '../entities/Vulnerabilidad';
import { clasificar } from './ClasificadorDeRiesgo';
import { ETIQUETA_POR_NIVEL } from './GraficosEstadisticos';

// Bug real reportado: la descarga de vulnerabilidades era una lista plana
// sin encabezado ni orden, difícil de trabajar (RF-90/Sprint 03 solo definía
// 3 columnas: CVE, CVSS Score, software). Se agrupa por severidad (Crítica >
// Alta > Media > Baja, mismo orden que ClasificadorDeRiesgo/GraficosEstadisticos).
//
// Orden pedido (2026-07-20): CVE, CVSS Score, Severidad, Software, Tipo
// Acceso, [Attack Complexity, Privileges Required, User Interaction — NO
// disponibles, ver nota abajo], Fecha, Revisar. Se agrega "Estado" (estado
// de remediación) al final, antes de Revisar: no estaba en la lista pedida,
// pero es un dato real del dominio que ya se exportaba y que quitarlo sería
// una regresión funcional no pedida por nadie.
//
// Attack Complexity / Privileges Required / User Interaction NO se agregan:
// son sub-componentes del vector CVSS que el modelo de dominio de SEVERA
// nunca captura ni almacena (Vulnerabilidad.ts solo guarda tipoAcceso,
// derivado de attack_vector — no el resto del vector). Inventar esos
// valores sería fabricar datos falsos; agregarlos de verdad requiere un
// cambio de esquema (migración + import + entidad) mucho más grande que
// "agregar columnas al Excel", fuera de alcance de este fix sin confirmarlo
// primero.
export const ENCABEZADO_EXPORTACION = ['CVE', 'CVSS', 'Severidad', 'Software', 'Tipo de Acceso', 'Fecha', 'Estado', 'Revisar'];

export const ORDEN_SEVERIDAD = ['Crítica', 'Alta', 'Media', 'Baja'] as const;

export function severidadDe(vulnerabilidad: Vulnerabilidad): string {
  return ETIQUETA_POR_NIVEL[clasificar(vulnerabilidad.cvssScore).valor];
}

export interface GrupoDeSeveridad {
  severidad: (typeof ORDEN_SEVERIDAD)[number];
  vulnerabilidades: Vulnerabilidad[];
}

// Grupos no vacíos, en orden Crítica > Alta > Media > Baja — única fuente de
// la agrupación, reusada tanto por el exportador CSV (aCsv/construirFilasAgrupadasPorSeveridad)
// como por el exportador .xlsx con color/fusión real (ExportadorExcelAgrupado.ts).
export function agruparPorSeveridad(vulnerabilidades: Vulnerabilidad[]): GrupoDeSeveridad[] {
  return ORDEN_SEVERIDAD.map((severidad) => ({
    severidad,
    vulnerabilidades: vulnerabilidades.filter((v) => severidadDe(v) === severidad)
  })).filter((grupo) => grupo.vulnerabilidades.length > 0);
}

// "Revisar" (2026-07-20): marca visualmente las filas con algún campo
// opcional vacío (ej. Tipo de Acceso sin mapear), sin omitir la columna ni
// rechazar la fila — mismo criterio de "mostrar lo que hay" que compararGrupos.
export function filaDeExportacion(vulnerabilidad: Vulnerabilidad): string[] {
  const tipoAcceso = vulnerabilidad.tipoAcceso?.valor ?? '';
  const datosBase = [
    vulnerabilidad.cve.valor,
    String(vulnerabilidad.cvssScore.valor),
    severidadDe(vulnerabilidad),
    vulnerabilidad.software,
    tipoAcceso,
    vulnerabilidad.fechaCarga.toISOString().slice(0, 10),
    vulnerabilidad.estadoRemediacion.valor
  ];
  const incompleta = datosBase.some((celda) => celda === '');
  return [...datosBase, incompleta ? '✓' : ''];
}

// Devuelve todas las filas listas para escribir en CSV (encabezado + separador
// de texto entre severidades + nota final si hay campos vacíos), como array
// de arrays — un join(',') por fila arma el CSV completo (ver aCsv).
export function construirFilasAgrupadasPorSeveridad(vulnerabilidades: Vulnerabilidad[]): string[][] {
  const filas: string[][] = [ENCABEZADO_EXPORTACION];
  let hayCeldasVacias = false;

  for (const grupo of agruparPorSeveridad(vulnerabilidades)) {
    filas.push([`SEVERIDAD: ${grupo.severidad.toUpperCase()} (${grupo.vulnerabilidades.length})`, ...Array(ENCABEZADO_EXPORTACION.length - 1).fill('')]);
    for (const vulnerabilidad of grupo.vulnerabilidades) {
      const fila = filaDeExportacion(vulnerabilidad);
      if (fila[fila.length - 1] === '✓') {
        hayCeldasVacias = true;
      }
      filas.push(fila);
    }
  }

  if (hayCeldasVacias) {
    filas.push([]);
    filas.push(['Datos incompletos: revisar la fila si alguna columna aparece vacía (columna "Revisar").']);
  }

  return filas;
}

export function aCsv(filas: string[][]): string {
  return filas.map((fila) => fila.join(',')).join('\n');
}
