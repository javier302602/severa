import { CalcularResumenEstadistico } from '../../../src/application/usecases/module_medidas_tendencia_dispersion/CalcularResumenEstadistico';
import { VulnerabilidadRepository } from '../../../src/application/ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { Vulnerabilidad } from '../../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../../src/domain/shared/value-objects/IdentificadorCVE';
import { CvssScore } from '../../../src/domain/shared/value-objects/CvssScore';
import { TipoAccesoValue } from '../../../src/domain/shared/value-objects/TipoAcceso';
import {
  calcularMedia,
  calcularMediana,
  calcularModa,
  calcularCuartiles,
  calcularRango,
  calcularVarianzaMuestral,
  calcularDesviacionEstandarMuestral,
  calcularCoeficienteVariacion
} from '../../../src/domain/services/descriptive-statistics/EstadisticaDescriptiva';

function repositorioFalso(vulnerabilidades: Vulnerabilidad[]): VulnerabilidadRepository {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    guardarLote: jest.fn().mockResolvedValue(undefined),
    contar: jest.fn().mockResolvedValue(0),
    listar: jest.fn().mockResolvedValue(vulnerabilidades),
    buscarPorCve: jest.fn().mockResolvedValue(null),
    filtrarPorRangoCvss: jest.fn().mockResolvedValue([]),
    filtrarPorSeveridad: jest.fn().mockResolvedValue([]),
    filtrarPorRango: jest.fn(),
    filtrarPorCategoria: jest.fn(),
    listarPorTipoAcceso: jest.fn().mockResolvedValue([]),
    listarPorTipoVulnerabilidad: jest.fn().mockResolvedValue([]),
    listarSoftwareDisponible: jest.fn().mockResolvedValue([]),
    listarPorSoftware: jest.fn().mockResolvedValue([]),
    actualizarEstado: jest.fn().mockResolvedValue(undefined),
    buscarConFiltros: jest.fn().mockResolvedValue([]),
    eliminarTodas: jest.fn().mockResolvedValue(0)
  };
}

function vulnerabilidadConCvss(id: string, cvss: number): Vulnerabilidad {
  return new Vulnerabilidad(id, new IdentificadorCVE(`CVE-2024-${id.padStart(5, '0')}`), new CvssScore(cvss), `software-${id}`, new TipoAccesoValue('Sí'));
}

describe('CalcularResumenEstadistico', () => {
  test('calcula el resumen a partir de CVSS reales del dataset', async () => {
    const repo = repositorioFalso([
      new Vulnerabilidad('1', new IdentificadorCVE('CVE-2024-00001'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí')),
      new Vulnerabilidad('2', new IdentificadorCVE('CVE-2024-00002'), new CvssScore(9.8), 'OpenSSL', new TipoAccesoValue('No')),
      new Vulnerabilidad('3', new IdentificadorCVE('CVE-2024-00003'), new CvssScore(7.8), 'Nginx', new TipoAccesoValue('Sí')),
      new Vulnerabilidad('4', new IdentificadorCVE('CVE-2024-00004'), new CvssScore(7.8), 'PostgreSQL', new TipoAccesoValue('No')),
      new Vulnerabilidad('5', new IdentificadorCVE('CVE-2024-00005'), new CvssScore(5.5), 'Redis', new TipoAccesoValue('Sí')),
      new Vulnerabilidad('6', new IdentificadorCVE('CVE-2024-00006'), new CvssScore(4.0), 'Kafka', new TipoAccesoValue('No'))
    ]);

    const scores = [10.0, 9.8, 7.8, 7.8, 5.5, 4.0];
    const usecase = new CalcularResumenEstadistico(repo);
    const resultado = await usecase.ejecutar('analista-1');
    const { q1, q3 } = calcularCuartiles(scores);

    expect(resultado.media).toBeCloseTo(calcularMedia(scores), 10);
    expect(resultado.mediana).toBeCloseTo(calcularMediana(scores), 10);
    expect(resultado.moda).toEqual(calcularModa(scores));
    expect(resultado.q1).toBeCloseTo(q1, 10);
    expect(resultado.q3).toBeCloseTo(q3, 10);
    expect(resultado.rango).toBeCloseTo(calcularRango(scores), 10);
    expect(resultado.varianza).toBeCloseTo(calcularVarianzaMuestral(scores), 10);
    expect(resultado.desviacionEstandar).toBeCloseTo(calcularDesviacionEstandarMuestral(scores), 10);
    expect(resultado.coeficienteVariacion).toBeCloseTo(calcularCoeficienteVariacion(scores), 10);
  });

  // RF-50: valores de referencia reutilizando el mismo subconjunto ya
  // verificado en EstadisticaDescriptiva.test.ts (los 12 valores positivos
  // del fixture de 13 CVSS Score, sin el 0.0).
  test('media geométrica y armónica: valores de referencia sobre CVSS reales', async () => {
    const scores = [2.1, 2.4, 3.6, 4.0, 4.0, 4.9, 5.5, 6.7, 7.2, 8.8, 9.0, 10.0];
    const repo = repositorioFalso(scores.map((cvss, indice) => vulnerabilidadConCvss(String(indice + 1), cvss)));

    const usecase = new CalcularResumenEstadistico(repo);
    const resultado = await usecase.ejecutar('analista-1');

    expect(resultado.mediaGeometrica).toBeCloseTo(5.0850515017, 4);
    expect(resultado.mediaArmonica).toBeCloseTo(4.4953504084, 4);
  });

  test('media geométrica y armónica quedan en null si hay un CVSS Score de 0.0 (RF-50: no se descarta en silencio)', async () => {
    const scores = [0.0, 2.1, 2.4, 3.6, 4.0, 4.0, 4.9, 5.5, 6.7, 7.2, 8.8, 9.0, 10.0];
    const repo = repositorioFalso(scores.map((cvss, indice) => vulnerabilidadConCvss(String(indice + 1), cvss)));

    const usecase = new CalcularResumenEstadistico(repo);
    const resultado = await usecase.ejecutar('analista-1');

    expect(resultado.mediaGeometrica).toBeNull();
    expect(resultado.mediaArmonica).toBeNull();
  });
});
