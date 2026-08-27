import ExcelJS from 'exceljs';
import { ExportarDatasetValidado } from '../../src/application/usecases/ExportarDatasetValidado';
import { VulnerabilidadRepository } from '../../src/application/ports/out/VulnerabilidadRepository';
import { Vulnerabilidad } from '../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../src/domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../src/domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../src/domain/value-objects/TipoAcceso';

function repositorioFalso(resultados: Vulnerabilidad[]): VulnerabilidadRepository {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    guardarLote: jest.fn().mockResolvedValue(undefined),
    contar: jest.fn().mockResolvedValue(0),
    listar: jest.fn().mockResolvedValue(resultados),
    buscarPorCve: jest.fn().mockResolvedValue(null),
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

// Bug real reportado: la descarga del dataset completo era una lista plana
// (3 columnas, sin encabezado), y después "un solo cuadro sin separación
// visual". Ahora exporta un .xlsx real agrupado por severidad, con color y
// celdas fusionadas (ver el detalle de contenido en
// tests/infrastructure/ExportadorExcelAgrupado.test.ts — acá solo se
// confirma que este usecase pide los datos correctos y devuelve un .xlsx
// real y válido).
describe('ExportarDatasetValidado', () => {
  test('lista TODO el catálogo del analista y devuelve un .xlsx real, válido', async () => {
    const dataset = [
      new Vulnerabilidad('1', new IdentificadorCVE('CVE-2021-44228'), new CvssScore(10.0), 'Apache Log4j', new TipoAccesoValue('Sí'))
    ];
    const repository = repositorioFalso(dataset);
    const usecase = new ExportarDatasetValidado(repository);

    const buffer = await usecase.ejecutar('analista-1');

    expect(repository.listar).toHaveBeenCalledWith('analista-1');
    expect(buffer.subarray(0, 2).toString()).toBe('PK'); // firma de archivo .xlsx (zip)

    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(buffer as any);
    expect(libro.worksheets[0].getRow(3).getCell(1).value).toBe('CVE-2021-44228');
  });

  test('catálogo vacío igual devuelve un .xlsx válido (sin bloques)', async () => {
    const usecase = new ExportarDatasetValidado(repositorioFalso([]));

    const buffer = await usecase.ejecutar('analista-1');

    const libro = new ExcelJS.Workbook();
    await expect(libro.xlsx.load(buffer as any)).resolves.not.toThrow();
  });
});
