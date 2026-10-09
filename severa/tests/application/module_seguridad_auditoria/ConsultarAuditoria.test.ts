import { ConsultarAuditoria } from '../../../src/application/usecases/module_seguridad_auditoria/ConsultarAuditoria';
import { AuditoriaRepository } from '../../../src/application/ports/out/persistencia/repositorios/AuditoriaRepository';
import { RegistroAuditoria } from '../../../src/domain/entities/RegistroAuditoria';

describe('ConsultarAuditoria', () => {
  test('devuelve el historial que reporta el repositorio', async () => {
    const registros = [new RegistroAuditoria('1', 'analista-1', 'Login', 'Inicio de sesión')];
    const auditoriaRepository: AuditoriaRepository = {
      registrar: jest.fn().mockResolvedValue(undefined),
      listar: jest.fn().mockResolvedValue(registros)
    };

    const usecase = new ConsultarAuditoria(auditoriaRepository);
    const resultado = await usecase.ejecutar();

    expect(resultado).toBe(registros);
    expect(auditoriaRepository.listar).toHaveBeenCalledTimes(1);
    expect(auditoriaRepository.listar).toHaveBeenCalledWith({});
  });

  test('RF-138: pasa el filtro por dataset al repositorio tal cual', async () => {
    const auditoriaRepository: AuditoriaRepository = {
      registrar: jest.fn().mockResolvedValue(undefined),
      listar: jest.fn().mockResolvedValue([])
    };

    await new ConsultarAuditoria(auditoriaRepository).ejecutar({ datasetId: 'dataset-9' });

    expect(auditoriaRepository.listar).toHaveBeenCalledWith({ datasetId: 'dataset-9' });
  });
});
