import JSZip from 'jszip';
import { HeadingLevel } from 'docx';
import { GeneradorInformeWord } from '../../../../../src/infrastructure/adapters/out/reportes/GeneradorInformeWord';
import { recopilarDatosDeInforme } from '../../../../../src/application/usecases/module_reportes_exportacion/RecopilarDatosDeInforme';
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
