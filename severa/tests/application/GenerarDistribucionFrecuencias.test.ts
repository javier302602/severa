import { GenerarDistribucionFrecuencias } from '../../src/application/usecases/GenerarDistribucionFrecuencias';
import { VulnerabilidadRepository } from '../../src/application/ports/out/VulnerabilidadRepository';
import { Vulnerabilidad } from '../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../src/domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../src/domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../src/domain/value-objects/TipoAcceso';

describe('GenerarDistribucionFrecuencias', () => {
  test('genera la tabla sin agrupar para un conjunto fijo de CVSS', async () => {
    const repo: VulnerabilidadRepository = {
      guardar: jest.fn().mockResolvedValue(undefined),
      contar: jest.fn().mockResolvedValue(0),
      listar: jest.fn().mockResolvedValue([
        new Vulnerabilidad('1', new IdentificadorCVE('CVE-2024-00001'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí')),
        new Vulnerabilidad('2', new IdentificadorCVE('CVE-2024-00002'), new CvssScore(9.8), 'OpenSSL', new TipoAccesoValue('No')),
        new Vulnerabilidad('3', new IdentificadorCVE('CVE-2024-00003'), new CvssScore(7.8), 'Nginx', new TipoAccesoValue('Sí')),
        new Vulnerabilidad('4', new IdentificadorCVE('CVE-2024-00004'), new CvssScore(7.8), 'PostgreSQL', new TipoAccesoValue('No'))
      ]),
      buscarPorCve: jest.fn().mockResolvedValue(null),
      filtrarPorRangoCvss: jest.fn().mockResolvedValue([]),
      filtrarPorSeveridad: jest.fn().mockResolvedValue([]),
      listarPorTipoAcceso: jest.fn().mockResolvedValue([]),
      listarPorTipoVulnerabilidad: jest.fn().mockResolvedValue([]),
      listarPorSoftware: jest.fn().mockResolvedValue([]),
      actualizarEstado: jest.fn().mockResolvedValue(undefined),
      buscarConFiltros: jest.fn().mockResolvedValue([])
    };

    const usecase = new GenerarDistribucionFrecuencias(repo);
    const resultado = await usecase.ejecutar('sinAgrupar');

    expect(resultado).toEqual([
      { valor: 7.8, frecuencia: 2 },
      { valor: 9.8, frecuencia: 1 },
      { valor: 10, frecuencia: 1 }
    ]);
  });
});
