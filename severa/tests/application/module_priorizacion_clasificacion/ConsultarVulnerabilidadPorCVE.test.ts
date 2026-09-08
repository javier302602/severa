import { ConsultarVulnerabilidadPorCVE } from '../../../src/application/usecases/module_priorizacion_clasificacion/ConsultarVulnerabilidadPorCVE';
import { VulnerabilidadRepository } from '../../../src/application/ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { Vulnerabilidad } from '../../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../../src/domain/shared/value-objects/IdentificadorCVE';
import { CvssScore } from '../../../src/domain/shared/value-objects/CvssScore';

function repositorioFalso(resultado: Vulnerabilidad | null): VulnerabilidadRepository {
  return {
    guardar: jest.fn(),
    guardarLote: jest.fn(),
    contar: jest.fn(),
    listar: jest.fn(),
    buscarPorCve: jest.fn().mockResolvedValue(resultado),
    filtrarPorRangoCvss: jest.fn(),
    filtrarPorSeveridad: jest.fn(),
    listarPorTipoAcceso: jest.fn(),
    listarPorTipoVulnerabilidad: jest.fn(),
    listarPorSoftware: jest.fn(),
    listarSoftwareDisponible: jest.fn(),
    actualizarEstado: jest.fn(),
    buscarConFiltros: jest.fn(),
    eliminarTodas: jest.fn()
  };
}

describe('ConsultarVulnerabilidadPorCVE', () => {
  test('devuelve la vulnerabilidad cuando el repositorio la encuentra, scopeada al analistaId recibido', async () => {
    const vulnerabilidad = new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j');
    const repository = repositorioFalso(vulnerabilidad);
    const usecase = new ConsultarVulnerabilidadPorCVE(repository);

    const resultado = await usecase.ejecutar('CVE-2021-44228', 'analista-A');

    expect(repository.buscarPorCve).toHaveBeenCalledWith('CVE-2021-44228', 'analista-A');
    expect(resultado).toBe(vulnerabilidad);
  });

  test('devuelve null cuando el repositorio no encuentra el CVE (o pertenece a otro analista)', async () => {
    const repository = repositorioFalso(null);
    const usecase = new ConsultarVulnerabilidadPorCVE(repository);

    const resultado = await usecase.ejecutar('CVE-9999-99999', 'analista-A');

    expect(resultado).toBeNull();
  });
});
