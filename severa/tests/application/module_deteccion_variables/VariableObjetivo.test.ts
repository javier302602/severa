import { SugerirVariableObjetivo } from '../../../src/application/usecases/module_deteccion_variables/SugerirVariableObjetivo';
import { DefinirVariableObjetivo } from '../../../src/application/usecases/module_deteccion_variables/DefinirVariableObjetivo';
import { CorregirTipoDeVariable } from '../../../src/application/usecases/module_deteccion_variables/CorregirTipoDeVariable';
import { SesionAnalisisStoreEnMemoria } from '../../../src/infrastructure/adapters/out/dataset/SesionAnalisisStoreEnMemoria';
import { ColumnaDeDatasetInvalidaError } from '../../../src/domain/errors/ColumnaDeDatasetInvalidaError';
import { SesionAnalisisNoEncontradaError } from '../../../src/domain/errors/SesionAnalisisNoEncontradaError';
import { DatasetGenericoRepositoryEnMemoria, cargarDatasetDePrueba } from '../../dobles/DatasetGenericoRepositoryEnMemoria';

// RF-110 (M-14, Ronda 2). Criterios de aceptación del SDS:
//   - El sistema propone hasta tres variables candidatas, con su justificación.
//   - El analista puede confirmar, cambiar o rechazar la sugerencia.
//   - El sistema no fija la variable objetivo sin confirmación del analista.
const COLUMNAS = {
  codigo: Array.from({ length: 10 }, (_, i) => `ALU-${100 + i}`),
  horas: [2, 9, 4, 7, 1, 8, 3, 6, 5, 10],
  turno: ['mañana', 'tarde', 'noche', 'mañana', 'tarde', 'noche', 'mañana', 'tarde', 'noche', 'mañana'],
  aprobado: ['si', 'no', 'si', 'si', 'no', 'si', 'no', 'no', 'si', 'si']
};

async function preparar() {
  const repositorio = new DatasetGenericoRepositoryEnMemoria();
  const store = new SesionAnalisisStoreEnMemoria();
  const cargado = await cargarDatasetDePrueba(repositorio, store, { columnas: COLUMNAS });
  return {
    repositorio,
    store,
    ...cargado,
    sugerir: new SugerirVariableObjetivo(store, repositorio),
    definir: new DefinirVariableObjetivo(store, repositorio)
  };
}

describe('RF-110 — el sistema sugiere', () => {
  test('devuelve las candidatas con su justificación y las columnas que se pueden elegir a mano', async () => {
    const { sugerir, sesionId } = await preparar();

    const estado = await sugerir.ejecutar('analista-A', sesionId);

    expect(estado.candidatas.map((candidata) => candidata.columna)).toEqual(['aprobado']);
    expect(estado.candidatas[0].motivos.length).toBeGreaterThan(0);
    expect(estado.candidatas.length).toBeLessThanOrEqual(3);
    // El identificador no se puede elegir; las demás sí, aunque no se sugieran.
    expect(estado.columnasElegibles).toEqual(['horas', 'turno', 'aprobado']);
  });

  test('sugerir no fija nada: la decisión sigue "pendiente" por muchas veces que se consulte', async () => {
    const { repositorio, sugerir, sesionId, datasetId } = await preparar();

    await sugerir.ejecutar('analista-A', sesionId);
    const estado = await sugerir.ejecutar('analista-A', sesionId);

    expect(estado.decision).toEqual({ estado: 'pendiente', columna: null });
    expect((await repositorio.buscarPorId(datasetId, 'analista-A'))?.variableObjetivo).toEqual({ estado: 'pendiente', columna: null });
    expect(await repositorio.listarBitacora(datasetId, 'analista-A')).toEqual([]);
  });

  test('RF-111: usa los tipos corregidos por el analista', async () => {
    const { repositorio, store, sugerir, sesionId } = await preparar();
    await new CorregirTipoDeVariable(store, repositorio).ejecutar('analista-A', sesionId, 'aprobado', 'texto_libre');

    const estado = await sugerir.ejecutar('analista-A', sesionId);

    expect(estado.candidatas).toEqual([]);
    expect(estado.columnasElegibles).toEqual(['horas', 'turno']);
  });
});

describe('RF-110 — el analista decide', () => {
  test('confirmar una sugerencia', async () => {
    const { repositorio, sugerir, definir, sesionId, datasetId } = await preparar();

    const resultado = await definir.ejecutar('analista-A', sesionId, 'aprobado');

    expect(resultado).toMatchObject({
      huboCambio: true,
      anterior: { estado: 'pendiente', columna: null },
      decision: { estado: 'confirmada', columna: 'aprobado' },
      datasetOriginalId: datasetId,
      version: 0
    });
    expect((await sugerir.ejecutar('analista-A', sesionId)).decision).toEqual({ estado: 'confirmada', columna: 'aprobado' });
    expect((await repositorio.listarBitacora(datasetId, 'analista-A'))[0]).toMatchObject({
      operacion: 'definir_variable_objetivo',
      variable: 'aprobado',
      metodo: 'confirmada por el analista',
      versionResultado: null
    });
  });

  test('cambiarla por otra columna que el sistema no había sugerido', async () => {
    const { sugerir, definir, sesionId } = await preparar();
    await definir.ejecutar('analista-A', sesionId, 'aprobado');

    const resultado = await definir.ejecutar('analista-A', sesionId, 'horas');

    expect(resultado).toMatchObject({
      huboCambio: true,
      anterior: { estado: 'confirmada', columna: 'aprobado' },
      decision: { estado: 'confirmada', columna: 'horas' }
    });
    // Las sugerencias siguen siendo las mismas: son del sistema, no cambian
    // por lo que el analista elija.
    const estado = await sugerir.ejecutar('analista-A', sesionId);
    expect(estado.candidatas.map((candidata) => candidata.columna)).toEqual(['aprobado']);
    expect(estado.decision.columna).toBe('horas');
  });

  test('rechazar la sugerencia: queda "rechazada", que no es lo mismo que "pendiente"', async () => {
    const { repositorio, definir, sesionId, datasetId } = await preparar();

    const resultado = await definir.ejecutar('analista-A', sesionId, null);

    expect(resultado).toMatchObject({ huboCambio: true, decision: { estado: 'rechazada', columna: null } });
    expect((await repositorio.listarBitacora(datasetId, 'analista-A'))[0]).toMatchObject({
      operacion: 'definir_variable_objetivo',
      variable: null,
      metodo: 'descartada por el analista'
    });
  });

  test('repetir la misma decisión no cambia nada ni duplica la bitácora', async () => {
    const { repositorio, definir, sesionId, datasetId } = await preparar();
    await definir.ejecutar('analista-A', sesionId, 'aprobado');

    const repetida = await definir.ejecutar('analista-A', sesionId, 'aprobado');

    expect(repetida.huboCambio).toBe(false);
    expect(await repositorio.listarBitacora(datasetId, 'analista-A')).toHaveLength(1);
  });

  test('no se puede elegir una columna que no existe, ni un identificador', async () => {
    const { repositorio, definir, sesionId, datasetId } = await preparar();

    await expect(definir.ejecutar('analista-A', sesionId, 'nota')).rejects.toThrow(
      new ColumnaDeDatasetInvalidaError('La columna "nota" no existe en este dataset')
    );
    await expect(definir.ejecutar('analista-A', sesionId, 'codigo')).rejects.toThrow(
      'La columna "codigo" no puede ser variable objetivo: es un identificador, un texto libre o una fecha.'
    );
    expect((await repositorio.buscarPorId(datasetId, 'analista-A'))?.variableObjetivo.estado).toBe('pendiente');
  });

  test('otro analista no puede ver ni definir la variable objetivo de esta sesión', async () => {
    const { sugerir, definir, sesionId } = await preparar();

    await expect(sugerir.ejecutar('analista-B', sesionId)).rejects.toThrow(SesionAnalisisNoEncontradaError);
    await expect(definir.ejecutar('analista-B', sesionId, 'aprobado')).rejects.toThrow(SesionAnalisisNoEncontradaError);
  });
});
