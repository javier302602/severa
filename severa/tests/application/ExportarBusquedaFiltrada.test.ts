import ExcelJS from 'exceljs';
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
    guardarLote: jest.fn().mockResolvedValue(undefined),
    contar: jest.fn().mockResolvedValue(0),
    listar: jest.fn().mockResolvedValue([]),
    buscarPorCve: jest.fn().mockResolvedValue(null),
    filtrarPorRangoCvss: jest.fn().mockResolvedValue([]),
    filtrarPorSeveridad: jest.fn().mockResolvedValue([]),
    listarPorTipoAcceso: jest.fn().mockResolvedValue([]),
    listarPorTipoVulnerabilidad: jest.fn().mockResolvedValue([]),
    listarSoftwareDisponible: jest.fn().mockResolvedValue([]),
    listarPorSoftware: jest.fn().mockResolvedValue([]),
    actualizarEstado: jest.fn().mockResolvedValue(undefined),
    buscarConFiltros: jest.fn().mockResolvedValue(resultados),
    eliminarTodas: jest.fn().mockResolvedValue(0)
  };
}

describe('ExportarBusquedaFiltrada', () => {
  test('llama a buscarConFiltros con el filtro dado y exporta un .xlsx real de ese subconjunto', async () => {
    const resultados = [
      new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí'))
    ];
    const repository = repositorioFalso(resultados);
    const usecase = new ExportarBusquedaFiltrada(repository);
    const filtro = new FiltroVulnerabilidad({ cvssMin: 9.0, componente: 'Apache Log4j' });

    const buffer = await usecase.ejecutar(filtro, 'analista-1');

    expect(repository.buscarConFiltros).toHaveBeenCalledWith(filtro, 'analista-1');
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer as any);
    expect(libro.worksheets[0].getRow(3).getCell(1).value).toBe('CVE-2021-44228');
  });

  test('sin resultados, igual devuelve un .xlsx válido', async () => {
    const repository = repositorioFalso([]);
    const usecase = new ExportarBusquedaFiltrada(repository);
    const filtro = new FiltroVulnerabilidad({ cve: 'CVE-2099-00000' });

    const buffer = await usecase.ejecutar(filtro, 'analista-1');

    const libro = new ExcelJS.Workbook();
    await expect(libro.xlsx.load(buffer as any)).resolves.not.toThrow();
  });
});
