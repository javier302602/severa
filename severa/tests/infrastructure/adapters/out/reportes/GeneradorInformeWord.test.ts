import JSZip from 'jszip';
import { HeadingLevel } from 'docx';
import { GeneradorInformeWord } from '../../../../../src/infrastructure/adapters/out/reportes/GeneradorInformeWord';
import { recopilarDatosDeInforme } from '../../../../../src/application/usecases/module_reportes_exportacion/RecopilarDatosDeInforme';
import { recopilarDatosDeInformeDataset } from '../../../../../src/application/usecases/module_reportes_exportacion/RecopilarDatosDeInformeDataset';
import { interpretarOutliers } from '../../../../../src/domain/services/InterpretadorDeResultadosGenerico';
import { VulnerabilidadRepository } from '../../../../../src/application/ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { AuditoriaRepository } from '../../../../../src/application/ports/out/persistencia/repositorios/AuditoriaRepository';
import { Vulnerabilidad } from '../../../../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../../../../src/domain/shared/value-objects/IdentificadorCVE';
import { CvssScore } from '../../../../../src/domain/shared/value-objects/CvssScore';
import { TipoAccesoValue } from '../../../../../src/domain/shared/value-objects/TipoAcceso';
import { MAPEO_PLANTILLA_UNIVERSAL_RF130 } from '../../../../../src/domain/services/reportes/MapeoPlantillaUniversalRF130';
import { formatearEstadistico } from '../../../../../src/domain/services/inferential-statistics/ComparadorDeCategorias';

// M-10 Ronda 2, Pasada 2-D (RF-130), Paso 1: heading() se espía igual que
// nuevaSeccion() del lado PDF (ver InformeUniversalRF130.test.ts) — jest.mock
// envuelve la implementación real (el .docx generado no cambia, el spy solo
// observa), así se puede verificar orden/número de secciones sin parsear
// word/document.xml a mano para eso.
jest.mock('../../../../../src/infrastructure/adapters/out/reportes/LayoutInformeWord', () => {
  const real = jest.requireActual('../../../../../src/infrastructure/adapters/out/reportes/LayoutInformeWord');
  return { ...real, heading: jest.fn(real.heading) };
});
// eslint-disable-next-line @typescript-eslint/no-var-requires
const LayoutInformeWord = require('../../../../../src/infrastructure/adapters/out/reportes/LayoutInformeWord');

function vuln(id: string, cve: string, cvss: number, software: string, tipoAcceso?: 'Sí' | 'No', diasParaParche?: number, tipoVulnerabilidad?: string): Vulnerabilidad {
  return new Vulnerabilidad(id, new IdentificadorCVE(cve), new CvssScore(cvss), software, tipoAcceso ? new TipoAccesoValue(tipoAcceso) : undefined, diasParaParche, software, tipoVulnerabilidad);
}

const DATASET_CVSS_TIPICO = [
  vuln('1', 'CVE-2021-44228', 10.0, 'Apache Log4j', 'Sí', 5, 'RCE'),
  vuln('2', 'CVE-2021-45046', 9.0, 'Apache Log4j', 'Sí', 3, 'RCE'),
  vuln('3', 'CVE-2021-34527', 7.8, 'Microsoft Windows', 'No', 12, 'EoP'),
  vuln('4', 'CVE-2021-35587', 5.5, 'OpenSSL', 'No', 20, 'DoS'),
  vuln('5', 'CVE-2014-0160', 5.0, 'OpenSSL', 'Sí', 45, 'Info Leak'),
  vuln('6', 'CVE-2021-20021', 3.1, 'Nginx', 'No', undefined, 'DoS')
];

// Extrae el texto plano de un .docx real (cada fragmento <w:t> por separado,
// sin concatenar entre párrafos distintos) — mismo criterio que el spy de
// PDFDocument.prototype.text usado en InformeUniversalRF130.test.ts: no
// parsear el binario/XML completo, solo confirmar que el texto real está.
// Limitación conocida: un párrafo que mezcla runs en negrita + normal (p. ej.
// "Tipo: " + "Inferencial") queda en fragmentos <w:t> separados — el check
// funciona por fragmento, no por oración completa concatenada.
async function textosDeDocx(buffer: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.files['word/document.xml'].async('string');
  return [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((coincidencia) =>
    coincidencia[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  );
}

function repositorioFalso(vulnerabilidades: Vulnerabilidad[]): VulnerabilidadRepository {
  return {
    guardar: jest.fn(),
    guardarLote: jest.fn(),
    contar: jest.fn(),
    listar: jest.fn().mockResolvedValue(vulnerabilidades),
    buscarPorCve: jest.fn(),
    filtrarPorRangoCvss: jest.fn(),
    filtrarPorNivelDeRiesgo: jest.fn().mockResolvedValue([]),
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

// Bug real reportado: el .docx generado solo tenía encabezados y tablas de
// datos para los gráficos, sin la imagen real (a diferencia del PDF). Este
// test genera un .docx REAL (con datos reales pasados por
// recopilarDatosDeInforme, el mismo camino que usa la app) y lo abre como
// zip (un .docx ES un .zip) para confirmar que las imágenes PNG quedaron
// adentro de verdad, no solo que el código no tira.
describe('GeneradorInformeWord — gráficos incrustados como imagen (bug real)', () => {
  test('el .docx generado contiene 10 imágenes PNG reales en word/media/', async () => {
    const dataset = [
      new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí'), 5, 'Apache Log4j', 'RCE'),
      new Vulnerabilidad('2', new IdentificadorCVE('CVE-2021-45046'), new CvssScore(9.0), 'Apache Log4j', new TipoAccesoValue('Sí'), 3, 'Apache Log4j', 'RCE'),
      new Vulnerabilidad('3', new IdentificadorCVE('CVE-2021-34527'), new CvssScore(7.8), 'Microsoft Windows', new TipoAccesoValue('No'), 12, 'Microsoft Windows', 'EoP'),
      new Vulnerabilidad('4', new IdentificadorCVE('CVE-2021-35587'), new CvssScore(5.5), 'OpenSSL', new TipoAccesoValue('No'), 20, 'OpenSSL', 'DoS')
    ];
    const datos = await recopilarDatosDeInforme(repositorioFalso(dataset), auditoriaFalsa(), 'Analista de Prueba', 'analista-1');

    const buffer = await new GeneradorInformeWord().generar(datos);

    expect(buffer.subarray(0, 2).toString()).toBe('PK'); // .docx es un .zip real

    const zip = await JSZip.loadAsync(buffer);
    const imagenes = Object.keys(zip.files).filter((ruta) => ruta.startsWith('word/media/') && ruta.endsWith('.png'));
    expect(imagenes).toHaveLength(10);

    // Cada imagen es un PNG real (firma de archivo), no un placeholder vacío.
    for (const ruta of imagenes) {
      const contenido = await zip.files[ruta].async('nodebuffer');
      expect(contenido.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a'); // firma PNG
      expect(contenido.length).toBeGreaterThan(100);
    }
  });
});

// M-10 Ronda 2, Pasada 2-D (RF-130), Paso 1: generar() (CVSS) pasa a usar el
// orquestador de 20 secciones (InformeUniversalRF130Word.ts) en vez de
// construirContenido(). El test de arriba (10 imágenes) sigue cubriendo que
// §12 no perdió su activo principal — estos tests cubren lo que ese no
// cubre: que las 20 secciones están en el orden/número correcto, y que el
// contenido migrado de "Aplicación práctica" realmente llegó a §18 sin
// duplicar la pregunta 3 (ya en §14) — mismo catch que en la Pasada 2-C del
// lado PDF: "no rompió nada" no es lo mismo que "está cubierto".
describe('GeneradorInformeWord — Pasada 2-D, Paso 1 (RF-130, CVSS)', () => {
  beforeEach(() => {
    (LayoutInformeWord.heading as jest.Mock).mockClear();
  });

  test('CVSS: cada heading() de nivel 1 se llama en el mismo orden y con el mismo título que el mapeo (2-20, sin contar Portada)', async () => {
    const datos = await recopilarDatosDeInforme(repositorioFalso(DATASET_CVSS_TIPICO), auditoriaFalsa(), 'Analista de Prueba', 'analista-1');

    await new GeneradorInformeWord().generar(datos);

    const llamadasNivel1 = (LayoutInformeWord.heading as jest.Mock).mock.calls
      .filter(([, nivel]) => nivel === HeadingLevel.HEADING_1)
      .map(([texto]) => texto);
    const esperado = MAPEO_PLANTILLA_UNIVERSAL_RF130.filter((entrada) => entrada.numero !== 1).map((entrada) => `${entrada.numero}. ${entrada.nombreRF130}`);

    expect(llamadasNivel1).toEqual(esperado);
  });

  test('CVSS §18 Conclusiones: el contenido migrado de "Aplicación práctica" (nivel de riesgo, % urgente, tiempo de parche, ranking top 10) llegó a su nuevo lugar, sin repetir la pregunta 3 (ya en §14)', async () => {
    const datos = await recopilarDatosDeInforme(repositorioFalso(DATASET_CVSS_TIPICO), auditoriaFalsa(), 'Analista de Prueba', 'analista-1');
    const r = datos.resumenEstadistico;

    const buffer = await new GeneradorInformeWord().generar(datos);
    const textos = await textosDeDocx(buffer);
    const texto = textos.join(' | ');

    // Las 3 preguntas migradas — la pregunta 3 (Remoto/Local) ya está en
    // §14 y NO debe repetirse acá.
    expect(texto).toContain('¿Cuál es el nivel típico de riesgo?');
    expect(texto).toContain(`Media CVSS = ${r.media.toFixed(2)}, mediana = ${r.mediana.toFixed(2)}`);
    expect(texto).toContain('¿Qué proporción requiere atención urgente?');
    expect(texto).toContain('¿Cuánto tiempo toma en promedio disponer de un parche?');
    expect(texto).not.toContain('¿Influye el acceso remoto');

    // Ranking de urgencia: top 10 completo, con las filas reales del fixture.
    expect(texto).toContain('Ranking de urgencia de remediación (top 10)');
    datos.rankingUrgencia.slice(0, 10).forEach((entrada) => {
      expect(texto).toContain(entrada.vulnerabilidad.cve.valor);
    });

    // Limitaciones conocidas, en el mismo cierre.
    expect(texto).toContain('Limitaciones conocidas');
    datos.limitacionesConocidas.forEach((limitacion) => expect(texto).toContain(limitacion));

    // §14 (Análisis inferencial) sí tiene la pregunta 3 — confirma que no se
    // perdió, solo que no está duplicada en §18.
    expect(texto).toContain(`Media CVSS remoto = ${formatearEstadistico(datos.comparacionAccesoRemotoLocal.mediaA)}`);
  });

  test('con el mínimo de vulnerabilidades que EstadisticaDescriptiva acepta (n=2) no explota', async () => {
    const dataset = [vuln('1', 'CVE-2023-00001', 8.0, 'Software A', 'Sí', 4), vuln('2', 'CVE-2023-00002', 8.0, 'Software B', 'No', 40)];
    const datos = await recopilarDatosDeInforme(repositorioFalso(dataset), auditoriaFalsa(), 'Analista de Prueba', 'analista-1');

    const buffer = await new GeneradorInformeWord().generar(datos);

    expect(buffer.subarray(0, 2).toString()).toBe('PK');
  });
});

// M-10 Ronda 2, Pasada 2-D (RF-130), Paso 2: generarDataset() (pipeline
// genérico) entra al mismo orquestador de 20 secciones. Antes de este paso el
// informe Word genérico no tenía NINGÚN test (ya era así antes de la pasada):
// estos cubren el orden de secciones, que las figuras quedaron incrustadas de
// verdad (el Word viejo remitía al PDF) y que el contenido que el informe
// viejo tenía como sección propia (valores atípicos) no se perdió al
// reubicarse.
const COLUMNAS_VENTAS = ['Producto', 'Categoria', 'Precio', 'Unidades'];
const FILAS_VENTAS = [
  ['Laptop', 'Electrónica', 1200, 3],
  ['Mouse', 'Accesorios', 25, 40],
  ['Teclado', 'Accesorios', 45, 22],
  ['Monitor', 'Electrónica', 310, 9],
  ['Webcam', 'Accesorios', 60, 18],
  ['Auriculares', 'Accesorios', 80, 25],
  ['Tablet', 'Electrónica', 420, 7],
  ['Cable HDMI', 'Accesorios', 12, 55],
  ['Parlante', 'Accesorios', 35, 30],
  ['Hub USB', 'Accesorios', 28, 33],
  ['Servidor', 'Electrónica', 9800, 1]
].map(([Producto, Categoria, Precio, Unidades]) => ({ Producto, Categoria, Precio, Unidades }));

async function imagenesPngDe(buffer: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buffer);
  return Object.keys(zip.files).filter((ruta) => ruta.startsWith('word/media/') && ruta.endsWith('.png'));
}

describe('GeneradorInformeWord — Pasada 2-D, Paso 2 (RF-130, genérico)', () => {
  beforeEach(() => {
    (LayoutInformeWord.heading as jest.Mock).mockClear();
  });

  test('genérico: cada heading() de nivel 1 se llama en el mismo orden y con el mismo título que el mapeo (2-20, sin contar Portada)', async () => {
    const datos = recopilarDatosDeInformeDataset(COLUMNAS_VENTAS, FILAS_VENTAS, 'Analista de Prueba');

    const buffer = await new GeneradorInformeWord().generarDataset(datos);

    expect(buffer.subarray(0, 2).toString()).toBe('PK');
    const llamadasNivel1 = (LayoutInformeWord.heading as jest.Mock).mock.calls
      .filter(([, nivel]) => nivel === HeadingLevel.HEADING_1)
      .map(([texto]) => texto);
    const esperado = MAPEO_PLANTILLA_UNIVERSAL_RF130.filter((entrada) => entrada.numero !== 1).map((entrada) => `${entrada.numero}. ${entrada.nombreRF130}`);

    expect(llamadasNivel1).toEqual(esperado);
  });

  test('genérico §12: un histograma por columna numérica más el heatmap quedan incrustados como PNG reales, y el texto ya no remite al PDF', async () => {
    const datos = recopilarDatosDeInformeDataset(COLUMNAS_VENTAS, FILAS_VENTAS, 'Analista de Prueba');
    const columnasNumericas = datos.analisisUnivariado.filter((analisis) => analisis.tipo === 'numerica').length;
    expect(columnasNumericas).toBe(2);
    expect(datos.matrizCorrelacion.columnas.length).toBeGreaterThan(0);

    const buffer = await new GeneradorInformeWord().generarDataset(datos);

    const imagenes = await imagenesPngDe(buffer);
    expect(imagenes).toHaveLength(columnasNumericas + 1);
    const zip = await JSZip.loadAsync(buffer);
    for (const ruta of imagenes) {
      const contenido = await zip.files[ruta].async('nodebuffer');
      expect(contenido.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(contenido.length).toBeGreaterThan(100);
    }

    const texto = (await textosDeDocx(buffer)).join(' | ');
    expect(texto).not.toContain('disponible en la versión PDF');
    expect(texto).toContain('Figura 1: Distribución de "Precio"');
    expect(texto).toContain('Figura 2: Distribución de "Unidades"');
    expect(texto).toContain('Figura 3: Heatmap de correlación de Pearson');
  });

  test('genérico §6: la tabla de valores atípicos (sección propia en el Word viejo) sigue en el documento, con el mismo cierre que interpretarOutliers', async () => {
    const datos = recopilarDatosDeInformeDataset(COLUMNAS_VENTAS, FILAS_VENTAS, 'Analista de Prueba');
    const precio = datos.outliers.columnas.find((columna) => columna.columna === 'Precio');
    expect(precio?.cantidadValoresAtipicos).toBeGreaterThan(0);

    const textos = await textosDeDocx(await new GeneradorInformeWord().generarDataset(datos));

    expect(textos).toContain('Valores atípicos (outliers)');
    expect(textos).toContain('Cant. atípicos');
    expect(textos).toContain(precio!.limiteSuperior.toFixed(2));
    expect(textos).toContain(interpretarOutliers(datos.outliers));
  });

  test('genérico: hallazgos (§17), limitaciones (§18), "No aplicable" y "Pendiente" llegan al documento', async () => {
    const datos = recopilarDatosDeInformeDataset(COLUMNAS_VENTAS, FILAS_VENTAS, 'Analista de Prueba');

    const textos = await textosDeDocx(await new GeneradorInformeWord().generarDataset(datos));

    expect(datos.interpretacion.length).toBeGreaterThan(0);
    datos.interpretacion.forEach((hallazgo) => expect(textos).toContain(hallazgo));
    datos.limitacionesConocidas.forEach((limitacion) => expect(textos).toContain(limitacion));
    // §19 Recomendaciones y la subsección Referencias de §20.
    expect(textos.filter((texto) => texto === 'No aplicable')).toHaveLength(2);
    // §14, §15 y §16.
    expect(textos.filter((texto) => texto === 'Pendiente')).toHaveLength(3);
    // Contenido propio de CVSS que no debe filtrarse al genérico.
    expect(textos.join(' | ')).not.toContain('Ranking de urgencia de remediación');
  });

  test('genérico sin columnas numéricas: no explota, no incrusta imágenes y lo dice en cada sección afectada', async () => {
    const datos = recopilarDatosDeInformeDataset(
      ['Nombre', 'Ciudad'],
      [
        { Nombre: 'Ana', Ciudad: 'Lima' },
        { Nombre: 'Luis', Ciudad: 'Cusco' },
        { Nombre: 'Rosa', Ciudad: 'Lima' }
      ],
      'Analista de Prueba'
    );

    const buffer = await new GeneradorInformeWord().generarDataset(datos);

    expect(await imagenesPngDe(buffer)).toHaveLength(0);
    const textos = await textosDeDocx(buffer);
    expect(textos).toContain('Este dataset no tiene columnas numéricas para analizar individualmente.');
    expect(textos).toContain('Este dataset no tiene columnas numéricas para calcular distribuciones.');
    expect(textos).toContain('No hay columnas numéricas para evaluar.');
    expect(textos).toContain('No hay columnas numéricas elegibles para calcular correlaciones.');
    expect(textos.filter((texto) => texto === 'Este dataset no generó ninguna figura (sin columnas numéricas).')).toHaveLength(2);
  });

  test('genérico con dataset vacío (solo encabezados): no explota', async () => {
    const datos = recopilarDatosDeInformeDataset(['A', 'B'], [], 'Analista de Prueba');

    const buffer = await new GeneradorInformeWord().generarDataset(datos);

    expect(buffer.subarray(0, 2).toString()).toBe('PK');
    expect(await textosDeDocx(buffer)).toContain('El dataset no tiene filas.');
  });
});

// Bug real (Pasada 2-D Paso 2): el interlineado por defecto se emitía sin
// w:lineRule. Word lo interpreta como múltiple, LibreOffice como alto de
// renglón fijo — y recortaba cada gráfico al alto de un renglón. Los tests de
// "hay N imágenes PNG en word/media" no lo veían: la imagen está en el
// archivo, lo que falla es cómo se compone la página.
describe('GeneradorInformeWord — interlineado compatible con LibreOffice (bug real)', () => {
  async function espaciadoPorDefecto(buffer: Buffer): Promise<string> {
    const zip = await JSZip.loadAsync(buffer);
    const estilos = await zip.files['word/styles.xml'].async('string');
    const porDefecto = /<w:pPrDefault>.*?<\/w:pPrDefault>/s.exec(estilos)?.[0] ?? '';
    return /<w:spacing[^>]*>/.exec(porDefecto)?.[0] ?? '';
  }

  test('informe CVSS: el interlineado por defecto declara lineRule="auto"', async () => {
    const datos = await recopilarDatosDeInforme(repositorioFalso(DATASET_CVSS_TIPICO), auditoriaFalsa(), 'Analista de Prueba', 'analista-1');

    const espaciado = await espaciadoPorDefecto(await new GeneradorInformeWord().generar(datos));

    expect(espaciado).toContain('w:line="360"');
    expect(espaciado).toContain('w:lineRule="auto"');
  });

  test('informe genérico: ídem', async () => {
    const datos = recopilarDatosDeInformeDataset(COLUMNAS_VENTAS, FILAS_VENTAS, 'Analista de Prueba');

    const espaciado = await espaciadoPorDefecto(await new GeneradorInformeWord().generarDataset(datos));

    expect(espaciado).toContain('w:lineRule="auto"');
  });
});

// Mismos dos bugs de contenido que cubre InformeUniversalRF130.test.ts del
// lado PDF, verificados en el .docx real.
describe('GeneradorInformeWord — citas entre secciones y fechas', () => {
  test('CVSS §12: las citas usan la numeración de la plantilla de 20 secciones', async () => {
    const datos = await recopilarDatosDeInforme(repositorioFalso(DATASET_CVSS_TIPICO), auditoriaFalsa(), 'Analista de Prueba', 'analista-1');

    const texto = (await textosDeDocx(await new GeneradorInformeWord().generar(datos))).join(' | ');

    expect(texto).toContain('la sección 9 (Estadística descriptiva)');
    expect(texto).toContain('la sección 11 (Distribuciones)');
    expect(texto).toContain('la sección 14 (Análisis inferencial)');
    expect(texto).toContain('la sección 18 (Conclusiones)');
    expect(texto).not.toMatch(/la sección 5\b/);
    expect(texto).not.toMatch(/la sección 7\b/);
    expect(texto).not.toContain('Aplicación práctica');
  });

  test('CVSS: las limitaciones conocidas ya no nombran a SEVERA (rebrand a SIADE)', async () => {
    const datos = await recopilarDatosDeInforme(repositorioFalso(DATASET_CVSS_TIPICO), auditoriaFalsa(), 'Analista de Prueba', 'analista-1');

    const texto = (await textosDeDocx(await new GeneradorInformeWord().generar(datos))).join(' | ');

    expect(texto).not.toContain('SEVERA');
    expect(texto).toContain('SIADE importó cada registro');
  });

  test('genérico §9: el rango de una columna de fecha día/mes/año es el del dato, en un servidor al oeste de Greenwich', async () => {
    const zonaOriginal = process.env.TZ;
    process.env.TZ = 'America/Lima';
    try {
      const datos = recopilarDatosDeInformeDataset(
        ['FechaVenta', 'Monto'],
        ['10/01/2024', '02/03/2024', '28/06/2024'].map((FechaVenta, indice) => ({ FechaVenta, Monto: 10 * (indice + 1) })),
        'Analista de Prueba'
      );

      const textos = await textosDeDocx(await new GeneradorInformeWord().generarDataset(datos));

      expect(textos).toContain('de 2024-01-10 a 2024-06-28');
      expect(textos.join(' | ')).not.toContain('SEVERA');
    } finally {
      process.env.TZ = zonaOriginal;
    }
  });
});
