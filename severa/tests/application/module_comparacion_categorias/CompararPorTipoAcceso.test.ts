import { CompararPorTipoAcceso } from '../../../src/application/usecases/module_comparacion_categorias/CompararPorTipoAcceso';
import { VulnerabilidadRepository } from '../../../src/application/ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { Vulnerabilidad } from '../../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../../src/domain/shared/value-objects/IdentificadorCVE';
import { CvssScore } from '../../../src/domain/shared/value-objects/CvssScore';
import { TipoAccesoValue } from '../../../src/domain/shared/value-objects/TipoAcceso';

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
    guardarLote: jest.fn().mockResolvedValue(undefined),
      contar: jest.fn().mockResolvedValue(0),
      listar: jest.fn().mockResolvedValue(dataset),
      buscarPorCve: jest.fn().mockResolvedValue(null),
      filtrarPorRangoCvss: jest.fn().mockResolvedValue([]),
      filtrarPorSeveridad: jest.fn().mockResolvedValue([]),
      filtrarPorRango: jest.fn(),
      filtrarPorCategoria: jest.fn(),
      listarPorTipoAcceso: jest.fn().mockImplementation(async (tipoAcceso: 'Remoto' | 'Local') => dataset.filter((item) => item.tipoAcceso?.valor === tipoAcceso)),
      listarPorTipoVulnerabilidad: jest.fn().mockResolvedValue([]),
      listarSoftwareDisponible: jest.fn().mockResolvedValue([]),
      listarPorSoftware: jest.fn().mockResolvedValue([]),
      actualizarEstado: jest.fn().mockResolvedValue(undefined),
      buscarConFiltros: jest.fn().mockResolvedValue([]),
      eliminarTodas: jest.fn().mockResolvedValue(0)
    };

    const usecase = new CompararPorTipoAcceso(repo);
    const resultado = await usecase.ejecutar('analista-1');

    expect(resultado).toEqual({
      mediaA: 8.9,
      mediaB: 7.65,
      categoriaConMayorPromedio: 'Remoto',
      diferenciaMedias: 1.25,
      sdA: 1.5556349186104046,
      sdB: 3.040559159102155
    });
  });

  // Cobertura del camino "vulnerabilidades ya cargadas en memoria" (el que
  // usa RecopilarDatosDeInforme.ts) — antes sin ejercitar.
  test('con vulnerabilidades ya cargadas en memoria, compara sin consultar el repositorio', async () => {
    const dataset = [
      new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí'), undefined, 'Apache Log4j', 'Log4Shell'),
      new Vulnerabilidad('2', new IdentificadorCVE('CVE-2021-35587'), new CvssScore(9.8), 'OpenSSL', new TipoAccesoValue('No'), undefined, 'OpenSSL', 'RCE'),
      new Vulnerabilidad('3', new IdentificadorCVE('CVE-2021-34527'), new CvssScore(7.8), 'Microsoft Windows', new TipoAccesoValue('Sí'), undefined, 'Microsoft Windows', 'EoP'),
      new Vulnerabilidad('4', new IdentificadorCVE('CVE-2021-20021'), new CvssScore(5.5), 'Nginx', new TipoAccesoValue('No'), undefined, 'Nginx', 'DoS')
    ];

    const repo: VulnerabilidadRepository = {
      guardar: jest.fn(),
      guardarLote: jest.fn(),
      contar: jest.fn(),
      listar: jest.fn(),
      buscarPorCve: jest.fn(),
      filtrarPorRangoCvss: jest.fn(),
      filtrarPorSeveridad: jest.fn(),
      filtrarPorRango: jest.fn(),
      filtrarPorCategoria: jest.fn(),
      listarPorTipoAcceso: jest.fn(),
      listarPorTipoVulnerabilidad: jest.fn(),
      listarSoftwareDisponible: jest.fn(),
      listarPorSoftware: jest.fn(),
      actualizarEstado: jest.fn(),
      buscarConFiltros: jest.fn(),
      eliminarTodas: jest.fn()
    };

    const usecase = new CompararPorTipoAcceso(repo);
    const resultado = await usecase.ejecutar('analista-1', dataset);

    expect(repo.listarPorTipoAcceso).not.toHaveBeenCalled();
    expect(resultado).toEqual({
      mediaA: 8.9,
      mediaB: 7.65,
      categoriaConMayorPromedio: 'Remoto',
      diferenciaMedias: 1.25,
      sdA: 1.5556349186104046,
      sdB: 3.040559159102155
    });
  });
});
