import { AnalizarDatasetGenericoConAuditoria } from '../../../../src/application/usecases/module_seguridad_auditoria/decoradores/AnalizarDatasetGenericoConAuditoria';
import { AnalizarDatasetGenericoUseCase } from '../../../../src/application/ports/in/module_carga_gestion_datasets/AnalizarDatasetGenericoUseCase';
import { AuditoriaRepository } from '../../../../src/application/ports/out/persistencia/repositorios/AuditoriaRepository';
import { historialFalso } from '../../../dobles/HistorialAnalisisRepositoryEnMemoria';

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

    const historial = historialFalso();
    const decorator = new AnalizarDatasetGenericoConAuditoria(usecase, auditoriaRepository, historial);
    const resultado = await decorator.ejecutar('/tmp/archivo.xlsx', 'analista-A', 'ventas.xlsx');

    expect(resultado.datasetId).toBe('dataset-1');
    // RF-11: la carga es el primer análisis del historial, contra la sesión
    // que acaba de crear.
    expect(historial.deSesion).toHaveBeenCalledWith('analista-A', 'sesion-1', 'DatasetCargado', { detalle: '10 fila(s), 2 variable(s)' });
    expect(auditoriaRepository.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        usuario: 'analista-A',
        accion: 'ImportarDatasetGenerico',
        detalle: expect.stringContaining('10 fila(s), 2 columna(s), 2 duplicada(s) (archivo: ventas.xlsx)'),
        // RF-138: la carga queda asociada al dataset, para que el
        // administrador pueda pedir la auditoría de ese dataset.
        datasetId: 'dataset-1'
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

    const decorator = new AnalizarDatasetGenericoConAuditoria(usecase, auditoriaRepository, historialFalso());
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

    const historial = historialFalso();
    const decorator = new AnalizarDatasetGenericoConAuditoria(usecase, auditoriaRepository, historial);

    await expect(decorator.ejecutar('/tmp/archivo.xlsx', 'analista-A', 'roto.xlsx')).rejects.toThrow(
      'El archivo no contiene ninguna hoja'
    );
    expect(auditoriaRepository.registrar).not.toHaveBeenCalled();
    expect(historial.deSesion).not.toHaveBeenCalled();
  });
});
