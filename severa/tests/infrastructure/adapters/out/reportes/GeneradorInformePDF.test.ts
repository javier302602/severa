import { GeneradorInformePDF } from '../../../../../src/infrastructure/adapters/out/reportes/GeneradorInformePDF';
import { recopilarDatosDeInforme } from '../../../../../src/application/usecases/module_reportes_exportacion/RecopilarDatosDeInforme';
import { recopilarDatosDeInformeDataset } from '../../../../../src/application/usecases/module_reportes_exportacion/RecopilarDatosDeInformeDataset';
import { VulnerabilidadRepository } from '../../../../../src/application/ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { AuditoriaRepository } from '../../../../../src/application/ports/out/persistencia/repositorios/AuditoriaRepository';
import { Vulnerabilidad } from '../../../../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../../../../src/domain/shared/value-objects/IdentificadorCVE';
import { CvssScore } from '../../../../../src/domain/shared/value-objects/CvssScore';
import { TipoAccesoValue } from '../../../../../src/domain/shared/value-objects/TipoAcceso';
import { RegistroAuditoria } from '../../../../../src/domain/entities/RegistroAuditoria';

// Antes de este archivo, GeneradorInformePDF.ts (RF-77, Must) tenía 2.1% de
// cobertura real: ningún test unitario lo invocaba directamente (todos los
// casos de uso usan un GeneradorDeInformes falso) y el único camino que lo
// ejercitaba de verdad (la ruta E2E de Fase 5) estaba roto por un bug ajeno
// (ver AnalisisDatasetFase3.test.ts). Estos tests no verifican bytes exactos
// del PDF (es binario, cualquier assert más fino sería frágil) — solo que la
// generación no lanza y produce un PDF real (firma "%PDF").
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

function auditoriaFalsa(registros: RegistroAuditoria[] = []): AuditoriaRepository {
  return { registrar: jest.fn(), listar: jest.fn().mockResolvedValue(registros) };
}

function vuln(
  id: string,
  cve: string,
  cvss: number,
  software: string,
  tipoAcceso?: 'Sí' | 'No',
  diasParaParche?: number,
  tipoVulnerabilidad?: string
): Vulnerabilidad {
  return new Vulnerabilidad(
    id,
    new IdentificadorCVE(cve),
    new CvssScore(cvss),
    software,
    tipoAcceso ? new TipoAccesoValue(tipoAcceso) : undefined,
    diasParaParche,
    software,
    tipoVulnerabilidad
  );
}

function firmaPdf(buffer: Buffer): string {
  return buffer.subarray(0, 4).toString('ascii');
}

const DATASET_TIPICO = [
  vuln('1', 'CVE-2021-44228', 10.0, 'Apache Log4j', 'Sí', 5, 'RCE'),
  vuln('2', 'CVE-2021-45046', 9.0, 'Apache Log4j', 'Sí', 3, 'RCE'),
  vuln('3', 'CVE-2021-34527', 7.8, 'Microsoft Windows', 'No', 12, 'EoP'),
  vuln('4', 'CVE-2021-35587', 5.5, 'OpenSSL', 'No', 20, 'DoS'),
  vuln('5', 'CVE-2014-0160', 5.0, 'OpenSSL', 'Sí', 45, 'Info Leak'),
  vuln('6', 'CVE-2021-20021', 3.1, 'Nginx', 'No', undefined, 'DoS')
];

describe('GeneradorInformePDF — informe CVSS (RF-77/RF-82)', () => {
  test('camino feliz: genera un PDF real con las 12 secciones del informe completo', async () => {
    const datos = await recopilarDatosDeInforme(repositorioFalso(DATASET_TIPICO), auditoriaFalsa(), 'Analista de Prueba', 'analista-1');

    const buffer = await new GeneradorInformePDF().generarInformeCompleto(datos);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(firmaPdf(buffer)).toBe('%PDF');
    expect(buffer.length).toBeGreaterThan(1000);
  });

  test('resumen ejecutivo: genera un PDF real en su versión resumida (RF-82)', async () => {
    const datos = await recopilarDatosDeInforme(repositorioFalso(DATASET_TIPICO), auditoriaFalsa(), 'Analista de Prueba', 'analista-1');

    const buffer = await new GeneradorInformePDF().generarResumenEjecutivo(datos);

    expect(firmaPdf(buffer)).toBe('%PDF');
  });

  test('con el mínimo de vulnerabilidades que EstadisticaDescriptiva acepta (n=2) no explota', async () => {
    const dataset = [vuln('1', 'CVE-2023-00001', 8.0, 'Software A', 'Sí', 4), vuln('2', 'CVE-2023-00002', 8.0, 'Software B', 'No', 40)];
    const datos = await recopilarDatosDeInforme(repositorioFalso(dataset), auditoriaFalsa(), 'Analista de Prueba', 'analista-1');

    const buffer = await new GeneradorInformePDF().generarInformeCompleto(datos);

    expect(firmaPdf(buffer)).toBe('%PDF');
  });

  test('sin ninguna vulnerabilidad de acceso Remoto ni Local (boxplotPorAcceso ambos null) no explota', async () => {
    const dataset = [
      vuln('1', 'CVE-2023-00001', 8.0, 'Software A', undefined, 4),
      vuln('2', 'CVE-2023-00002', 6.0, 'Software B', undefined, 10)
    ];
    const datos = await recopilarDatosDeInforme(repositorioFalso(dataset), auditoriaFalsa(), 'Analista de Prueba', 'analista-1');
    expect(datos.graficos.boxplotPorAcceso).toEqual({ remoto: null, local: null });

    const buffer = await new GeneradorInformePDF().generarInformeCompleto(datos);

    expect(firmaPdf(buffer)).toBe('%PDF');
  });

  test('sin ninguna vulnerabilidad con "Días para Parche" registrado (dispersión e histograma de días vacíos) no explota', async () => {
    const dataset = [
      vuln('1', 'CVE-2023-00001', 8.0, 'Software A', 'Sí'),
      vuln('2', 'CVE-2023-00002', 6.0, 'Software B', 'No')
    ];
    const datos = await recopilarDatosDeInforme(repositorioFalso(dataset), auditoriaFalsa(), 'Analista de Prueba', 'analista-1');
    expect(datos.graficos.dispersionCvssDias.puntos).toEqual([]);
    expect(datos.graficos.histogramaDiasParche.bins).toEqual([]);

    const buffer = await new GeneradorInformePDF().generarInformeCompleto(datos);

    expect(firmaPdf(buffer)).toBe('%PDF');
  });

  test('sin ninguna vulnerabilidad con tipo real asignado (Top Tipos vacío, todo "Sin clasificar") no explota', async () => {
    const dataset = [
      vuln('1', 'CVE-2023-00001', 8.0, 'Software A', 'Sí', 4),
      vuln('2', 'CVE-2023-00002', 6.0, 'Software B', 'No', 10)
    ];
    const datos = await recopilarDatosDeInforme(repositorioFalso(dataset), auditoriaFalsa(), 'Analista de Prueba', 'analista-1');
    expect(datos.graficos.topTipos).toEqual([]);
    expect(datos.graficos.totalTiposSinClasificar).toBe(2);

    const buffer = await new GeneradorInformePDF().generarInformeCompleto(datos);

    expect(firmaPdf(buffer)).toBe('%PDF');
  });

  test('con un registro de auditoría real de importación (origenYCalidad con dato, no null) no explota', async () => {
    const registro = new RegistroAuditoria('a1', 'analista-1', 'ImportarDataset', '10 importados, 0 rechazados', new Date('2026-01-01'));
    const datos = await recopilarDatosDeInforme(repositorioFalso(DATASET_TIPICO), auditoriaFalsa([registro]), 'Analista de Prueba', 'analista-1');
    expect(datos.origenYCalidad.ultimoCambioRegistrado).not.toBeNull();

    const buffer = await new GeneradorInformePDF().generarInformeCompleto(datos);

    expect(firmaPdf(buffer)).toBe('%PDF');
  });

  test('con más de 300 vulnerabilidades, el Anexo A usa muestra representativa (esMuestra=true) no explota', async () => {
    const dataset = Array.from({ length: 305 }, (_, i) =>
      vuln(String(i), `CVE-2023-${String(10000 + i)}`, 4 + (i % 6), `Software ${i % 20}`, i % 2 === 0 ? 'Sí' : 'No', i % 30, i % 3 === 0 ? 'RCE' : undefined)
    );
    const datos = await recopilarDatosDeInforme(repositorioFalso(dataset), auditoriaFalsa(), 'Analista de Prueba', 'analista-1');
    expect(datos.anexoDataset.esMuestra).toBe(true);
    expect(datos.anexoDataset.tamanoOriginal).toBe(305);

    const buffer = await new GeneradorInformePDF().generarInformeCompleto(datos);

    expect(firmaPdf(buffer)).toBe('%PDF');
  }, 15000);

  test('con CVSS Score empatado (moda con más de un valor) no explota', async () => {
    const dataset = [
      vuln('1', 'CVE-2023-00001', 5.0, 'Software A', 'Sí', 4),
      vuln('2', 'CVE-2023-00002', 5.0, 'Software B', 'No', 10),
      vuln('3', 'CVE-2023-00003', 7.0, 'Software C', 'Sí', 4),
      vuln('4', 'CVE-2023-00004', 7.0, 'Software D', 'No', 10),
      vuln('5', 'CVE-2023-00005', 9.0, 'Software E', 'Sí', 20)
    ];
    const datos = await recopilarDatosDeInforme(repositorioFalso(dataset), auditoriaFalsa(), 'Analista de Prueba', 'analista-1');
    expect(datos.resumenEstadistico.moda.length).toBeGreaterThan(1);

    const buffer = await new GeneradorInformePDF().generarInformeCompleto(datos);

    expect(firmaPdf(buffer)).toBe('%PDF');
  });

  test('con interpretación y limitaciones conocidas vacías no explota (secciones de Conclusiones sin ítems)', async () => {
    const datosBase = await recopilarDatosDeInforme(repositorioFalso(DATASET_TIPICO), auditoriaFalsa(), 'Analista de Prueba', 'analista-1');
    const datos = { ...datosBase, interpretacion: [], limitacionesConocidas: [] };

    const buffer = await new GeneradorInformePDF().generarInformeCompleto(datos);

    expect(firmaPdf(buffer)).toBe('%PDF');
  });
});

describe('GeneradorInformePDF — informe de dataset genérico (Fase 5)', () => {
  const columnasTipicas = ['Producto', 'Precio', 'Categoria', 'FechaAlta'];
  const filasTipicas = [
    { Producto: 'Laptop', Precio: 1200, Categoria: 'Electrónica', FechaAlta: '2024-01-15' },
    { Producto: 'Mouse', Precio: 25, Categoria: 'Accesorios', FechaAlta: '2024-02-01' },
    { Producto: 'Teclado', Precio: 45, Categoria: 'Accesorios', FechaAlta: '2024-02-10' },
    { Producto: 'Monitor', Precio: 300, Categoria: 'Electrónica', FechaAlta: '2024-03-05' },
    { Producto: 'Silla', Precio: 150, Categoria: 'Mobiliario', FechaAlta: '2024-03-20' }
  ];

  test('camino feliz: dataset con columnas numérica/categórica/fecha genera un PDF real con las 10 secciones', async () => {
    const datos = recopilarDatosDeInformeDataset(columnasTipicas, filasTipicas, 'Analista de Prueba');

    const buffer = await new GeneradorInformePDF().generarInformeDataset(datos);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(firmaPdf(buffer)).toBe('%PDF');
  });

  test('dataset sin columnas numéricas (univariado/correlación/outliers vacíos) no explota', async () => {
    const columnas = ['Producto', 'Categoria'];
    const filas = [
      { Producto: 'Laptop', Categoria: 'Electrónica' },
      { Producto: 'Mouse', Categoria: 'Accesorios' },
      { Producto: 'Silla', Categoria: 'Mobiliario' }
    ];
    const datos = recopilarDatosDeInformeDataset(columnas, filas, 'Analista de Prueba');
    expect(datos.analisisUnivariado).toEqual([]);
    expect(datos.matrizCorrelacion.columnas).toEqual([]);
    expect(datos.outliers.columnas).toEqual([]);

    const buffer = await new GeneradorInformePDF().generarInformeDataset(datos);

    expect(firmaPdf(buffer)).toBe('%PDF');
  });

  test('con valores null/undefined y una columna de fecha real en las filas del Anexo A no explota', async () => {
    const columnas = ['Producto', 'Precio', 'FechaAlta'];
    const filas = [
      { Producto: 'Laptop', Precio: 1200, FechaAlta: new Date('2024-01-15') },
      { Producto: 'Mouse', Precio: null, FechaAlta: undefined },
      { Producto: undefined, Precio: 45, FechaAlta: new Date('2024-02-10') }
    ];
    const datos = recopilarDatosDeInformeDataset(columnas, filas, 'Analista de Prueba');

    const buffer = await new GeneradorInformePDF().generarInformeDataset(datos);

    expect(firmaPdf(buffer)).toBe('%PDF');
  });

  test('dataset sin filas en el Anexo A (override manual) no explota', async () => {
    const datosBase = recopilarDatosDeInformeDataset(columnasTipicas, filasTipicas, 'Analista de Prueba');
    const datos = { ...datosBase, anexoMuestraFilas: { ...datosBase.anexoMuestraFilas, filas: [] } };

    const buffer = await new GeneradorInformePDF().generarInformeDataset(datos);

    expect(firmaPdf(buffer)).toBe('%PDF');
  });

  test('dataset con muchas columnas (> 8) recorta el Anexo A a las primeras 8, sin explotar', async () => {
    const columnas = Array.from({ length: 12 }, (_, i) => `Col${i}`);
    const filas = [Object.fromEntries(columnas.map((c, i) => [c, i]))];
    const datos = recopilarDatosDeInformeDataset(columnas, filas, 'Analista de Prueba');
    expect(datos.anexoMuestraFilas.columnasMostradas).toHaveLength(8);
    expect(datos.anexoMuestraFilas.totalColumnas).toBe(12);

    const buffer = await new GeneradorInformePDF().generarInformeDataset(datos);

    expect(firmaPdf(buffer)).toBe('%PDF');
  });
});
