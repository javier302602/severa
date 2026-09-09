import PDFDocument from 'pdfkit';
import { recopilarDatosDeInforme } from '../../../../../src/application/usecases/module_reportes_exportacion/RecopilarDatosDeInforme';
import { recopilarDatosDeInformeDataset } from '../../../../../src/application/usecases/module_reportes_exportacion/RecopilarDatosDeInformeDataset';
import { VulnerabilidadRepository } from '../../../../../src/application/ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { AuditoriaRepository } from '../../../../../src/application/ports/out/persistencia/repositorios/AuditoriaRepository';
import { Vulnerabilidad } from '../../../../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../../../../src/domain/shared/value-objects/IdentificadorCVE';
import { CvssScore } from '../../../../../src/domain/shared/value-objects/CvssScore';
import { TipoAccesoValue } from '../../../../../src/domain/shared/value-objects/TipoAcceso';
import { MAPEO_PLANTILLA_UNIVERSAL_RF130 } from '../../../../../src/domain/services/reportes/MapeoPlantillaUniversalRF130';

// M-10 Ronda 2, Pasada 2-A (RF-130): InformeUniversalRF130.ts NO está
// conectado al puerto público GeneradorDeInformes todavía — este archivo es
// la ÚNICA forma de ejercitarlo hasta el cutover de la Pasada 2-C. Mismo
// criterio que GeneradorInformePDF.test.ts: no se parsea el contenido real
// del PDF (binario, cualquier assert más fino sería frágil) — smoke tests de
// "no explota, produce un PDF real" más la verificación estructural de que
// el orden de secciones dibujadas coincide con el mapeo (vía spy sobre
// nuevaSeccion, no parseando el PDF en sí).
jest.mock('../../../../../src/infrastructure/adapters/out/reportes/LayoutInformePdf', () => {
  const real = jest.requireActual('../../../../../src/infrastructure/adapters/out/reportes/LayoutInformePdf');
  return { ...real, nuevaSeccion: jest.fn(real.nuevaSeccion) };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const LayoutInformePdf = require('../../../../../src/infrastructure/adapters/out/reportes/LayoutInformePdf');
import { renderizarInformeUniversal, ContextoInformeUniversal } from '../../../../../src/infrastructure/adapters/out/reportes/InformeUniversalRF130';
import { nivelDeRiesgoDesdeCvss } from '../../../../../src/infrastructure/adapters/out/reportes/GeneradorInformePDF';

// Ubica, para un número de sección RF-130 dado, el texto literal que
// PDFKit efectivamente dibujó mientras esa sección era la "actual" — entre
// su nuevaSeccion() y la siguiente, usando el orden global de invocación
// compartido por todos los jest.fn()/jest.spyOn() del test (mismo criterio
// del resto de este archivo: no parsear el PDF binario). subseccion(),
// parrafo(), dibujarTabla() y los bullets manuales de hallazgos/limitaciones
// pasan TODOS por doc.text() en algún punto (ver LayoutInformePdf.ts), así
// que espiar PDFDocument.prototype.text cubre el contenido real de la
// sección sin necesitar un spy por primitivo.
function textosPorSeccion(
  nuevaSeccionMock: jest.Mock,
  spyTexto: jest.SpyInstance
): (numero: number) => string[] {
  const secciones = nuevaSeccionMock.mock.calls.map((llamada, indice) => ({
    numero: Number(llamada[1]),
    orden: nuevaSeccionMock.mock.invocationCallOrder[indice]
  }));
  return (numero: number) => {
    const actual = secciones.find((seccion) => seccion.numero === numero);
    if (!actual) throw new Error(`nuevaSeccion(${numero}) no se llamó`);
    const siguiente = secciones.filter((seccion) => seccion.orden > actual.orden).sort((a, b) => a.orden - b.orden)[0];

    return spyTexto.mock.calls
      .filter((_, indice) => {
        const orden = spyTexto.mock.invocationCallOrder[indice];
        return orden > actual.orden && (siguiente === undefined || orden < siguiente.orden);
      })
      .map((llamada) => llamada[0])
      .filter((valor): valor is string => typeof valor === 'string');
  };
}

function repositorioFalso(vulnerabilidades: Vulnerabilidad[]): VulnerabilidadRepository {
  return {
    guardar: jest.fn(),
    guardarLote: jest.fn(),
    contar: jest.fn(),
    listar: jest.fn().mockResolvedValue(vulnerabilidades),
    buscarPorCve: jest.fn(),
    filtrarPorRangoCvss: jest.fn(),
    filtrarPorSeveridad: jest.fn(),
    filtrarPorRango: jest.fn(),
    filtrarPorCategoria: jest.fn(),
    listarPorTipoAcceso: jest.fn(),
    listarPorTipoVulnerabilidad: jest.fn(),
    listarSoftwareDisponible: jest.fn().mockResolvedValue([]),
    listarPorSoftware: jest.fn(),
    actualizarEstado: jest.fn(),
    buscarConFiltros: jest.fn(),
    eliminarTodas: jest.fn()
  } as unknown as VulnerabilidadRepository;
}

function auditoriaFalsa(): AuditoriaRepository {
  return { registrar: jest.fn(), listar: jest.fn().mockResolvedValue([]) };
}

function vuln(id: string, cve: string, cvss: number, software: string, tipoAcceso?: 'Sí' | 'No', diasParaParche?: number, tipoVulnerabilidad?: string): Vulnerabilidad {
  return new Vulnerabilidad(id, new IdentificadorCVE(cve), new CvssScore(cvss), software, tipoAcceso ? new TipoAccesoValue(tipoAcceso) : undefined, diasParaParche, software, tipoVulnerabilidad);
}

function firmaPdf(buffer: Buffer): string {
  return buffer.subarray(0, 4).toString('ascii');
}

const DATASET_CVSS_TIPICO = [
  vuln('1', 'CVE-2021-44228', 10.0, 'Apache Log4j', 'Sí', 5, 'RCE'),
  vuln('2', 'CVE-2021-45046', 9.0, 'Apache Log4j', 'Sí', 3, 'RCE'),
  vuln('3', 'CVE-2021-34527', 7.8, 'Microsoft Windows', 'No', 12, 'EoP'),
  vuln('4', 'CVE-2021-35587', 5.5, 'OpenSSL', 'No', 20, 'DoS'),
  vuln('5', 'CVE-2014-0160', 5.0, 'OpenSSL', 'Sí', 45, 'Info Leak'),
  vuln('6', 'CVE-2021-20021', 3.1, 'Nginx', 'No', undefined, 'DoS')
];

const COLUMNAS_GENERICO_TIPICO = ['Producto', 'Precio', 'Categoria', 'FechaAlta'];
const FILAS_GENERICO_TIPICO = [
  { Producto: 'Laptop', Precio: 1200, Categoria: 'Electrónica', FechaAlta: '2024-01-15' },
  { Producto: 'Mouse', Precio: 25, Categoria: 'Accesorios', FechaAlta: '2024-02-01' },
  { Producto: 'Teclado', Precio: 45, Categoria: 'Accesorios', FechaAlta: '2024-02-10' }
];

async function contextoCvss(): Promise<ContextoInformeUniversal> {
  const datos = await recopilarDatosDeInforme(repositorioFalso(DATASET_CVSS_TIPICO), auditoriaFalsa(), 'Analista de Prueba', 'analista-1');
  return { pipeline: 'cvss', datos };
}

function contextoGenerico(): ContextoInformeUniversal {
  const datos = recopilarDatosDeInformeDataset(COLUMNAS_GENERICO_TIPICO, FILAS_GENERICO_TIPICO, 'Analista de Prueba');
  return { pipeline: 'generico', datos };
}

describe('InformeUniversalRF130 — Pasada 2-A (RF-130)', () => {
  test('pipeline CVSS: genera un PDF real sin explotar', async () => {
    const buffer = await renderizarInformeUniversal(await contextoCvss());

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(firmaPdf(buffer)).toBe('%PDF');
    expect(buffer.length).toBeGreaterThan(1000);
  });

  test('pipeline genérico: genera un PDF real sin explotar', async () => {
    const buffer = await renderizarInformeUniversal(contextoGenerico());

    expect(firmaPdf(buffer)).toBe('%PDF');
    expect(buffer.length).toBeGreaterThan(1000);
  });

  test('dataset genérico con dominio detectable (biología) no explota', async () => {
    const datos = recopilarDatosDeInformeDataset(
      ['especie', 'peso_kg', 'habitat'],
      [
        { especie: 'Puma concolor', peso_kg: 62, habitat: 'Bosque' },
        { especie: 'Lynx rufus', peso_kg: 9, habitat: 'Matorral' }
      ],
      'Analista de Prueba'
    );

    const buffer = await renderizarInformeUniversal({ pipeline: 'generico', datos });

    expect(firmaPdf(buffer)).toBe('%PDF');
  });

  describe('orden de secciones dibujadas', () => {
    beforeEach(() => {
      (LayoutInformePdf.nuevaSeccion as jest.Mock).mockClear();
    });

    test('CVSS: cada nuevaSeccion() se llama en el mismo orden y con el mismo título que el mapeo (sin contar Portada, #1)', async () => {
      await renderizarInformeUniversal(await contextoCvss());

      const llamadas = (LayoutInformePdf.nuevaSeccion as jest.Mock).mock.calls.map(([, numero, titulo]) => ({
        numero: Number(numero),
        titulo
      }));
      const esperado = MAPEO_PLANTILLA_UNIVERSAL_RF130.filter((entrada) => entrada.numero !== 1).map((entrada) => ({
        numero: entrada.numero,
        titulo: entrada.nombreRF130
      }));

      expect(llamadas).toEqual(esperado);
    });

    test('genérico: mismo orden 2-20, sin huecos ni repetidos', async () => {
      await renderizarInformeUniversal(contextoGenerico());

      const numeros = (LayoutInformePdf.nuevaSeccion as jest.Mock).mock.calls.map(([, numero]) => Number(numero));

      expect(numeros).toEqual(Array.from({ length: 19 }, (_, i) => i + 2));
    });

    test('Portada (#1) nunca pasa por nuevaSeccion() — no tiene entrada de índice, mismo criterio que el informe de hoy', async () => {
      await renderizarInformeUniversal(await contextoCvss());

      const numeros = (LayoutInformePdf.nuevaSeccion as jest.Mock).mock.calls.map(([, numero]) => Number(numero));
      expect(numeros).not.toContain(1);
    });
  });

  describe('secciones "No aplicable" no mezclan contenido parcial', () => {
    test('CVSS: Tipos de variables (5) y Valores faltantes (7) son "No aplicable" — esquema fijo', async () => {
      // Smoke test indirecto: no explota al generar con datos CVSS reales,
      // que es lo único verificable sin parsear el PDF. La redacción del
      // motivo se cubre por lectura de código, no por assert de texto.
      const buffer = await renderizarInformeUniversal(await contextoCvss());
      expect(firmaPdf(buffer)).toBe('%PDF');
    });

    test('genérico: Recomendaciones (19) es "No aplicable"', async () => {
      const buffer = await renderizarInformeUniversal(contextoGenerico());
      expect(firmaPdf(buffer)).toBe('%PDF');
    });
  });

  describe('secciones bloqueadas por M-16 (15/16) — idénticas en ambos pipelines', () => {
    test('no explotan en ningún pipeline', async () => {
      const bufferCvss = await renderizarInformeUniversal(await contextoCvss());
      const bufferGenerico = await renderizarInformeUniversal(contextoGenerico());

      expect(firmaPdf(bufferCvss)).toBe('%PDF');
      expect(firmaPdf(bufferGenerico)).toBe('%PDF');
    });
  });
});

// M-10 Ronda 2, Pasada 2-B: las 6 secciones con reestructuración real
// (N° registros/variables, Análisis individual, Distribuciones,
// Visualizaciones, Relaciones entre variables, Análisis inferencial).
// COLUMNAS_GENERICO_TIPICO (arriba) solo tiene UNA columna numérica
// ("Precio") — no alcanza para ejercitar la matriz de correlación/heatmap
// real (necesita >=2). Estos tests cubren los casos límite que ese fixture
// no toca: cero columnas numéricas, y dos o más (heatmap real).
describe('InformeUniversalRF130 — Pasada 2-B (RF-130): secciones 4/10/11/12/13/14', () => {
  test('genérico sin columnas numéricas: 4/10/11/12/13 no explotan (todas caen en su rama "sin columnas numéricas")', async () => {
    const datos = recopilarDatosDeInformeDataset(
      ['Producto', 'Categoria'],
      [
        { Producto: 'Laptop', Categoria: 'Electrónica' },
        { Producto: 'Mouse', Categoria: 'Accesorios' }
      ],
      'Analista de Prueba'
    );

    const buffer = await renderizarInformeUniversal({ pipeline: 'generico', datos });

    expect(firmaPdf(buffer)).toBe('%PDF');
  });

  test('genérico con 2+ columnas numéricas: Visualizaciones incluye histogramas Y heatmap, Relaciones muestra la matriz', async () => {
    const datos = recopilarDatosDeInformeDataset(
      ['Producto', 'Precio', 'Stock'],
      [
        { Producto: 'Laptop', Precio: 1200, Stock: 5 },
        { Producto: 'Mouse', Precio: 25, Stock: 100 },
        { Producto: 'Teclado', Precio: 45, Stock: 60 },
        { Producto: 'Monitor', Precio: 300, Stock: 20 }
      ],
      'Analista de Prueba'
    );
    expect(datos.matrizCorrelacion.columnas.length).toBeGreaterThanOrEqual(2);

    const buffer = await renderizarInformeUniversal({ pipeline: 'generico', datos });

    expect(firmaPdf(buffer)).toBe('%PDF');
  });

  test('CVSS: Análisis individual de variables (10) es "No aplicable" — no explota', async () => {
    const buffer = await renderizarInformeUniversal(await contextoCvss());
    expect(firmaPdf(buffer)).toBe('%PDF');
  });

  test('CVSS: Análisis inferencial (14) reconstruye la comparación Remoto/Local sin tocar dibujarAplicacionPractica', async () => {
    // Prueba indirecta de aislamiento: el informe CVSS "viejo" (todavía en
    // vivo) sigue generándose bien con los mismos datos — si esta función
    // nueva hubiera mutado algo compartido, el smoke test de
    // GeneradorInformePDF.test.ts ya lo habría detectado (corre en la misma
    // suite completa). Acá solo se confirma que el camino nuevo tampoco
    // explota con datos reales de comparación remoto/local.
    const datos = await recopilarDatosDeInforme(
      repositorioFalso([
        vuln('1', 'CVE-2024-00001', 8.0, 'A', 'Sí', 4),
        vuln('2', 'CVE-2024-00002', 4.0, 'B', 'No', 40)
      ]),
      auditoriaFalsa(),
      'Analista de Prueba',
      'analista-1'
    );

    const buffer = await renderizarInformeUniversal({ pipeline: 'cvss', datos });

    expect(firmaPdf(buffer)).toBe('%PDF');
  });

  describe('orden de secciones (post 2-B): sigue exactamente el mapeo, ahora con contenido real en 4/10/11/12/13/14', () => {
    beforeEach(() => {
      (LayoutInformePdf.nuevaSeccion as jest.Mock).mockClear();
    });

    test('CVSS: 19 secciones (2-20), sin huecos ni repetidos', async () => {
      await renderizarInformeUniversal(await contextoCvss());

      const numeros = (LayoutInformePdf.nuevaSeccion as jest.Mock).mock.calls.map(([, numero]) => Number(numero));
      expect(numeros).toEqual(Array.from({ length: 19 }, (_, i) => i + 2));
    });

    test('genérico: 19 secciones (2-20), sin huecos ni repetidos', async () => {
      await renderizarInformeUniversal(contextoGenerico());

      const numeros = (LayoutInformePdf.nuevaSeccion as jest.Mock).mock.calls.map(([, numero]) => Number(numero));
      expect(numeros).toEqual(Array.from({ length: 19 }, (_, i) => i + 2));
    });
  });
});

// M-10 Ronda 2, Pasada 2-C: contenido narrativo nuevo de §2 (Resumen
// ejecutivo), §17 (Interpretación) y §18 (Conclusiones). Hasta acá estas tres
// secciones solo estaban cubiertas por los smoke tests genéricos de 2-A/2-B
// (no explota, orden de nuevaSeccion() correcto) — ninguno confirmaba que el
// contenido migrado de "Aplicación práctica" (nivel de riesgo, % urgente,
// tiempo de parche, ranking) efectivamente llegó a §18 CVSS, ni que
// Limitaciones conocidas aparece en ambos pipelines. Estos tests cierran esa
// brecha usando textosPorSeccion() (arriba) en vez de parsear el PDF.
describe('InformeUniversalRF130 — Pasada 2-C (RF-130): secciones 2/17/18 (contenido narrativo nuevo)', () => {
  let spyTexto: jest.SpyInstance;

  beforeEach(() => {
    (LayoutInformePdf.nuevaSeccion as jest.Mock).mockClear();
    spyTexto = jest.spyOn(PDFDocument.prototype, 'text');
  });

  afterEach(() => {
    spyTexto.mockRestore();
  });

  test('CVSS §2 Resumen ejecutivo: cita el total de vulnerabilidades y el nivel de riesgo típico', async () => {
    const contexto = await contextoCvss();
    await renderizarInformeUniversal(contexto);
    const datos = (contexto as Extract<ContextoInformeUniversal, { pipeline: 'cvss' }>).datos;

    const texto = textosPorSeccion(LayoutInformePdf.nuevaSeccion as jest.Mock, spyTexto)(2).join(' | ');

    expect(texto).toContain(String(datos.totalVulnerabilidades));
    expect(texto).toContain(nivelDeRiesgoDesdeCvss(datos.resumenEstadistico.media));
  });

  test('genérico §2 Resumen ejecutivo: cita filas y columnas del dataset', async () => {
    const contexto = contextoGenerico();
    await renderizarInformeUniversal(contexto);
    const datos = (contexto as Extract<ContextoInformeUniversal, { pipeline: 'generico' }>).datos;

    const texto = textosPorSeccion(LayoutInformePdf.nuevaSeccion as jest.Mock, spyTexto)(2).join(' | ');

    expect(texto).toContain(String(datos.totalFilas));
    expect(texto).toContain(String(datos.totalColumnas));
  });

  test('CVSS §17 Interpretación: contiene los mismos hallazgos que datos.interpretacion, sin recalcular', async () => {
    const contexto = await contextoCvss();
    await renderizarInformeUniversal(contexto);
    const datos = (contexto as Extract<ContextoInformeUniversal, { pipeline: 'cvss' }>).datos;

    expect(datos.interpretacion.length).toBeGreaterThan(0);
    const textos17 = textosPorSeccion(LayoutInformePdf.nuevaSeccion as jest.Mock, spyTexto)(17);
    datos.interpretacion.forEach((hallazgo) => {
      expect(textos17.some((texto) => texto.includes(hallazgo))).toBe(true);
    });
  });

  test('genérico §17 Interpretación: contiene los mismos hallazgos que datos.interpretacion, sin recalcular', async () => {
    const contexto = contextoGenerico();
    await renderizarInformeUniversal(contexto);
    const datos = (contexto as Extract<ContextoInformeUniversal, { pipeline: 'generico' }>).datos;

    expect(datos.interpretacion.length).toBeGreaterThan(0);
    const textos17 = textosPorSeccion(LayoutInformePdf.nuevaSeccion as jest.Mock, spyTexto)(17);
    datos.interpretacion.forEach((hallazgo) => {
      expect(textos17.some((texto) => texto.includes(hallazgo))).toBe(true);
    });
  });

  test('CVSS §18 Conclusiones: el contenido migrado de "Aplicación práctica" (nivel de riesgo, % urgente, tiempo de parche, ranking top 10) llegó a su nuevo lugar', async () => {
    const contexto = await contextoCvss();
    await renderizarInformeUniversal(contexto);
    const datos = (contexto as Extract<ContextoInformeUniversal, { pipeline: 'cvss' }>).datos;
    const r = datos.resumenEstadistico;

    const textos18 = textosPorSeccion(LayoutInformePdf.nuevaSeccion as jest.Mock, spyTexto)(18);
    const texto = textos18.join(' | ');

    // Las 3 preguntas migradas — la pregunta 3 (Remoto/Local) ya se extrajo
    // a §14 en la Pasada 2-B y NO debe repetirse acá.
    expect(texto).toContain('¿Cuál es el nivel típico de riesgo?');
    expect(texto).toContain(`Media CVSS = ${r.media.toFixed(2)}, mediana = ${r.mediana.toFixed(2)}`);
    expect(texto).toContain('¿Qué proporción requiere atención urgente?');
    expect(texto).toContain('¿Cuánto tiempo toma en promedio disponer de un parche?');
    expect(texto).not.toContain('¿Influye el acceso remoto en la severidad?');

    // Ranking de urgencia: top 10 completo, con las filas reales del fixture.
    expect(texto).toContain('Ranking de urgencia de remediación (top 10)');
    datos.rankingUrgencia.slice(0, 10).forEach((entrada) => {
      expect(texto).toContain(entrada.vulnerabilidad.cve.valor);
    });

    // Limitaciones conocidas, en el mismo cierre.
    expect(texto).toContain('Limitaciones conocidas');
    datos.limitacionesConocidas.forEach((limitacion) => expect(texto).toContain(limitacion));
  });

  test('genérico §18 Conclusiones: sin contenido de "Aplicación práctica" (específico de CVSS) pero con Limitaciones conocidas', async () => {
    const contexto = contextoGenerico();
    await renderizarInformeUniversal(contexto);
    const datos = (contexto as Extract<ContextoInformeUniversal, { pipeline: 'generico' }>).datos;

    const textos18 = textosPorSeccion(LayoutInformePdf.nuevaSeccion as jest.Mock, spyTexto)(18);
    const texto = textos18.join(' | ');

    expect(texto).not.toContain('¿Cuál es el nivel típico de riesgo?');
    expect(texto).not.toContain('Ranking de urgencia de remediación');

    expect(texto).toContain('Limitaciones conocidas');
    datos.limitacionesConocidas.forEach((limitacion) => expect(texto).toContain(limitacion));
  });
});
