import ExcelJS from 'exceljs';
import { ExportarBusquedaFiltrada } from '../../../src/application/usecases/module_busqueda_filtros_avanzados/ExportarBusquedaFiltrada';
import { VulnerabilidadRepository } from '../../../src/application/ports/out/persistencia/repositorios/VulnerabilidadRepository';
import { Vulnerabilidad } from '../../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../../src/domain/shared/value-objects/IdentificadorCVE';
import { CvssScore } from '../../../src/domain/shared/value-objects/CvssScore';
import { TipoAccesoValue } from '../../../src/domain/shared/value-objects/TipoAcceso';
import { FiltroVulnerabilidad } from '../../../src/domain/shared/value-objects/FiltroVulnerabilidad';
import { EscalaDeClasificacion } from '../../../src/domain/shared/value-objects/EscalaDeClasificacion';
import { ExportadorExcelAgrupado } from '../../../src/infrastructure/adapters/out/dataset/parsers/ExportadorExcelAgrupado';
import { EscalaDeClasificacionRepositoryEnMemoria } from '../../dobles/EscalaDeClasificacionRepositoryEnMemoria';

function repositorioFalso(resultados: Vulnerabilidad[]): jest.Mocked<VulnerabilidadRepository> {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    guardarLote: jest.fn().mockResolvedValue(undefined),
    contar: jest.fn().mockResolvedValue(0),
    listar: jest.fn().mockResolvedValue([]),
    buscarPorCve: jest.fn().mockResolvedValue(null),
    filtrarPorRangoCvss: jest.fn().mockResolvedValue([]),
    filtrarPorSeveridad: jest.fn().mockResolvedValue([]),
    filtrarPorNivelDeRiesgo: jest.fn().mockResolvedValue([]),
    filtrarPorRango: jest.fn(),
    filtrarPorCategoria: jest.fn(),
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
    const usecase = new ExportarBusquedaFiltrada(repository, new EscalaDeClasificacionRepositoryEnMemoria(), new ExportadorExcelAgrupado());
    const filtro = new FiltroVulnerabilidad({ cvssMin: 9.0, componente: 'Apache Log4j' });

    const buffer = await usecase.ejecutar(filtro, 'analista-1');

    expect(repository.buscarConFiltros).toHaveBeenCalledWith(filtro, 'analista-1', EscalaDeClasificacion.CVSS);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer as any);
    // Fila 1: la escala; fila 3: título del bloque; fila 4: encabezado; fila 5: el dato.
    expect(libro.worksheets[0].getRow(5).getCell(1).value).toBe('CVE-2021-44228');
  });

  test('sin resultados, igual devuelve un .xlsx válido', async () => {
    const repository = repositorioFalso([]);
    const usecase = new ExportarBusquedaFiltrada(repository, new EscalaDeClasificacionRepositoryEnMemoria(), new ExportadorExcelAgrupado());
    const filtro = new FiltroVulnerabilidad({ cve: 'CVE-2099-00000' });

    const buffer = await usecase.ejecutar(filtro, 'analista-1');

    const libro = new ExcelJS.Workbook();
    await expect(libro.xlsx.load(buffer as any)).resolves.not.toThrow();
  });

  test('RF-28 / RF-69: filtra y agrupa con la MISMA escala, la vigente del analista, y el archivo la nombra', async () => {
    const ochoSiete = new Vulnerabilidad('5', new IdentificadorCVE('CVE-2021-08700'), new CvssScore(8.7), 'Router', new TipoAccesoValue('Sí'));
    const repository = repositorioFalso([ochoSiete]);
    const escalas = new EscalaDeClasificacionRepositoryEnMemoria();
    const propia = EscalaDeClasificacion.personalizada({ moderado: 4, alto: 7, critico: 8.5 });
    await escalas.guardar('analista-1', propia);
    const usecase = new ExportarBusquedaFiltrada(repository, escalas, new ExportadorExcelAgrupado());
    const filtro = new FiltroVulnerabilidad({ severidad: 'Crítico' });

    const buffer = await usecase.ejecutar(filtro, 'analista-1');

    expect(repository.buscarConFiltros).toHaveBeenCalledWith(filtro, 'analista-1', propia);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer as any);
    const hoja = libro.worksheets[0];
    expect(hoja.getRow(1).getCell(1).value).toBe('Niveles de riesgo según: ' + propia.describir());
    expect(String(hoja.getRow(3).getCell(1).value)).toBe('NIVEL DE RIESGO: CRÍTICO (1 vulnerabilidades)');
  });
});
