import { CompararPorTipoAcceso } from '../../src/application/usecases/CompararPorTipoAcceso';
import { VulnerabilidadRepository } from '../../src/application/ports/out/VulnerabilidadRepository';
import { Vulnerabilidad } from '../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../src/domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../src/domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../src/domain/value-objects/TipoAcceso';

describe('CompararPorTipoAcceso', () => {
  test('compara el CVSS promedio entre remoto y local con datos del dataset real', async () => {
    const dataset = [
      new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí'), undefined, 'Apache Log4j', 'Log4Shell'),
      new Vulnerabilidad('2', new IdentificadorCVE('CVE-2021-35587'), new CvssScore(9.8), 'OpenSSL', new TipoAccesoValue('No'), undefined, 'OpenSSL', 'RCE'),
      new Vulnerabilidad('3', new IdentificadorCVE('CVE-2021-34527'), new CvssScore(7.8), 'Microsoft Windows', new TipoAccesoValue('Sí'), undefined, 'Microsoft Windows', 'EoP'),
      new Vulnerabilidad('4', new IdentificadorCVE('CVE-2021-20021'), new CvssScore(5.5), 'Nginx', new TipoAccesoValue('No'), undefined, 'Nginx', 'DoS')
    ];

    const repo: VulnerabilidadRepository = {
      guardar: jest.fn().mockResolvedValue(undefined),
      contar: jest.fn().mockResolvedValue(0),
      listar: jest.fn().mockResolvedValue(dataset),
      buscarPorCve: jest.fn().mockResolvedValue(null),
      filtrarPorRangoCvss: jest.fn().mockResolvedValue([]),
      filtrarPorSeveridad: jest.fn().mockResolvedValue([]),
      listarPorTipoAcceso: jest.fn().mockImplementation(async (tipoAcceso: 'Remoto' | 'Local') => dataset.filter((item) => item.tipoAcceso?.valor === tipoAcceso)),
      listarPorTipoVulnerabilidad: jest.fn().mockResolvedValue([]),
      listarPorSoftware: jest.fn().mockResolvedValue([]),
      actualizarEstado: jest.fn().mockResolvedValue(undefined),
      buscarConFiltros: jest.fn().mockResolvedValue([])
    };

    const usecase = new CompararPorTipoAcceso(repo);
    const resultado = await usecase.ejecutar();

    expect(resultado).toEqual({
      mediaA: 8.9,
      mediaB: 7.65,
      diferenciaMedias: 1.25,
      sdA: 1.5556349186104046,
      sdB: 3.040559159102155
    });
  });
});
