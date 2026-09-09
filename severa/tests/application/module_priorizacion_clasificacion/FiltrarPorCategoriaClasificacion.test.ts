import { FiltrarPorCategoriaClasificacion } from '../../../src/application/usecases/module_priorizacion_clasificacion/FiltrarPorCategoriaClasificacion';
import { VulnerabilidadRepository } from '../../../src/application/ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { Vulnerabilidad } from '../../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../../src/domain/shared/value-objects/IdentificadorCVE';
import { CvssScore } from '../../../src/domain/shared/value-objects/CvssScore';

function repositorioFalso(resultados: Vulnerabilidad[]): VulnerabilidadRepository {
  return {
    guardar: jest.fn(),
    guardarLote: jest.fn(),
    contar: jest.fn(),
    listar: jest.fn(),
    buscarPorCve: jest.fn(),
    filtrarPorRangoCvss: jest.fn(),
    filtrarPorSeveridad: jest.fn(),
    filtrarPorRango: jest.fn(),
    filtrarPorCategoria: jest.fn().mockResolvedValue(resultados),
    listarPorTipoAcceso: jest.fn(),
    listarPorTipoVulnerabilidad: jest.fn(),
    listarPorSoftware: jest.fn(),
    listarSoftwareDisponible: jest.fn(),
    actualizarEstado: jest.fn(),
    buscarConFiltros: jest.fn(),
    eliminarTodas: jest.fn()
  };
}

// M-04 (retoma, RF-28): filtrarPorSeveridad ya NO se usa desde acá — sigue
// existiendo en el puerto porque GenerarRankingUrgencia.ts (M-08, fuera de
// esta ronda) la sigue usando para su propia optimización de carga.
describe('FiltrarPorCategoriaClasificacion', () => {
  test('sin variable explícita, delega en filtrarPorCategoria con "severidad" (RETROCOMPATIBILIDAD, M-04 retoma)', async () => {
    const vulnerabilidad = new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(9.5), 'Apache Log4j');
    const repository = repositorioFalso([vulnerabilidad]);
    const usecase = new FiltrarPorCategoriaClasificacion(repository);

    const resultado = await usecase.ejecutar('Crítica', 'analista-A');

    expect(repository.filtrarPorCategoria).toHaveBeenCalledWith('severidad', 'Crítica', 'analista-A');
    expect(resultado).toEqual([vulnerabilidad]);
  });

  test('con variable="tipoAcceso" explícita, delega en filtrarPorCategoria con esa variable', async () => {
    const repository = repositorioFalso([]);
    const usecase = new FiltrarPorCategoriaClasificacion(repository);

    await usecase.ejecutar('Remoto', 'analista-A', 'tipoAcceso');

    expect(repository.filtrarPorCategoria).toHaveBeenCalledWith('tipoAcceso', 'Remoto', 'analista-A');
  });

  test('con variable="estadoRemediacion" explícita, delega en filtrarPorCategoria con esa variable', async () => {
    const repository = repositorioFalso([]);
    const usecase = new FiltrarPorCategoriaClasificacion(repository);

    await usecase.ejecutar('Pendiente', 'analista-A', 'estadoRemediacion');

    expect(repository.filtrarPorCategoria).toHaveBeenCalledWith('estadoRemediacion', 'Pendiente', 'analista-A');
  });

  test('devuelve un array vacío si no hay coincidencias en la categoría', async () => {
    const repository = repositorioFalso([]);
    const usecase = new FiltrarPorCategoriaClasificacion(repository);

    const resultado = await usecase.ejecutar('Baja', 'analista-A');

    expect(resultado).toEqual([]);
  });
});
