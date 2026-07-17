import { CompararPorTipoDeVulnerabilidad } from '../../src/application/usecases/CompararPorTipoDeVulnerabilidad';
import { VulnerabilidadRepository } from '../../src/application/ports/out/VulnerabilidadRepository';
import { Vulnerabilidad } from '../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../src/domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../src/domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../src/domain/value-objects/TipoAcceso';

describe('CompararPorTipoDeVulnerabilidad', () => {
  test('compara medias entre dos tipos de vulnerabilidad', async () => {
    const dataset = [
      new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí'), undefined, 'Apache Log4j', 'Log4Shell'),
      new Vulnerabilidad('2', new IdentificadorCVE('CVE-2021-35587'), new CvssScore(9.8), 'OpenSSL', new TipoAccesoValue('No'), undefined, 'OpenSSL', 'RCE'),
      new Vulnerabilidad('3', new IdentificadorCVE('CVE-2021-34527'), new CvssScore(7.8), 'Microsoft Windows', new TipoAccesoValue('Sí'), undefined, 'Microsoft Windows', 'Log4Shell'),
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
      listarPorTipoVulnerabilidad: jest.fn().mockImplementation(async (tipo) => dataset.filter((item) => item.tipoVulnerabilidad === tipo)),
      listarPorSoftware: jest.fn().mockResolvedValue([]),
      actualizarEstado: jest.fn().mockResolvedValue(undefined),
      buscarConFiltros: jest.fn().mockResolvedValue([])
    };

    const usecase = new CompararPorTipoDeVulnerabilidad(repo);
    const resultado = await usecase.ejecutar('Log4Shell', 'RCE');

    expect(resultado).toEqual({
      mediaA: 8.9,
      mediaB: 9.2,
      diferenciaMedias: -0.29999999999999893,
      sdA: 1.5556349186104046,
      sdB: 0.8485281374238578
    });
  });
});
