import { MarcarEnProcesoDeRemediacion } from '../../src/application/usecases/MarcarEnProcesoDeRemediacion';
import { VulnerabilidadRepository } from '../../src/application/ports/out/VulnerabilidadRepository';
import { Vulnerabilidad } from '../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../src/domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../src/domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../src/domain/value-objects/TipoAcceso';

function repoFalso(vulnerabilidad: Vulnerabilidad | null): VulnerabilidadRepository {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    guardarLote: jest.fn().mockResolvedValue(undefined),
    contar: jest.fn().mockResolvedValue(0),
    listar: jest.fn().mockResolvedValue([]),
    buscarPorCve: jest.fn().mockResolvedValue(vulnerabilidad),
    filtrarPorRangoCvss: jest.fn().mockResolvedValue([]),
    filtrarPorSeveridad: jest.fn().mockResolvedValue([]),
    listarPorTipoAcceso: jest.fn().mockResolvedValue([]),
    listarPorTipoVulnerabilidad: jest.fn().mockResolvedValue([]),
    listarSoftwareDisponible: jest.fn().mockResolvedValue([]),
    listarPorSoftware: jest.fn().mockResolvedValue([]),
    actualizarEstado: jest.fn().mockResolvedValue(undefined),
    buscarConFiltros: jest.fn().mockResolvedValue([]),
    eliminarTodas: jest.fn().mockResolvedValue(0)
  };
}

describe('MarcarEnProcesoDeRemediacion', () => {
  test('transición válida: Pendiente -> EnProceso', async () => {
    const vulnerabilidad = new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí'));
    const repo = repoFalso(vulnerabilidad);
    const usecase = new MarcarEnProcesoDeRemediacion(repo);

    const resultado = await usecase.ejecutar('CVE-2021-44228', 'analista-1');

    expect(resultado?.estadoRemediacion.valor).toBe('EnProceso');
    expect(repo.actualizarEstado).toHaveBeenCalledWith('CVE-2021-44228', 'EnProceso', 'analista-1', undefined);
  });

  test('devuelve null si la vulnerabilidad no existe', async () => {
    const repo = repoFalso(null);
    const usecase = new MarcarEnProcesoDeRemediacion(repo);

    const resultado = await usecase.ejecutar('CVE-9999-99999', 'analista-1');

    expect(resultado).toBeNull();
    expect(repo.actualizarEstado).not.toHaveBeenCalled();
  });
});
