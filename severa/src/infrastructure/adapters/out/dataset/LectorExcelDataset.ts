import fs from 'fs';
import * as XLSX from 'xlsx';
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
}

export interface ResultadoLecturaExcel {
  importables: FilaImportable[];
  rechazadas: FilaRechazada[];
}

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

export class LectorExcelDataset {
  // RF-97: verifica integridad estructural ANTES de aceptar el archivo.
  // XLSX.readFile lanza un error de parseo de bajo nivel (no un error de
  // dominio) si el archivo está corrupto o no es realmente un .xlsx/.xls; se
  // traduce a un error de dominio explícito en vez de dejarlo propagar.
  // Compartido por leerArchivo y detectarColumnas — ambos necesitan
  // exactamente la misma validación antes de leer filas u headers.
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

    // Si el mapeo indica una columna explícita para CVE/CVSS Score/Acceso
    // Remoto, se exige ESA columna; si no, el nombre por defecto de
    // siempre — mismo comportamiento que antes cuando mapeoColumnas es
    // undefined (compatibilidad total con datasets ya existentes).
    const columnaCve = mapeoColumnas?.cve ?? COLUMNA_POR_DEFECTO.cve;
    const columnaCvss = mapeoColumnas?.cvssScore ?? COLUMNA_POR_DEFECTO.cvssScore;
    const columnaAcceso = mapeoColumnas?.accesoRemoto ?? COLUMNA_POR_DEFECTO.accesoRemoto;

    const columnasPresentes = new Set(Object.keys(rows[0]));
    const columnasObligatorias = [
      { etiqueta: 'CVE', nombre: columnaCve },
      { etiqueta: 'CVSS Score', nombre: columnaCvss },
      { etiqueta: 'Acceso Remoto', nombre: columnaAcceso }
    ];
    const columnasFaltantes = columnasObligatorias.filter((columna) => !columnasPresentes.has(columna.nombre));
    if (columnasFaltantes.length > 0) {
      throw new EstructuraColumnasInvalidaError(
        `Faltan columnas obligatorias: ${columnasFaltantes.map((columna) => `${columna.etiqueta} ("${columna.nombre}")`).join(', ')}`
      );
    }

    const importables: FilaImportable[] = [];
    const rechazadas: FilaRechazada[] = [];

    rows.forEach((row, index) => {
      try {
        const cve = new IdentificadorCVE(String(row[columnaCve] ?? '').trim());
        const cvss = new CvssScore(Number(row[columnaCvss]));
        const tipoAcceso = new TipoAccesoValue(String(row[columnaAcceso] ?? '').trim());

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
          String(row.ID ?? `${index + 1}`),
          cve,
          cvss,
          software,
          tipoAcceso,
          Number.isFinite(diasParaParcheNumero) ? diasParaParcheNumero : undefined,
          software,
          tipoVulnerabilidad
        );

        importables.push({ vulnerabilidad, fuente: 'excel' });
      } catch (error) {
        rechazadas.push({
          fila: index + 2,
          error: error instanceof Error ? error.message : 'Error desconocido'
        });
      }
    });

    return { importables, rechazadas };
  }
}
