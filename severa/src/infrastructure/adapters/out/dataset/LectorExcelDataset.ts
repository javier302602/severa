import fs from 'fs';
import * as XLSX from 'xlsx';
import { parse } from 'csv-parse';
import { Vulnerabilidad } from '../../../../domain/entities/Vulnerabilidad';
import { CvssScore } from '../../../../domain/value-objects/CvssScore';
import { IdentificadorCVE } from '../../../../domain/value-objects/IdentificadorCVE';
import { TipoAccesoValue } from '../../../../domain/value-objects/TipoAcceso';
import { DatasetInvalidoError } from '../../../../domain/errors/DatasetInvalidoError';
import { EstructuraColumnasInvalidaError } from '../../../../domain/errors/EstructuraColumnasInvalidaError';

// RF-97: nombres de columna que SEVERA usa cuando no se manda un mapeo
// explícito (Mejora "mapeo flexible de columnas") — el mismo contrato que
// siempre tuvo el dataset de referencia del SDS, para no romper ninguna
// importación existente.
const COLUMNA_POR_DEFECTO = {
  cve: 'CVE',
  cvssScore: 'CVSS Score',
  accesoRemoto: 'Acceso Remoto'
} as const;

// Software/Tipo Vulnerabilidad/Días para Parche no tenían un único nombre
// "canónico" ni siquiera antes del mapeo: el código ya aceptaba varios alias
// a la vez (compatibilidad con datasets viejos). Se preservan tal cual
// cuando el usuario no mapea explícitamente ese campo.
const ALIAS_SOFTWARE = ['Software', 'software'];
const ALIAS_TIPO_VULNERABILIDAD = ['Tipo Vulnerabilidad', 'Tipo de Vulnerabilidad', 'tipo_vulnerabilidad'];
const ALIAS_DIAS_PARA_PARCHE = ['Dias para Parche', 'Días para Parche', 'dias_para_parche'];

// Alias para los 3 campos OBLIGATORIOS (2026-07-18): antes solo se aceptaba
// el nombre exacto de COLUMNA_POR_DEFECTO o un mapeo manual explícito — un
// dataset público real (NVD/CISA/EPSS enriquecido de Kaggle) nunca trae
// "CVE"/"CVSS Score"/"Acceso Remoto" literalmente. Mismo mecanismo que ya
// usan Software/Tipo Vulnerabilidad/Días para Parche arriba, aplicado
// también a los obligatorios — si ninguno de estos alias ni un mapeo manual
// coincide, recién ahí se exige el selector de mapeo manual (sin cambios:
// EstructuraColumnasInvalidaError).
const ALIAS_CVE = ['CVE', 'cve_id', 'cve'];
const ALIAS_CVSS_SCORE = ['CVSS Score', 'base_score', 'cvss_score'];
// attack_vector: ver TipoAccesoValue.ts — sus VALORES (NETWORK/LOCAL/...)
// también se mapean ahí, no solo el nombre de columna.
const ALIAS_ACCESO_REMOTO = ['Acceso Remoto', 'attack_vector', 'acceso_remoto'];

function primeraColumnaPresente(columnasPresentes: Set<string>, alias: string[]): string | undefined {
  return alias.find((nombre) => columnasPresentes.has(nombre));
}

// Mapeo opcional columna-del-archivo -> campo de SEVERA. Deliberadamente NO
// incluye "severidad": PostgresVulnerabilidadRepository.calcularSeveridad()
// siempre la deriva del CVSS Score al guardar (vía ClasificadorDeRiesgo) y
// nunca lee un valor importado — ofrecer un mapeo para un campo sin ningún
// efecto real sería engañoso (decisión confirmada con el usuario).
export interface MapeoColumnas {
  cve?: string;
  cvssScore?: string;
  software?: string;
  tipoVulnerabilidad?: string;
  accesoRemoto?: string;
  diasParaParche?: string;
}

export interface FilaImportable {
  vulnerabilidad: Vulnerabilidad;
  fuente: string;
}

export interface FilaRechazada {
  fila: number;
  error: string;
  // Fila cruda tal como llegó (mismas columnas del archivo original) — se
  // usa para armar el Excel descargable de filas descartadas (ver
  // construirExcelDeRechazadas). No se guarda en ningún lado más que en
  // memoria durante la importación misma.
  datos: Record<string, unknown>;
}

export interface ResultadoLecturaExcel {
  importables: FilaImportable[];
  rechazadas: FilaRechazada[];
}

// Resultado de clasificar UNA fila — usado tanto por leerArchivo (arma un
// array completo) como por leerArchivoCsvEnStreaming (entrega una por una a
// medida que el parser las produce, sin acumularlas).
export type FilaProcesada = { tipo: 'importable'; dato: FilaImportable } | { tipo: 'rechazada'; dato: FilaRechazada };

// Primera columna de la lista que EXISTE como key en la fila (aunque su
// valor sea '' — sheet_to_json con defval:'' rellena huecos de columnas que
// existen en algún lado de la hoja, así que "no existe" y "está vacía" son
// estados distintos). Mismo criterio que ya usaba el encadenado manual de
// `??` antes de esta refactorización.
function primerValorPresente(row: Record<string, unknown>, columnas: string[]): unknown {
  for (const columna of columnas) {
    if (row[columna] !== undefined) return row[columna];
  }
  return undefined;
}

interface ColumnasResueltas {
  cve: string;
  cvss: string;
  acceso: string;
}

function resolverColumnas(columnasPresentes: Set<string>, mapeoColumnas?: MapeoColumnas): ColumnasResueltas {
  return {
    cve: mapeoColumnas?.cve ?? primeraColumnaPresente(columnasPresentes, ALIAS_CVE) ?? COLUMNA_POR_DEFECTO.cve,
    cvss:
      mapeoColumnas?.cvssScore ?? primeraColumnaPresente(columnasPresentes, ALIAS_CVSS_SCORE) ?? COLUMNA_POR_DEFECTO.cvssScore,
    acceso:
      mapeoColumnas?.accesoRemoto ??
      primeraColumnaPresente(columnasPresentes, ALIAS_ACCESO_REMOTO) ??
      COLUMNA_POR_DEFECTO.accesoRemoto
  };
}

function validarColumnasObligatorias(columnasPresentes: Set<string>, columnas: ColumnasResueltas): void {
  const columnasObligatorias = [
    { etiqueta: 'CVE', nombre: columnas.cve },
    { etiqueta: 'CVSS Score', nombre: columnas.cvss },
    { etiqueta: 'Acceso Remoto', nombre: columnas.acceso }
  ];
  const columnasFaltantes = columnasObligatorias.filter((columna) => !columnasPresentes.has(columna.nombre));
  if (columnasFaltantes.length > 0) {
    throw new EstructuraColumnasInvalidaError(
      `Faltan columnas obligatorias: ${columnasFaltantes.map((columna) => `${columna.etiqueta} ("${columna.nombre}")`).join(', ')}`
    );
  }
}

// Clasifica UNA fila cruda (ya sea de SheetJS o de csv-parse, ambas llegan
// como Record<string, unknown> con el nombre de columna como key) — mismo
// código exacto sin importar el origen, para que .xlsx/.xls (leerArchivo,
// en memoria) y .csv (leerArchivoCsvEnStreaming) validen y construyan la
// Vulnerabilidad de forma idéntica.
function clasificarFila(
  row: Record<string, unknown>,
  indice: number,
  columnas: ColumnasResueltas,
  mapeoColumnas?: MapeoColumnas
): FilaProcesada {
  try {
    const cve = new IdentificadorCVE(String(row[columnas.cve] ?? '').trim());
    const cvss = new CvssScore(Number(row[columnas.cvss]));
    const tipoAcceso = new TipoAccesoValue(String(row[columnas.acceso] ?? '').trim());

    const diasParaParcheRaw = mapeoColumnas?.diasParaParche
      ? row[mapeoColumnas.diasParaParche]
      : primerValorPresente(row, ALIAS_DIAS_PARA_PARCHE);
    const diasParaParche = String(diasParaParcheRaw ?? '').trim();
    const diasParaParcheNumero = diasParaParche === '' ? undefined : Number(diasParaParche);

    const software = String(
      (mapeoColumnas?.software ? row[mapeoColumnas.software] : primerValorPresente(row, ALIAS_SOFTWARE)) ?? ''
    ).trim();

    const tipoVulnerabilidad = String(
      (mapeoColumnas?.tipoVulnerabilidad
        ? row[mapeoColumnas.tipoVulnerabilidad]
        : primerValorPresente(row, ALIAS_TIPO_VULNERABILIDAD)) ?? 'N/A'
    ).trim();

    const vulnerabilidad = new Vulnerabilidad(
      String(row.ID ?? `${indice + 1}`),
      cve,
      cvss,
      software,
      tipoAcceso,
      Number.isFinite(diasParaParcheNumero) ? diasParaParcheNumero : undefined,
      software,
      tipoVulnerabilidad
    );

    return { tipo: 'importable', dato: { vulnerabilidad, fuente: 'excel' } };
  } catch (error) {
    return {
      tipo: 'rechazada',
      dato: {
        fila: indice + 2,
        error: error instanceof Error ? error.message : 'Error desconocido',
        datos: row
      }
    };
  }
}

// Cuántas filas descartadas (con sus datos completos, no solo el mensaje de
// error) se conservan para poder armar el Excel de descartados — un CSV de
// cientos de miles de filas mal formado podría rechazarlas TODAS, y guardar
// la fila cruda de cada una igual reintroduciría un problema de memoria sin
// límite (el mismo motivo por el que ImportarDatasetDesdeUrl ya limitaba los
// mensajes de error de muestra). `rechazados` (el conteo) siempre refleja el
// total real; el Excel resultante es una MUESTRA representativa, no
// necesariamente completa, para datasets con muchísimos rechazos.
export const MAX_FILAS_RECHAZADAS_PARA_EXCEL = 1000;

// Excel descargable de filas descartadas (2026-07-18) — mismas columnas que
// tenía el archivo original, más "Fila" (número de fila real en el archivo)
// y "Motivo del rechazo". Reutilizado tanto por ImportarDataset (subida de
// archivo) como por ImportarDatasetDesdeUrl (link) — una sola implementación.
export function construirExcelDeRechazadas(rechazadas: FilaRechazada[]): Buffer {
  const filas = rechazadas
    .slice(0, MAX_FILAS_RECHAZADAS_PARA_EXCEL)
    .map(({ fila, error, datos }) => ({ Fila: fila, ...datos, 'Motivo del rechazo': error }));
  const hoja = XLSX.utils.json_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Filas descartadas');
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export class LectorExcelDataset {
  // RF-97: verifica integridad estructural ANTES de aceptar el archivo.
  // XLSX.readFile lanza un error de parseo de bajo nivel (no un error de
  // dominio) si el archivo está corrupto o no es realmente un .xlsx/.xls; se
  // traduce a un error de dominio explícito en vez de dejarlo propagar.
  // Compartido por leerArchivo y detectarColumnas — ambos necesitan
  // exactamente la misma validación antes de leer filas u headers.
  //
  // Deliberadamente sigue usando XLSX.readFile (todo el archivo en memoria):
  // SheetJS no tiene un lector de streaming real para el formato binario
  // .xlsx (es un .zip con XML adentro) — solo Excel/.xls entran por acá.
  // Un .xlsx de cientos de MB seguiría cargando completo en memoria; el CSV
  // (leerArchivoCsvEnStreaming) es el único formato con streaming real de
  // punta a punta hoy. Ver informe: si hace falta soportar .xlsx grandes de
  // verdad, la migración natural es a exceljs (ExcelJS.stream.xlsx.WorkbookReader).
  private leerFilas(filePath: string): Array<Record<string, unknown>> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`No existe el archivo de Excel: ${filePath}`);
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.readFile(filePath);
    } catch (error) {
      throw new DatasetInvalidoError(
        `El archivo está corrupto o no es un Excel válido: ${error instanceof Error ? error.message : 'error desconocido'}`
      );
    }

    const primeraHoja = workbook.SheetNames[0];
    if (!primeraHoja) {
      throw new DatasetInvalidoError('El archivo Excel no contiene ninguna hoja');
    }

    const sheet = workbook.Sheets[primeraHoja];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Array<Record<string, unknown>>;

    if (rows.length === 0) {
      throw new DatasetInvalidoError('El archivo Excel no contiene filas de datos');
    }

    return rows;
  }

  // Mejora "mapeo flexible de columnas": el frontend llama a esto apenas el
  // usuario elige el archivo, ANTES de importar nada, para mostrarle el
  // selector de mapeo con los nombres de columna reales de su archivo.
  async detectarColumnas(filePath: string): Promise<string[]> {
    const rows = this.leerFilas(filePath);
    return Object.keys(rows[0]);
  }

  async leerArchivo(filePath: string, mapeoColumnas?: MapeoColumnas): Promise<ResultadoLecturaExcel> {
    const rows = this.leerFilas(filePath);
    const columnasPresentes = new Set(Object.keys(rows[0]));
    const columnas = resolverColumnas(columnasPresentes, mapeoColumnas);

    validarColumnasObligatorias(columnasPresentes, columnas);

    const importables: FilaImportable[] = [];
    const rechazadas: FilaRechazada[] = [];

    rows.forEach((row, index) => {
      const fila = clasificarFila(row, index, columnas, mapeoColumnas);
      if (fila.tipo === 'importable') {
        importables.push(fila.dato);
      } else {
        rechazadas.push(fila.dato);
      }
    });

    return { importables, rechazadas };
  }

  // Streaming real de punta a punta para CSV (2026-07-17, datasets públicos
  // de cientos de MB / cientos de miles de filas — ver "importar desde
  // link"): lee el archivo con un stream de disco + csv-parse en modo
  // streaming, y entrega cada fila ya clasificada a `onFila` A MEDIDA QUE SE
  // LEE, sin acumular un array con todas las filas en memoria. El llamador
  // (ImportarDatasetDesdeUrl) es quien decide qué hacer con cada una —
  // típicamente acumularlas en lotes chicos e insertarlas (ver
  // VulnerabilidadRepository.guardarLote).
  async leerArchivoCsvEnStreaming(
    filePath: string,
    mapeoColumnas: MapeoColumnas | undefined,
    onFila: (fila: FilaProcesada) => Promise<void>
  ): Promise<void> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`No existe el archivo CSV: ${filePath}`);
    }

    const parser = fs.createReadStream(filePath).pipe(parse({ columns: true, skip_empty_lines: true, trim: true, bom: true }));

    let indice = 0;
    let columnas: ColumnasResueltas | undefined;

    try {
      for await (const row of parser as AsyncIterable<Record<string, unknown>>) {
        if (!columnas) {
          const columnasPresentes = new Set(Object.keys(row));
          columnas = resolverColumnas(columnasPresentes, mapeoColumnas);
          validarColumnasObligatorias(columnasPresentes, columnas);
        }

        await onFila(clasificarFila(row, indice, columnas, mapeoColumnas));
        indice++;
      }
    } catch (error) {
      if (error instanceof EstructuraColumnasInvalidaError || error instanceof DatasetInvalidoError) {
        throw error;
      }
      throw new DatasetInvalidoError(
        `El archivo está corrupto o no es un CSV válido: ${error instanceof Error ? error.message : 'error desconocido'}`
      );
    }

    if (indice === 0) {
      throw new DatasetInvalidoError('El archivo CSV no contiene filas de datos');
    }
  }
}
