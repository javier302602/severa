import { ExportarBusquedaFiltrada } from '../../src/application/usecases/ExportarBusquedaFiltrada';
import { VulnerabilidadRepository } from '../../src/application/ports/out/VulnerabilidadRepository';
import { Vulnerabilidad } from '../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../src/domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../src/domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../src/domain/value-objects/TipoAcceso';
import { FiltroVulnerabilidad } from '../../src/domain/value-objects/FiltroVulnerabilidad';

function repositorioFalso(resultados: Vulnerabilidad[]): VulnerabilidadRepository {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    contar: jest.fn().mockResolvedValue(0),
    listar: jest.fn().mockResolvedValue([]),
    buscarPorCve: jest.fn().mockResolvedValue(null),
    filtrarPorRangoCvss: jest.fn().mockResolvedValue([]),
    filtrarPorSeveridad: jest.fn().mockResolvedValue([]),
    listarPorTipoAcceso: jest.fn().mockResolvedValue([]),
    listarPorTipoVulnerabilidad: jest.fn().mockResolvedValue([]),
    listarPorSoftware: jest.fn().mockResolvedValue([]),
    actualizarEstado: jest.fn().mockResolvedValue(undefined),
    buscarConFiltros: jest.fn().mockResolvedValue(resultados)
  };
}

describe('ExportarBusquedaFiltrada', () => {
  test('llama a buscarConFiltros con el filtro dado y exporta solo ese subconjunto en el mismo formato CSV de ExportarDatasetValidado', async () => {
    const resultados = [
      new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí'))
    ];
    const repository = repositorioFalso(resultados);
    const usecase = new ExportarBusquedaFiltrada(repository);
    const filtro = new FiltroVulnerabilidad({ cvssMin: 9.0, componente: 'Apache Log4j' });

    const csv = await usecase.ejecutar(filtro);

    expect(repository.buscarConFiltros).toHaveBeenCalledWith(filtro);
    expect(csv).toBe('CVE-2021-44228,10,Apache Log4j');
  });

  test('devuelve cadena vacía cuando el filtro no arroja resultados', async () => {
    const repository = repositorioFalso([]);
    const usecase = new ExportarBusquedaFiltrada(repository);
    const filtro = new FiltroVulnerabilidad({ cve: 'CVE-2099-00000' });

    const csv = await usecase.ejecutar(filtro);

    expect(csv).toBe('');
  });
});
