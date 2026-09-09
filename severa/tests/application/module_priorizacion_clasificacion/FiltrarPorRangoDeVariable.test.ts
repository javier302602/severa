import { FiltrarPorRangoDeVariable } from '../../../src/application/usecases/module_priorizacion_clasificacion/FiltrarPorRangoDeVariable';
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
    filtrarPorRango: jest.fn().mockResolvedValue(resultados),
    filtrarPorCategoria: jest.fn(),
    listarPorTipoAcceso: jest.fn(),
    listarPorTipoVulnerabilidad: jest.fn(),
    listarPorSoftware: jest.fn(),
    listarSoftwareDisponible: jest.fn(),
    actualizarEstado: jest.fn(),
    buscarConFiltros: jest.fn(),
    eliminarTodas: jest.fn()
  };
}

// M-04 (retoma, RF-27): filtrarPorRangoCvss ya NO se usa desde acá — sigue
// existiendo en el puerto solo porque GenerarRankingUrgencia.ts (M-08, fuera
// de esta ronda) usa filtrarPorSeveridad; filtrarPorRangoCvss en particular
// no tiene otro consumidor, pero se deja igual por si acaso, sin tocarla.
describe('FiltrarPorRangoDeVariable', () => {
  test('sin variable explícita, delega en filtrarPorRango con "cvssScore" (RETROCOMPATIBILIDAD, M-04 retoma)', async () => {
    const vulnerabilidad = new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(9.0), 'Apache Log4j');
    const repository = repositorioFalso([vulnerabilidad]);
    const usecase = new FiltrarPorRangoDeVariable(repository);

    const resultado = await usecase.ejecutar(7.0, 10.0, 'analista-A');

    expect(repository.filtrarPorRango).toHaveBeenCalledWith('cvssScore', 7.0, 10.0, 'analista-A');
    expect(resultado).toEqual([vulnerabilidad]);
  });

  test('con variable="diasParaParche" explícita, delega en filtrarPorRango con esa variable', async () => {
    const repository = repositorioFalso([]);
    const usecase = new FiltrarPorRangoDeVariable(repository);

    await usecase.ejecutar(0, 30, 'analista-A', 'diasParaParche');

    expect(repository.filtrarPorRango).toHaveBeenCalledWith('diasParaParche', 0, 30, 'analista-A');
  });

  test('devuelve un array vacío si no hay coincidencias en el rango', async () => {
    const repository = repositorioFalso([]);
    const usecase = new FiltrarPorRangoDeVariable(repository);

    const resultado = await usecase.ejecutar(0.1, 0.5, 'analista-A');

    expect(resultado).toEqual([]);
  });
});
