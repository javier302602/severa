import { CalcularResumenEstadistico } from '../../src/application/usecases/CalcularResumenEstadistico';
import { VulnerabilidadRepository } from '../../src/application/ports/out/VulnerabilidadRepository';
import { Vulnerabilidad } from '../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../src/domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../src/domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../src/domain/value-objects/TipoAcceso';
import {
  calcularMedia,
  calcularMediana,
  calcularModa,
  calcularCuartiles,
  calcularRango,
  calcularVarianzaMuestral,
  calcularDesviacionEstandarMuestral,
  calcularCoeficienteVariacion
} from '../../src/domain/services/EstadisticaDescriptiva';

describe('CalcularResumenEstadistico', () => {
  test('calcula el resumen a partir de CVSS reales del dataset', async () => {
    const repo: VulnerabilidadRepository = {
      guardar: jest.fn().mockResolvedValue(undefined),
    guardarLote: jest.fn().mockResolvedValue(undefined),
      contar: jest.fn().mockResolvedValue(0),
      listar: jest.fn().mockResolvedValue([
        new Vulnerabilidad('1', new IdentificadorCVE('CVE-2024-00001'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí')),
        new Vulnerabilidad('2', new IdentificadorCVE('CVE-2024-00002'), new CvssScore(9.8), 'OpenSSL', new TipoAccesoValue('No')),
        new Vulnerabilidad('3', new IdentificadorCVE('CVE-2024-00003'), new CvssScore(7.8), 'Nginx', new TipoAccesoValue('Sí')),
        new Vulnerabilidad('4', new IdentificadorCVE('CVE-2024-00004'), new CvssScore(7.8), 'PostgreSQL', new TipoAccesoValue('No')),
        new Vulnerabilidad('5', new IdentificadorCVE('CVE-2024-00005'), new CvssScore(5.5), 'Redis', new TipoAccesoValue('Sí')),
        new Vulnerabilidad('6', new IdentificadorCVE('CVE-2024-00006'), new CvssScore(4.0), 'Kafka', new TipoAccesoValue('No'))
      ]),
      buscarPorCve: jest.fn().mockResolvedValue(null),
      filtrarPorRangoCvss: jest.fn().mockResolvedValue([]),
      filtrarPorSeveridad: jest.fn().mockResolvedValue([]),
      listarPorTipoAcceso: jest.fn().mockResolvedValue([]),
      listarPorTipoVulnerabilidad: jest.fn().mockResolvedValue([]),
      listarSoftwareDisponible: jest.fn().mockResolvedValue([]),
      listarPorSoftware: jest.fn().mockResolvedValue([]),
      actualizarEstado: jest.fn().mockResolvedValue(undefined),
      buscarConFiltros: jest.fn().mockResolvedValue([]),
      eliminarTodas: jest.fn().mockResolvedValue(0)
    };

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
});
