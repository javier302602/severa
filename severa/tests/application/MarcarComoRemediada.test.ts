import { MarcarComoRemediada } from '../../src/application/usecases/MarcarComoRemediada';
import { VulnerabilidadRepository } from '../../src/application/ports/out/VulnerabilidadRepository';
import { Vulnerabilidad } from '../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../src/domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../src/domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../src/domain/value-objects/TipoAcceso';
import { EstadoRemediacionValue } from '../../src/domain/value-objects/EstadoRemediacion';
import { TransicionDeEstadoInvalidaError } from '../../src/domain/errors/TransicionDeEstadoInvalidaError';

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

describe('MarcarComoRemediada', () => {
  test('transición válida: EnProceso -> Remediada, registra la fecha de remediación', async () => {
    const enProceso = new Vulnerabilidad(
      '1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j',
      new TipoAccesoValue('Sí'), undefined, undefined, undefined, new EstadoRemediacionValue('EnProceso')
    );
    const repo = repoFalso(enProceso);
    const usecase = new MarcarComoRemediada(repo);

    const resultado = await usecase.ejecutar('CVE-2021-44228', 'analista-1');

    expect(resultado?.estadoRemediacion.valor).toBe('Remediada');
    expect(resultado?.fechaRemediacion).toBeInstanceOf(Date);
    expect(repo.actualizarEstado).toHaveBeenCalledWith('CVE-2021-44228', 'Remediada', 'analista-1', expect.any(Date));
  });

  test('transición inválida: Pendiente -> Remediada directo lanza TransicionDeEstadoInvalidaError y no persiste', async () => {
    const pendiente = new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí'));
    const repo = repoFalso(pendiente);
    const usecase = new MarcarComoRemediada(repo);

    await expect(usecase.ejecutar('CVE-2021-44228', 'analista-1')).rejects.toThrow(TransicionDeEstadoInvalidaError);
    expect(repo.actualizarEstado).not.toHaveBeenCalled();
  });

  test('devuelve null si la vulnerabilidad no existe', async () => {
    const repo = repoFalso(null);
    const usecase = new MarcarComoRemediada(repo);

    const resultado = await usecase.ejecutar('CVE-9999-99999', 'analista-1');

    expect(resultado).toBeNull();
  });
});
