import { AnalizarDatasetGenericoConAuditoria } from '../../../../src/application/usecases/module_seguridad_auditoria/decoradores/AnalizarDatasetGenericoConAuditoria';
import { AnalizarDatasetGenericoUseCase } from '../../../../src/application/ports/in/module_carga_gestion_datasets/AnalizarDatasetGenericoUseCase';
import { AuditoriaRepository } from '../../../../src/application/ports/out/persistencia/repositorios/AuditoriaRepository';

function auditoriaFalsa(): AuditoriaRepository {
  return {
    registrar: jest.fn().mockResolvedValue(undefined),
    listar: jest.fn().mockResolvedValue([])
  };
}

describe('AnalizarDatasetGenericoConAuditoria', () => {
  test('audita con el detalle correcto tras un análisis exitoso', async () => {
    const auditoriaRepository = auditoriaFalsa();
    const usecase: AnalizarDatasetGenericoUseCase = {
      ejecutar: jest.fn().mockResolvedValue({
        diagnostico: { totalFilas: 10, filasDuplicadas: 2, columnas: [{}, {}] },
        sesionId: 'sesion-1',
        datasetId: 'dataset-1'
      })
    };

    const decorator = new AnalizarDatasetGenericoConAuditoria(usecase, auditoriaRepository);
    const resultado = await decorator.ejecutar('/tmp/archivo.xlsx', 'analista-A', 'ventas.xlsx');

    expect(resultado.datasetId).toBe('dataset-1');
    expect(auditoriaRepository.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        usuario: 'analista-A',
        accion: 'ImportarDatasetGenerico',
        detalle: expect.stringContaining('10 fila(s), 2 columna(s), 2 duplicada(s) (archivo: ventas.xlsx)')
      })
    );
  });

  test('sin duplicados, el detalle no menciona duplicadas', async () => {
    const auditoriaRepository = auditoriaFalsa();
    const usecase: AnalizarDatasetGenericoUseCase = {
      ejecutar: jest.fn().mockResolvedValue({
        diagnostico: { totalFilas: 5, filasDuplicadas: 0, columnas: [{}] },
        sesionId: 'sesion-1',
        datasetId: 'dataset-1'
      })
    };

    const decorator = new AnalizarDatasetGenericoConAuditoria(usecase, auditoriaRepository);
    await decorator.ejecutar('/tmp/archivo.xlsx', 'analista-A', 'ventas.xlsx');

    expect(auditoriaRepository.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ detalle: '5 fila(s), 1 columna(s) (archivo: ventas.xlsx)' })
    );
  });

  test('NO audita si el caso base falla (propaga el error tal cual)', async () => {
    const auditoriaRepository = auditoriaFalsa();
    const usecase: AnalizarDatasetGenericoUseCase = {
      ejecutar: jest.fn().mockRejectedValue(new Error('El archivo no contiene ninguna hoja'))
    };

    const decorator = new AnalizarDatasetGenericoConAuditoria(usecase, auditoriaRepository);

    await expect(decorator.ejecutar('/tmp/archivo.xlsx', 'analista-A', 'roto.xlsx')).rejects.toThrow(
      'El archivo no contiene ninguna hoja'
    );
    expect(auditoriaRepository.registrar).not.toHaveBeenCalled();
  });
});
