import { CompararPorSoftware } from '../../src/application/usecases/CompararPorSoftware';
import { VulnerabilidadRepository } from '../../src/application/ports/out/VulnerabilidadRepository';
import { Vulnerabilidad } from '../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../src/domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../src/domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../src/domain/value-objects/TipoAcceso';

describe('CompararPorSoftware', () => {
  test('compara medias entre dos software', async () => {
    const dataset = [
      new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí'), undefined, 'Apache Log4j', 'Log4Shell'),
      new Vulnerabilidad('2', new IdentificadorCVE('CVE-2021-45046'), new CvssScore(9.0), 'Apache Log4j', new TipoAccesoValue('Sí'), undefined, 'Apache Log4j', 'RCE'),
      new Vulnerabilidad('3', new IdentificadorCVE('CVE-2021-35587'), new CvssScore(9.8), 'OpenSSL', new TipoAccesoValue('No'), undefined, 'OpenSSL', 'RCE'),
      new Vulnerabilidad('4', new IdentificadorCVE('CVE-2014-0160'), new CvssScore(8.6), 'OpenSSL', new TipoAccesoValue('No'), undefined, 'OpenSSL', 'RCE')
    ];

    const repo: VulnerabilidadRepository = {
      guardar: jest.fn().mockResolvedValue(undefined),
      contar: jest.fn().mockResolvedValue(0),
      listar: jest.fn().mockResolvedValue(dataset),
      buscarPorCve: jest.fn().mockResolvedValue(null),
      filtrarPorRangoCvss: jest.fn().mockResolvedValue([]),
      filtrarPorSeveridad: jest.fn().mockResolvedValue([]),
      listarPorTipoAcceso: jest.fn().mockResolvedValue([]),
      listarPorTipoVulnerabilidad: jest.fn().mockResolvedValue([]),
      listarPorSoftware: jest.fn().mockImplementation(async (software) => dataset.filter((item) => item.software === software)),
      actualizarEstado: jest.fn().mockResolvedValue(undefined),
      buscarConFiltros: jest.fn().mockResolvedValue([])
    };

    const usecase = new CompararPorSoftware(repo);
    const resultado = await usecase.ejecutar('Apache Log4j', 'OpenSSL');

    expect(resultado).toEqual({
      mediaA: 9.5,
      mediaB: 9.2,
      diferenciaMedias: 0.3000000000000007,
      sdA: 0.7071067811865476,
      sdB: 0.8485281374238578
    });
  });
});
