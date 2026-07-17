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
      contar: jest.fn().mockResolvedValue(0),
      listar: jest.fn().mockResolvedValue([]),
      buscarPorCve: jest.fn().mockResolvedValue(null),
      filtrarPorRangoCvss: jest.fn().mockResolvedValue([]),
      filtrarPorSeveridad: jest.fn().mockResolvedValue([]),
      listarPorTipoAcceso: jest.fn().mockResolvedValue([]),
      listarPorTipoVulnerabilidad: jest.fn().mockResolvedValue([]),
      listarPorSoftware: jest.fn().mockResolvedValue([]),
      actualizarEstado: jest.fn().mockResolvedValue(undefined),
      buscarConFiltros: jest.fn().mockResolvedValue([])
    };

    const usecase = new ImportarDataset(repo);
    const resultado = await usecase.ejecutar({
      importables: [
        {
          vulnerabilidad: new Vulnerabilidad('1', new IdentificadorCVE('CVE-2024-00001'), new CvssScore(7.8), 'desc', new TipoAccesoValue('Sí')),
          fuente: 'excel'
        }
      ],
      rechazadas: [{ fila: 2, error: 'CVSS fuera de rango' }],
      errores: ['CVSS fuera de rango']
    });

    expect(resultado.importados).toBe(1);
    expect(resultado.rechazados).toBe(1);
    expect(resultado.errores).toContain('CVSS fuera de rango');
  });
});
