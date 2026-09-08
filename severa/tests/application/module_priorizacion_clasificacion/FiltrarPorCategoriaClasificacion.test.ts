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
    filtrarPorSeveridad: jest.fn().mockResolvedValue(resultados),
    listarPorTipoAcceso: jest.fn(),
    listarPorTipoVulnerabilidad: jest.fn(),
    listarPorSoftware: jest.fn(),
    listarSoftwareDisponible: jest.fn(),
    actualizarEstado: jest.fn(),
    buscarConFiltros: jest.fn(),
    eliminarTodas: jest.fn()
  };
}

describe('FiltrarPorCategoriaClasificacion', () => {
  test('delega en filtrarPorSeveridad con la categoría y analistaId recibidos', async () => {
    const vulnerabilidad = new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(9.5), 'Apache Log4j');
    const repository = repositorioFalso([vulnerabilidad]);
    const usecase = new FiltrarPorCategoriaClasificacion(repository);

    const resultado = await usecase.ejecutar('Crítica', 'analista-A');

    expect(repository.filtrarPorSeveridad).toHaveBeenCalledWith('Crítica', 'analista-A');
    expect(resultado).toEqual([vulnerabilidad]);
  });

  test('devuelve un array vacío si no hay coincidencias en la categoría', async () => {
    const repository = repositorioFalso([]);
    const usecase = new FiltrarPorCategoriaClasificacion(repository);

    const resultado = await usecase.ejecutar('Baja', 'analista-A');

    expect(resultado).toEqual([]);
  });
});
