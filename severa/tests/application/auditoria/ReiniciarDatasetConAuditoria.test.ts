import { ReiniciarDatasetConAuditoria } from '../../../src/application/usecases/auditoria/ReiniciarDatasetConAuditoria';
import { ReiniciarDatasetUseCase } from '../../../src/application/ports/in/ReiniciarDatasetUseCase';
import { AuditoriaRepository } from '../../../src/application/ports/out/AuditoriaRepository';

function auditoriaFalsa(): AuditoriaRepository {
  return {
    registrar: jest.fn().mockResolvedValue(undefined),
    listar: jest.fn().mockResolvedValue([])
  };
}

describe('ReiniciarDatasetConAuditoria', () => {
  test('ejecuta el borrado y registra en auditoría cuántos registros había (quién, cuándo, cuántos)', async () => {
    const usecase: ReiniciarDatasetUseCase = { ejecutar: jest.fn().mockResolvedValue({ eliminados: 45 }) };
    const auditoriaRepository = auditoriaFalsa();
    const decorator = new ReiniciarDatasetConAuditoria(usecase, auditoriaRepository);

    const resultado = await decorator.ejecutar('admin-1');

    expect(resultado).toEqual({ eliminados: 45 });
    expect(usecase.ejecutar).toHaveBeenCalledTimes(1);
    expect(auditoriaRepository.registrar).toHaveBeenCalledWith({
      usuario: 'admin-1',
      accion: 'ReiniciarDataset',
      detalle: expect.stringContaining('45')
    });
  });
});
