import { ClasificarRiesgo } from '../../../src/application/usecases/module_priorizacion_clasificacion/ClasificarRiesgo';
import { VulnerabilidadRepository } from '../../../src/application/ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { Vulnerabilidad } from '../../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../../src/domain/shared/value-objects/IdentificadorCVE';
import { CvssScore } from '../../../src/domain/shared/value-objects/CvssScore';
import { TipoAccesoValue } from '../../../src/domain/shared/value-objects/TipoAcceso';
import { EscalaDeClasificacionRepositoryEnMemoria } from '../../dobles/EscalaDeClasificacionRepositoryEnMemoria';
import { EscalaDeClasificacion } from '../../../src/domain/shared/value-objects/EscalaDeClasificacion';

function repoFalso(vulnerabilidad: Vulnerabilidad | null): VulnerabilidadRepository {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    guardarLote: jest.fn().mockResolvedValue(undefined),
    contar: jest.fn().mockResolvedValue(0),
    listar: jest.fn().mockResolvedValue([]),
    buscarPorCve: jest.fn().mockResolvedValue(vulnerabilidad),
    filtrarPorRangoCvss: jest.fn().mockResolvedValue([]),
    filtrarPorNivelDeRiesgo: jest.fn().mockResolvedValue([]),
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

describe('ClasificarRiesgo', () => {
  test('clasifica el CVSS de una vulnerabilidad existente', async () => {
    const vulnerabilidad = new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí'));
    const usecase = new ClasificarRiesgo(repoFalso(vulnerabilidad), new EscalaDeClasificacionRepositoryEnMemoria());

    await expect(usecase.ejecutar('CVE-2021-44228', 'analista-1')).resolves.toBe('Crítico');
  });

  test('devuelve null si el CVE no existe', async () => {
    const usecase = new ClasificarRiesgo(repoFalso(null), new EscalaDeClasificacionRepositoryEnMemoria());

    await expect(usecase.ejecutar('CVE-9999-99999', 'analista-1')).resolves.toBeNull();
  });

  test('RF-69 + RF-28: clasifica con la escala del analista', async () => {
    const ochoSiete = new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-08700'), new CvssScore(8.7), 'Router', new TipoAccesoValue('Sí'));
    const escalas = new EscalaDeClasificacionRepositoryEnMemoria();
    const usecase = new ClasificarRiesgo(repoFalso(ochoSiete), escalas);

    await expect(usecase.ejecutar('CVE-2021-08700', 'analista-1')).resolves.toBe('Alto');
    await escalas.guardar('analista-1', EscalaDeClasificacion.personalizada({ moderado: 4, alto: 7, critico: 8.5 }));
    await expect(usecase.ejecutar('CVE-2021-08700', 'analista-1')).resolves.toBe('Crítico');
  });
});
