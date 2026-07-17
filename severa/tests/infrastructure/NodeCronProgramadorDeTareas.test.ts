// Cada llamada a cron.schedule() devuelve un ScheduledTask con su PROPIO stop
// mock (no uno compartido) — necesario para poder distinguir, en los tests de
// "ids distintos", cuál tarea concreta fue detenida y cuál no.
const stopMocks: jest.Mock[] = [];
const scheduleMock = jest.fn((_expresion: string, _callback: () => void) => {
  const stop = jest.fn();
  stopMocks.push(stop);
  return { stop };
});

jest.mock('node-cron', () => ({
  schedule: (expresion: string, callback: () => void) => scheduleMock(expresion, callback)
}));

import { NodeCronProgramadorDeTareas } from '../../src/infrastructure/adapters/out/scheduler/NodeCronProgramadorDeTareas';

describe('NodeCronProgramadorDeTareas (RF-83, Sprint 14)', () => {
  beforeEach(() => {
    scheduleMock.mockClear();
    stopMocks.length = 0;
  });

  test('programar() registra la tarea en node-cron con la expresión cron dada', () => {
    const programador = new NodeCronProgramadorDeTareas();
    const tarea = jest.fn().mockResolvedValue(undefined);

    programador.programar('informe-periodico-analista-3', '0 0 * * 1', tarea);

    expect(scheduleMock).toHaveBeenCalledWith('0 0 * * 1', expect.any(Function));
  });

  test('programar() con el mismo id dos veces detiene la tarea anterior en vez de acumularlas', () => {
    const programador = new NodeCronProgramadorDeTareas();

    programador.programar('informe-periodico-analista-3', '0 0 * * 1', jest.fn());
    programador.programar('informe-periodico-analista-3', '0 0 1 * *', jest.fn());

    expect(scheduleMock).toHaveBeenCalledTimes(2);
    expect(stopMocks[0]).toHaveBeenCalledTimes(1); // la primera tarea de ese id fue detenida
    expect(stopMocks[1]).not.toHaveBeenCalled(); // la segunda (la vigente) sigue corriendo
  });

  test('RF-83 (Sprint 14): programar() con ids DISTINTOS mantiene ambas tareas vivas, sin pisarse', () => {
    const programador = new NodeCronProgramadorDeTareas();

    programador.programar('informe-periodico-analista-3', '0 0 * * 1', jest.fn());
    programador.programar('informe-periodico-analista-8', '0 0 1 * *', jest.fn());

    expect(scheduleMock).toHaveBeenCalledTimes(2);
    expect(stopMocks[0]).not.toHaveBeenCalled();
    expect(stopMocks[1]).not.toHaveBeenCalled();

    // Volver a programar la del analista-3 SÍ detiene la suya, no la del analista-8.
    programador.programar('informe-periodico-analista-3', '0 0 1 * *', jest.fn());
    expect(stopMocks[0]).toHaveBeenCalledTimes(1);
    expect(stopMocks[1]).not.toHaveBeenCalled();
  });

  test('cancelar() detiene y olvida la tarea', () => {
    const programador = new NodeCronProgramadorDeTareas();
    programador.programar('informe-periodico-analista-3', '0 0 * * 1', jest.fn());

    programador.cancelar('informe-periodico-analista-3');

    expect(stopMocks[0]).toHaveBeenCalledTimes(1);
  });

  test('el callback envuelto ejecuta la tarea real cuando node-cron dispara', async () => {
    const programador = new NodeCronProgramadorDeTareas();
    const tarea = jest.fn().mockResolvedValue(undefined);

    programador.programar('informe-periodico-analista-3', '0 0 * * 1', tarea);
    const callbackRegistrado = scheduleMock.mock.calls[0][1];
    callbackRegistrado();
    await Promise.resolve();

    expect(tarea).toHaveBeenCalledTimes(1);
  });
});
