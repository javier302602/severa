import * as XLSX from 'xlsx';
import { ImportarDataset } from '../../src/application/usecases/ImportarDataset';
import { VulnerabilidadRepository } from '../../src/application/ports/out/VulnerabilidadRepository';
import { Vulnerabilidad } from '../../src/domain/entities/Vulnerabilidad';
import { IdentificadorCVE } from '../../src/domain/value-objects/IdentificadorCVE';
import { CvssScore } from '../../src/domain/value-objects/CvssScore';
import { TipoAccesoValue } from '../../src/domain/value-objects/TipoAcceso';

describe('ImportarDataset', () => {
  test('devuelve resumen de importación con importados y rechazados', async () => {
    const repo: VulnerabilidadRepository = {
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
      buscarConFiltros: jest.fn().mockResolvedValue([]),
      eliminarTodas: jest.fn().mockResolvedValue(0)
    };

    const usecase = new ImportarDataset(repo);
    const resultado = await usecase.ejecutar(
      {
        importables: [
          {
            vulnerabilidad: new Vulnerabilidad('1', new IdentificadorCVE('CVE-2024-00001'), new CvssScore(7.8), 'desc', new TipoAccesoValue('Sí')),
            fuente: 'excel'
          }
        ],
        rechazadas: [{ fila: 2, error: 'CVSS fuera de rango', datos: { CVE: 'CVE-2024-99999', 'CVSS Score': '99' } }],
        errores: ['CVSS fuera de rango']
      },
      'analista-1'
    );

    expect(resultado.importados).toBe(1);
    expect(resultado.rechazados).toBe(1);
    expect(resultado.errores).toContain('CVSS fuera de rango');
    expect(repo.guardarLote).toHaveBeenCalledWith([expect.objectContaining({ analistaId: 'analista-1' })]);

    // Excel de descartados (2026-07-18): se genera automáticamente cuando
    // hay al menos una fila rechazada, con las columnas originales +
    // "Motivo del rechazo".
    expect(resultado.excelDescartadosBase64).not.toBeNull();
    const libro = XLSX.read(Buffer.from(resultado.excelDescartadosBase64 as string, 'base64'), { type: 'buffer' });
    const filas = XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]]);
    expect(filas).toEqual([
      { Fila: 2, CVE: 'CVE-2024-99999', 'CVSS Score': '99', 'Motivo del rechazo': 'CVSS fuera de rango' }
    ]);
  });

  test('sin filas rechazadas, excelDescartadosBase64 es null (no se genera un Excel vacío)', async () => {
    const repo: VulnerabilidadRepository = {
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
      buscarConFiltros: jest.fn().mockResolvedValue([]),
      eliminarTodas: jest.fn().mockResolvedValue(0)
    };
    const usecase = new ImportarDataset(repo);

    const resultado = await usecase.ejecutar({ importables: [], rechazadas: [] }, 'analista-1');

    expect(resultado.excelDescartadosBase64).toBeNull();
  });

  // Inserción por lotes (2026-07-17): con más de 1000 importables, debe
  // llamar guardarLote() más de una vez (nunca junta TODO en una sola
  // llamada, ni vuelve a llamar guardar() fila por fila).
  test('con más de 1000 importables, inserta en varios lotes de guardarLote()', async () => {
    const repo: VulnerabilidadRepository = {
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
      buscarConFiltros: jest.fn().mockResolvedValue([]),
      eliminarTodas: jest.fn().mockResolvedValue(0)
    };

    const TOTAL_FILAS = 2500;
    const importables = Array.from({ length: TOTAL_FILAS }, (_, i) => ({
      vulnerabilidad: new Vulnerabilidad(
        String(i),
        new IdentificadorCVE(`CVE-2024-${String(10000 + i)}`),
        new CvssScore(5.0),
        'desc',
        new TipoAccesoValue('No')
      ),
      fuente: 'excel'
    }));

    const usecase = new ImportarDataset(repo);
    const resultado = await usecase.ejecutar({ importables, rechazadas: [] }, 'analista-1');

    expect(resultado.importados).toBe(TOTAL_FILAS);
    expect(repo.guardar).not.toHaveBeenCalled();
    // 2500 filas / 1000 por lote = 3 llamadas (1000 + 1000 + 500).
    expect(repo.guardarLote).toHaveBeenCalledTimes(3);
    expect((repo.guardarLote as jest.Mock).mock.calls[0][0]).toHaveLength(1000);
    expect((repo.guardarLote as jest.Mock).mock.calls[1][0]).toHaveLength(1000);
    expect((repo.guardarLote as jest.Mock).mock.calls[2][0]).toHaveLength(500);
  });
});
