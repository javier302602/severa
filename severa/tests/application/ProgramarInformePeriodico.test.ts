import { ProgramarInformePeriodico } from '../../src/application/usecases/ProgramarInformePeriodico';
import { ProgramadorDeTareas } from '../../src/application/ports/out/ProgramadorDeTareas';
import { GenerarInformeConAuditoria } from '../../src/application/usecases/auditoria/GenerarInformeConAuditoria';

function generarInformeConAuditoriaFalso(): GenerarInformeConAuditoria {
  return { ejecutar: jest.fn().mockResolvedValue(Buffer.from('')) } as unknown as GenerarInformeConAuditoria;
}

describe('ProgramarInformePeriodico', () => {
  test('programa la tarea semanal con la expresión cron de cada lunes', async () => {
    const programadorDeTareas: ProgramadorDeTareas = { programar: jest.fn(), cancelar: jest.fn() };
    const generarInformeUseCase = generarInformeConAuditoriaFalso();
    const usecase = new ProgramarInformePeriodico(programadorDeTareas, generarInformeUseCase);

    await usecase.ejecutar('semanal', 'analista-3');

    expect(programadorDeTareas.programar).toHaveBeenCalledWith('informe-periodico-analista-3', '0 0 * * 1', expect.any(Function));
  });

  test('programa la tarea mensual con la expresión cron del día 1', async () => {
    const programadorDeTareas: ProgramadorDeTareas = { programar: jest.fn(), cancelar: jest.fn() };
    const generarInformeUseCase = generarInformeConAuditoriaFalso();
    const usecase = new ProgramarInformePeriodico(programadorDeTareas, generarInformeUseCase);

    await usecase.ejecutar('mensual', 'analista-3');

    expect(programadorDeTareas.programar).toHaveBeenCalledWith('informe-periodico-analista-3', '0 0 1 * *', expect.any(Function));
  });

  test('RF-83 (Sprint 14): dos analistas distintos programan tareas con ids distintos, ninguno pisa al otro', async () => {
    const programadorDeTareas: ProgramadorDeTareas = { programar: jest.fn(), cancelar: jest.fn() };
    const generarInformeUseCase = generarInformeConAuditoriaFalso();
    const usecase = new ProgramarInformePeriodico(programadorDeTareas, generarInformeUseCase);

    await usecase.ejecutar('semanal', 'analista-3');
    await usecase.ejecutar('mensual', 'analista-8');

    expect(programadorDeTareas.programar).toHaveBeenNthCalledWith(1, 'informe-periodico-analista-3', '0 0 * * 1', expect.any(Function));
    expect(programadorDeTareas.programar).toHaveBeenNthCalledWith(2, 'informe-periodico-analista-8', '0 0 1 * *', expect.any(Function));
  });

  test('la tarea programada, al dispararse, genera el informe en PDF a nombre de quien la programó', async () => {
    let tareaRegistrada: (() => Promise<void>) | undefined;
    const programadorDeTareas: ProgramadorDeTareas = {
      programar: jest.fn((_id, _cron, tarea) => { tareaRegistrada = tarea; }),
      cancelar: jest.fn()
    };
    const generarInformeUseCase = generarInformeConAuditoriaFalso();
    const usecase = new ProgramarInformePeriodico(programadorDeTareas, generarInformeUseCase);

    await usecase.ejecutar('semanal', 'analista-3');
    await tareaRegistrada?.();

    expect(generarInformeUseCase.ejecutar).toHaveBeenCalledWith('pdf', 'analista-3');
  });
});
