import { DatasetParaPlantilla, planificarAplicacionDePlantilla } from '../../../../src/domain/services/plantillas/PlanDeAplicacionDePlantilla';
import { ConfiguracionDePlantilla } from '../../../../src/domain/entities/PlantillaDeAnalisis';
import { VARIABLE_OBJETIVO_PENDIENTE } from '../../../../src/domain/entities/DatasetGenerico';
import { CriterioDeClasificacionValue } from '../../../../src/domain/shared/value-objects/CriterioDeClasificacion';

// Tipos que el sistema detecta sobre estas columnas (comprobado, no supuesto):
//   edad numérica discreta, puntaje numérica continua, ciudad categórica
//   nominal, aprobado binaria, codigo identificador, nivel categórica ordinal.
const COLUMNAS: Record<string, unknown[]> = {
  edad: [20, 25, 30, 35, 40, 22, 38, 30, 28, 33],
  puntaje: [1.5, 2.25, 3.1, 4.8, 5.2, 6.75, 7.1, 8.9, 9.3, 2.2],
  ciudad: ['Lima', 'Lima', 'Cusco', 'Lima', 'Arequipa', 'Cusco', 'Lima', 'Cusco', 'Lima', 'Cusco'],
  aprobado: ['si', 'no', 'si', 'si', 'no', 'si', 'no', 'si', 'si', 'no'],
  codigo: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10'],
  nivel: ['Bajo', 'Medio', 'Alto', 'Bajo', 'Medio', 'Alto', 'Bajo', 'Medio', 'Alto', 'Bajo']
};

function dataset(cambios: Partial<DatasetParaPlantilla> = {}): DatasetParaPlantilla {
  const columnas = Object.keys(COLUMNAS);
  return {
    columnas,
    filas: COLUMNAS.edad.map((_, i) => Object.fromEntries(columnas.map((columna) => [columna, COLUMNAS[columna][i]]))),
    tiposCorregidos: {},
    variableObjetivo: VARIABLE_OBJETIVO_PENDIENTE,
    criterioClasificacion: null,
    columnaClave: null,
    ...cambios
  };
}

const CRITERIO_PUNTAJE = {
  nombreColumna: 'puntaje',
  tipo: 'numerica' as const,
  umbrales: [
    { minimo: 7, etiqueta: 'Alto' },
    { minimo: 0, etiqueta: 'Bajo' }
  ]
};

const COMPLETA: ConfiguracionDePlantilla = {
  tiposCorregidos: { ciudad: 'categorica_ordinal', edad: 'numerica_continua' },
  variableObjetivo: 'aprobado',
  clasificacion: { criterio: CRITERIO_PUNTAJE, columnaClave: 'codigo' }
};

describe('planificarAplicacionDePlantilla — RF-12', () => {
  test('sobre un dataset sin configurar: todos los cambios, en orden tipos → variable objetivo → criterio', () => {
    const plan = planificarAplicacionDePlantilla(COMPLETA, dataset());

    expect(plan.aplicable).toBe(true);
    expect(plan.columnasFaltantes).toEqual([]);
    expect(plan.problemas).toEqual([]);
    expect(plan.yaVigentes).toBe(0);
    expect(plan.cambios).toEqual([
      // Los tipos, en el orden de las columnas del dataset (edad antes que ciudad).
      { tipo: 'tipo_de_variable', columna: 'edad', tipoActual: 'numerica_discreta', tipoNuevo: 'numerica_continua' },
      { tipo: 'tipo_de_variable', columna: 'ciudad', tipoActual: 'categorica_nominal', tipoNuevo: 'categorica_ordinal' },
      // RF-110: el plan nombra la variable objetivo que se va a confirmar.
      { tipo: 'variable_objetivo', columna: 'aprobado', actual: { estado: 'pendiente', columna: null } },
      {
        tipo: 'criterio_de_clasificacion',
        criterioActual: null,
        criterioNuevo: expect.objectContaining({ nombreColumna: 'puntaje', tipo: 'numerica' }),
        columnaClaveActual: null,
        columnaClaveNueva: 'codigo',
        categoriasSinOrden: []
      }
    ]);
  });

  test('si faltan columnas, dice cuáles y no propone ningún cambio', () => {
    const sinAlgunas = dataset();
    sinAlgunas.columnas = ['edad', 'ciudad', 'nivel'];

    const plan = planificarAplicacionDePlantilla(COMPLETA, sinAlgunas);

    expect(plan.aplicable).toBe(false);
    expect(plan.columnasFaltantes).toEqual(['aprobado', 'puntaje', 'codigo']);
    expect(plan.cambios).toEqual([]);
  });

  test('un tipo que estos valores no admiten hace inaplicable toda la plantilla (nada a medias)', () => {
    const plan = planificarAplicacionDePlantilla(
      { ...COMPLETA, tiposCorregidos: { ...COMPLETA.tiposCorregidos, ciudad: 'binaria' } },
      dataset()
    );

    expect(plan.aplicable).toBe(false);
    expect(plan.problemas).toEqual(['no se puede tratar "ciudad" como binaria: tiene 3 valor(es) distinto(s), y una variable binaria tiene exactamente 2']);
    expect(plan.cambios).toEqual([]);
  });

  test('ya aplicada entera: ningún cambio pendiente, y cuenta lo que ya estaba', () => {
    const plan = planificarAplicacionDePlantilla(
      COMPLETA,
      dataset({
        tiposCorregidos: { ciudad: 'categorica_ordinal', edad: 'numerica_continua' },
        variableObjetivo: { estado: 'confirmada', columna: 'aprobado' },
        criterioClasificacion: CriterioDeClasificacionValue.numerica('puntaje', CRITERIO_PUNTAJE.umbrales),
        columnaClave: 'codigo'
      })
    );

    expect(plan.aplicable).toBe(true);
    expect(plan.cambios).toEqual([]);
    expect(plan.yaVigentes).toBe(4);
  });

  test('aplicada a medias (se cortó después de los tipos): solo lo que falta', () => {
    const plan = planificarAplicacionDePlantilla(
      COMPLETA,
      dataset({ tiposCorregidos: { ciudad: 'categorica_ordinal', edad: 'numerica_continua' } })
    );

    expect(plan.cambios.map((cambio) => cambio.tipo)).toEqual(['variable_objetivo', 'criterio_de_clasificacion']);
    expect(plan.yaVigentes).toBe(2);
  });

  test('un tipo que coincide con el detectado no es un cambio', () => {
    const plan = planificarAplicacionDePlantilla(
      { tiposCorregidos: { edad: 'numerica_discreta' }, variableObjetivo: null, clasificacion: null },
      dataset()
    );

    expect(plan.cambios).toEqual([]);
    expect(plan.yaVigentes).toBe(1);
  });

  test('no toca correcciones de columnas que no menciona, ni la variable objetivo o el criterio si no los trae', () => {
    const criterioVigente = CriterioDeClasificacionValue.numerica('edad', [{ minimo: 0, etiqueta: 'Todos' }]);
    const plan = planificarAplicacionDePlantilla(
      { tiposCorregidos: { ciudad: 'categorica_ordinal' }, variableObjetivo: null, clasificacion: null },
      dataset({
        tiposCorregidos: { codigo: 'categorica_nominal' },
        variableObjetivo: { estado: 'confirmada', columna: 'aprobado' },
        criterioClasificacion: criterioVigente
      })
    );

    expect(plan.cambios).toEqual([
      { tipo: 'tipo_de_variable', columna: 'ciudad', tipoActual: 'categorica_nominal', tipoNuevo: 'categorica_ordinal' }
    ]);
  });

  test('una variable objetivo distinta de la confirmada se propone como cambio, mostrando la actual', () => {
    const plan = planificarAplicacionDePlantilla(
      { tiposCorregidos: {}, variableObjetivo: 'ciudad', clasificacion: null },
      dataset({ variableObjetivo: { estado: 'confirmada', columna: 'aprobado' } })
    );

    expect(plan.cambios).toEqual([{ tipo: 'variable_objetivo', columna: 'ciudad', actual: { estado: 'confirmada', columna: 'aprobado' } }]);
  });

  describe('la variable objetivo y el criterio se validan con los tipos como quedarían DESPUÉS de aplicar', () => {
    test('un identificador no sirve de variable objetivo… salvo que la misma plantilla lo corrija a categórico', () => {
      const sinCorregir = planificarAplicacionDePlantilla({ tiposCorregidos: {}, variableObjetivo: 'codigo', clasificacion: null }, dataset());
      expect(sinCorregir.aplicable).toBe(false);
      expect(sinCorregir.problemas).toEqual(['"codigo" no puede ser variable objetivo en este dataset: quedaría como identificador']);

      const corrigiendo = planificarAplicacionDePlantilla(
        { tiposCorregidos: { codigo: 'categorica_nominal' }, variableObjetivo: 'codigo', clasificacion: null },
        dataset()
      );
      expect(corrigiendo.aplicable).toBe(true);
      expect(corrigiendo.cambios.map((cambio) => cambio.tipo)).toEqual(['tipo_de_variable', 'variable_objetivo']);
    });

    test('la corrección de la plantilla puede dejar inválida una variable objetivo que hoy sería válida', () => {
      const plan = planificarAplicacionDePlantilla(
        { tiposCorregidos: { ciudad: 'texto_libre' }, variableObjetivo: 'ciudad', clasificacion: null },
        dataset()
      );

      expect(plan.aplicable).toBe(false);
      expect(plan.problemas).toEqual(['"ciudad" no puede ser variable objetivo en este dataset: quedaría como texto libre']);
    });

    test('un criterio ordinal sobre una columna numérica vale si la plantilla la corrige a categórica', () => {
      const criterio = { nombreColumna: 'edad', tipo: 'ordinal' as const, ordenCategorias: ['20', '25'] };

      const sinCorregir = planificarAplicacionDePlantilla(
        { tiposCorregidos: {}, variableObjetivo: null, clasificacion: { criterio, columnaClave: null } },
        dataset()
      );
      expect(sinCorregir.aplicable).toBe(false);
      expect(sinCorregir.problemas[0]).toContain('el criterio de clasificación no sirve para este dataset');

      const corrigiendo = planificarAplicacionDePlantilla(
        { tiposCorregidos: { edad: 'categorica_ordinal' }, variableObjetivo: null, clasificacion: { criterio, columnaClave: null } },
        dataset()
      );
      expect(corrigiendo.aplicable).toBe(true);
    });
  });

  test('criterio ordinal: avisa qué categorías del dataset no están en el orden de la plantilla', () => {
    const plan = planificarAplicacionDePlantilla(
      {
        tiposCorregidos: {},
        variableObjetivo: null,
        clasificacion: { criterio: { nombreColumna: 'nivel', tipo: 'ordinal', ordenCategorias: ['Bajo', 'Medio'] }, columnaClave: null }
      },
      dataset()
    );

    expect(plan.aplicable).toBe(true);
    expect(plan.cambios).toEqual([expect.objectContaining({ tipo: 'criterio_de_clasificacion', categoriasSinOrden: ['Alto'] })]);
  });

  test('sin columna clave en la plantilla se conserva la del dataset; cambiar solo la clave es un cambio', () => {
    const criterioVigente = CriterioDeClasificacionValue.numerica('puntaje', CRITERIO_PUNTAJE.umbrales);

    const conservando = planificarAplicacionDePlantilla(
      { tiposCorregidos: {}, variableObjetivo: null, clasificacion: { criterio: CRITERIO_PUNTAJE, columnaClave: null } },
      dataset({ criterioClasificacion: criterioVigente, columnaClave: 'codigo' })
    );
    expect(conservando.cambios).toEqual([]);

    const cambiandoClave = planificarAplicacionDePlantilla(
      { tiposCorregidos: {}, variableObjetivo: null, clasificacion: { criterio: CRITERIO_PUNTAJE, columnaClave: 'ciudad' } },
      dataset({ criterioClasificacion: criterioVigente, columnaClave: 'codigo' })
    );
    expect(cambiandoClave.cambios).toEqual([
      expect.objectContaining({ tipo: 'criterio_de_clasificacion', columnaClaveActual: 'codigo', columnaClaveNueva: 'ciudad' })
    ]);
  });
});
