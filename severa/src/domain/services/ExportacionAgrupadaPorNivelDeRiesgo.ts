import { Vulnerabilidad } from '../entities/Vulnerabilidad';
import { NivelDeRiesgo } from '../shared/value-objects/NivelDeRiesgo';
import { EscalaDeClasificacion } from '../shared/value-objects/EscalaDeClasificacion';

// Bug real reportado: la descarga de vulnerabilidades era una lista plana
// sin encabezado ni orden, difícil de trabajar (RF-90/Sprint 03 solo definía
// 3 columnas: CVE, CVSS Score, software). Se agrupa por nivel de riesgo
// (Crítico > Alto > Moderado > Bajo).
//
// RF-28 / RF-69 (Modo B): el nivel se calcula con la escala del analista —la
// misma con la que se filtró lo que se exporta— y el archivo dice cuál fue.
// Antes la columna se llamaba "Severidad" y decía Crítica/Alta/Media/Baja;
// el vocabulario se unificó con el resto del sistema.
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
export const ENCABEZADO_EXPORTACION = ['CVE', 'CVSS', 'Nivel de riesgo', 'Software', 'Tipo de Acceso', 'Fecha', 'Estado', 'Revisar'];

export const ORDEN_DE_NIVELES: readonly NivelDeRiesgo[] = ['Crítico', 'Alto', 'Moderado', 'Bajo'];

export interface GrupoDeNivelDeRiesgo {
  nivel: NivelDeRiesgo;
  vulnerabilidades: Vulnerabilidad[];
}

// La línea que encabeza el archivo: con qué escala se clasificó.
export function lineaDeEscala(escala: EscalaDeClasificacion): string {
  return escala.leyenda();
}

// Grupos no vacíos, en orden Crítico > Alto > Moderado > Bajo — única fuente
// de la agrupación, reusada tanto por el CSV (construirFilasAgrupadasPorNivelDeRiesgo)
// como por el .xlsx con color y fusión real (ExportadorExcelAgrupado.ts).
export function agruparPorNivelDeRiesgo(vulnerabilidades: Vulnerabilidad[], escala: EscalaDeClasificacion): GrupoDeNivelDeRiesgo[] {
  const porNivel = new Map<NivelDeRiesgo, Vulnerabilidad[]>(ORDEN_DE_NIVELES.map((nivel) => [nivel, []]));
  for (const vulnerabilidad of vulnerabilidades) {
    porNivel.get(escala.clasificar(vulnerabilidad.cvssScore.valor))!.push(vulnerabilidad);
  }
  return ORDEN_DE_NIVELES.map((nivel) => ({ nivel, vulnerabilidades: porNivel.get(nivel)! })).filter(
    (grupo) => grupo.vulnerabilidades.length > 0
  );
}

// "Revisar" (2026-07-20): marca visualmente las filas con algún campo
// opcional vacío (ej. Tipo de Acceso sin mapear), sin omitir la columna ni
// rechazar la fila — mismo criterio de "mostrar lo que hay" que compararGrupos.
export function filaDeExportacion(vulnerabilidad: Vulnerabilidad, escala: EscalaDeClasificacion): string[] {
  const tipoAcceso = vulnerabilidad.tipoAcceso?.valor ?? '';
  const datosBase = [
    vulnerabilidad.cve.valor,
    String(vulnerabilidad.cvssScore.valor),
    escala.clasificar(vulnerabilidad.cvssScore.valor),
    vulnerabilidad.software,
    tipoAcceso,
    vulnerabilidad.fechaCarga.toISOString().slice(0, 10),
    vulnerabilidad.estadoRemediacion.valor
  ];
  const incompleta = datosBase.some((celda) => celda === '');
  return [...datosBase, incompleta ? '✓' : ''];
}

// Devuelve todas las filas listas para escribir en CSV (escala usada,
// encabezado, separador de texto entre niveles y nota final si hay campos
// vacíos), como array de arrays — un join(',') por fila arma el CSV completo
// (ver aCsv).
export function construirFilasAgrupadasPorNivelDeRiesgo(vulnerabilidades: Vulnerabilidad[], escala: EscalaDeClasificacion): string[][] {
  const filas: string[][] = [[lineaDeEscala(escala)], ENCABEZADO_EXPORTACION];
  let hayCeldasVacias = false;

  for (const grupo of agruparPorNivelDeRiesgo(vulnerabilidades, escala)) {
    filas.push([`NIVEL DE RIESGO: ${grupo.nivel.toUpperCase()} (${grupo.vulnerabilidades.length})`, ...Array(ENCABEZADO_EXPORTACION.length - 1).fill('')]);
    for (const vulnerabilidad of grupo.vulnerabilidades) {
      const fila = filaDeExportacion(vulnerabilidad, escala);
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
