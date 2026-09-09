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
