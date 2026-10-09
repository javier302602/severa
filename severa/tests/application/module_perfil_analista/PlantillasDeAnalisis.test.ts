import { GuardarPlantillaDeAnalisis } from '../../../src/application/usecases/module_perfil_analista/GuardarPlantillaDeAnalisis';
import { ListarPlantillasDeAnalisis } from '../../../src/application/usecases/module_perfil_analista/ListarPlantillasDeAnalisis';
import { EliminarPlantillaDeAnalisis } from '../../../src/application/usecases/module_perfil_analista/EliminarPlantillaDeAnalisis';
import { AplicarPlantillaDeAnalisis } from '../../../src/application/usecases/module_perfil_analista/AplicarPlantillaDeAnalisis';
import { CorregirTipoDeVariable } from '../../../src/application/usecases/module_deteccion_variables/CorregirTipoDeVariable';
import { DefinirVariableObjetivo } from '../../../src/application/usecases/module_deteccion_variables/DefinirVariableObjetivo';
import { ConfigurarCriterioDeClasificacion } from '../../../src/application/usecases/module_carga_gestion_datasets/ConfigurarCriterioDeClasificacion';
import {
  AplicarPlantillaDeAnalisisConAuditoria,
  ConfigurarCriterioDeClasificacionConAuditoria,
  CorregirTipoDeVariableConAuditoria,
  DefinirVariableObjetivoConAuditoria
} from '../../../src/application/usecases/module_seguridad_auditoria/decoradores/OperacionesDeDatasetGenericoConAuditoria';
import { ConfigurarCriterioDeClasificacionUseCase } from '../../../src/application/ports/in/module_carga_gestion_datasets/ConfigurarCriterioDeClasificacionUseCase';
import { AuditoriaRepository } from '../../../src/application/ports/out/persistencia/repositorios/AuditoriaRepository';
import { SesionAnalisisStoreEnMemoria } from '../../../src/infrastructure/adapters/out/dataset/SesionAnalisisStoreEnMemoria';
import { SesionAnalisisNoEncontradaError } from '../../../src/domain/errors/SesionAnalisisNoEncontradaError';
import {
  AplicacionDePlantillaSinConfirmarError,
  NombreDePlantillaRepetidoError,
  PlantillaDeAnalisisInvalidaError,
  PlantillaDeAnalisisNoEncontradaError,
  PlantillaIncompatibleError,
  VistaPreviaDePlantillaDesactualizadaError
} from '../../../src/domain/errors/PlantillaDeAnalisisErrors';
import { DatasetGenericoRepositoryEnMemoria, cargarDatasetDePrueba } from '../../dobles/DatasetGenericoRepositoryEnMemoria';
import { PlantillaDeAnalisisRepositoryEnMemoria } from '../../dobles/PlantillaDeAnalisisRepositoryEnMemoria';

// RF-12 (M-02): "el analista puede guardar una plantilla con nombre. La
// plantilla puede reaplicarse sobre un nuevo dataset compatible."
//
// Se prueba con los casos de uso reales encadenados (repositorios en memoria):
// aplicar una plantilla tiene que dejar en el dataset, la bitácora y la
// auditoría exactamente lo que dejaría el analista haciéndolo a mano.

// Tipos detectados: edad numérica discreta, puntaje numérica continua, ciudad
// categórica nominal, aprobado binaria, codigo identificador.
const ENCUESTA_MARZO = {
  edad: [20, 25, 30, 35, 40, 22, 38, 30, 28, 33],
  puntaje: [1.5, 2.25, 3.1, 4.8, 5.2, 6.75, 7.1, 8.9, 9.3, 2.2],
  ciudad: ['Lima', 'Lima', 'Cusco', 'Lima', 'Arequipa', 'Cusco', 'Lima', 'Cusco', 'Lima', 'Cusco'],
  aprobado: ['si', 'no', 'si', 'si', 'no', 'si', 'no', 'si', 'si', 'no'],
  codigo: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10']
};
// El mismo formulario, otro mes: mismas columnas, otros valores y una columna más.
const ENCUESTA_ABRIL = {
  edad: [31, 26, 45, 29, 52, 37, 41, 23, 36, 30, 27, 44],
  puntaje: [3.5, 8.25, 6.1, 2.8, 9.2, 4.75, 5.1, 7.9, 1.3, 6.2, 8.8, 3.3],
  ciudad: ['Cusco', 'Lima', 'Lima', 'Arequipa', 'Cusco', 'Lima', 'Lima', 'Cusco', 'Lima', 'Arequipa', 'Lima', 'Cusco'],
  aprobado: ['no', 'si', 'si', 'no', 'si', 'si', 'no', 'si', 'no', 'si', 'si', 'no'],
  codigo: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B11', 'B12'],
  turno: ['M', 'T', 'M', 'T', 'M', 'T', 'M', 'T', 'M', 'T', 'M', 'T']
};

const UMBRALES = [
  { minimo: 7, etiqueta: 'Alto' },
  { minimo: 0, etiqueta: 'Bajo' }
];

function auditoriaFalsa(): jest.Mocked<AuditoriaRepository> {
  return { registrar: jest.fn().mockResolvedValue(undefined), listar: jest.fn().mockResolvedValue([]) };
}

function preparar() {
  const datasets = new DatasetGenericoRepositoryEnMemoria();
  const store = new SesionAnalisisStoreEnMemoria();
  const plantillas = new PlantillaDeAnalisisRepositoryEnMemoria();
  const auditoria = auditoriaFalsa();

  const corregir = new CorregirTipoDeVariableConAuditoria(new CorregirTipoDeVariable(store, datasets), auditoria);
  const definir = new DefinirVariableObjetivoConAuditoria(new DefinirVariableObjetivo(store, datasets), auditoria);
  const configurar = new ConfigurarCriterioDeClasificacionConAuditoria(new ConfigurarCriterioDeClasificacion(datasets), auditoria);

  const crearAplicar = (configurarCriterio: ConfigurarCriterioDeClasificacionUseCase = configurar) =>
    new AplicarPlantillaDeAnalisisConAuditoria(
      new AplicarPlantillaDeAnalisis(store, datasets, plantillas, corregir, definir, configurarCriterio),
      auditoria
    );

  return {
    datasets,
    store,
    plantillas,
    auditoria,
    corregir,
    definir,
    configurar,
    guardar: new GuardarPlantillaDeAnalisis(store, datasets, plantillas),
    listar: new ListarPlantillasDeAnalisis(plantillas),
    eliminar: new EliminarPlantillaDeAnalisis(plantillas),
    aplicar: crearAplicar(),
    crearAplicar,
    cargar: (columnas: Record<string, unknown[]>, analistaId = 'analista-A', nombreArchivo = 'encuesta.csv') =>
      cargarDatasetDePrueba(datasets, store, { columnas, analistaId, nombreArchivo })
  };
}

// Configura a mano el dataset de marzo y guarda esa configuración como plantilla.
async function plantillaDesdeMarzo(ctx: ReturnType<typeof preparar>, nombre = 'Encuesta mensual') {
  const marzo = await ctx.cargar(ENCUESTA_MARZO, 'analista-A', 'marzo.csv');
  await ctx.corregir.ejecutar('analista-A', marzo.sesionId, 'edad', 'numerica_continua');
  await ctx.corregir.ejecutar('analista-A', marzo.sesionId, 'ciudad', 'categorica_ordinal');
  await ctx.definir.ejecutar('analista-A', marzo.sesionId, 'aprobado');
  await ctx.configurar.ejecutar(marzo.datasetId, 'analista-A', {
    nombreColumna: 'puntaje',
    tipo: 'numerica',
    umbrales: UMBRALES,
    columnaClave: 'codigo'
  });
  const plantilla = await ctx.guardar.ejecutar('analista-A', marzo.sesionId, nombre);
  ctx.auditoria.registrar.mockClear();
  return { marzo, plantilla };
}

describe('GuardarPlantillaDeAnalisis — RF-12', () => {
  test('guarda con nombre la configuración del dataset abierto: tipos, variable objetivo, criterio y columna clave', async () => {
    const ctx = preparar();
    const { plantilla } = await plantillaDesdeMarzo(ctx, '  Encuesta mensual  ');

    expect(plantilla.nombre).toBe('Encuesta mensual');
    expect(plantilla.analistaId).toBe('analista-A');
    expect(plantilla.configuracion).toEqual({
      tiposCorregidos: { edad: 'numerica_continua', ciudad: 'categorica_ordinal' },
      variableObjetivo: 'aprobado',
      clasificacion: {
        criterio: expect.objectContaining({ nombreColumna: 'puntaje', tipo: 'numerica', umbrales: UMBRALES }),
        columnaClave: 'codigo'
      }
    });
    expect(await ctx.listar.ejecutar('analista-A')).toEqual([plantilla]);
  });

  test('un dataset sin nada configurado no tiene qué guardar', async () => {
    const ctx = preparar();
    const marzo = await ctx.cargar(ENCUESTA_MARZO);

    await expect(ctx.guardar.ejecutar('analista-A', marzo.sesionId, 'Vacía')).rejects.toThrow(PlantillaDeAnalisisInvalidaError);
    expect(ctx.plantillas.plantillas).toEqual([]);
  });

  test('una variable objetivo descartada no viaja en la plantilla (solo agrega o cambia, nunca quita)', async () => {
    const ctx = preparar();
    const marzo = await ctx.cargar(ENCUESTA_MARZO);
    await ctx.corregir.ejecutar('analista-A', marzo.sesionId, 'edad', 'numerica_continua');
    await ctx.definir.ejecutar('analista-A', marzo.sesionId, null);

    const plantilla = await ctx.guardar.ejecutar('analista-A', marzo.sesionId, 'Sin objetivo');

    expect(plantilla.configuracion.variableObjetivo).toBeNull();
  });

  test('un nombre repetido (sin distinguir mayúsculas ni espacios al borde) se rechaza y no sobrescribe', async () => {
    const ctx = preparar();
    const { marzo, plantilla } = await plantillaDesdeMarzo(ctx);

    await expect(ctx.guardar.ejecutar('analista-A', marzo.sesionId, ' ENCUESTA MENSUAL ')).rejects.toThrow(NombreDePlantillaRepetidoError);
    expect(await ctx.listar.ejecutar('analista-A')).toEqual([plantilla]);
  });

  test('otro analista puede usar el mismo nombre', async () => {
    const ctx = preparar();
    await plantillaDesdeMarzo(ctx);
    const deB = await ctx.cargar(ENCUESTA_MARZO, 'analista-B');
    await ctx.corregir.ejecutar('analista-B', deB.sesionId, 'edad', 'numerica_continua');

    await expect(ctx.guardar.ejecutar('analista-B', deB.sesionId, 'Encuesta mensual')).resolves.toBeDefined();
  });

  test('nombre vacío o de más de 80 caracteres: rechazado', async () => {
    const ctx = preparar();
    const { marzo } = await plantillaDesdeMarzo(ctx);

    await expect(ctx.guardar.ejecutar('analista-A', marzo.sesionId, '   ')).rejects.toThrow(PlantillaDeAnalisisInvalidaError);
    await expect(ctx.guardar.ejecutar('analista-A', marzo.sesionId, 'x'.repeat(81))).rejects.toThrow(PlantillaDeAnalisisInvalidaError);
  });

  test('no se puede guardar desde la sesión de otro analista', async () => {
    const ctx = preparar();
    const { marzo } = await plantillaDesdeMarzo(ctx);

    await expect(ctx.guardar.ejecutar('analista-B', marzo.sesionId, 'Robada')).rejects.toThrow(SesionAnalisisNoEncontradaError);
  });
});

describe('ListarPlantillasDeAnalisis / EliminarPlantillaDeAnalisis — RF-12', () => {
  test('cada analista ve y elimina solo las suyas', async () => {
    const ctx = preparar();
    const { plantilla } = await plantillaDesdeMarzo(ctx);

    expect(await ctx.listar.ejecutar('analista-B')).toEqual([]);
    await expect(ctx.eliminar.ejecutar('analista-B', plantilla.id)).rejects.toThrow(PlantillaDeAnalisisNoEncontradaError);
    expect(await ctx.listar.ejecutar('analista-A')).toHaveLength(1);

    await ctx.eliminar.ejecutar('analista-A', plantilla.id);
    expect(await ctx.listar.ejecutar('analista-A')).toEqual([]);
  });

  test('eliminar una plantilla no deshace lo que ya se aplicó con ella', async () => {
    const ctx = preparar();
    const { plantilla } = await plantillaDesdeMarzo(ctx);
    const abril = await ctx.cargar(ENCUESTA_ABRIL);
    const vista = await ctx.aplicar.previsualizar('analista-A', abril.sesionId, plantilla.id);
    await ctx.aplicar.ejecutar('analista-A', abril.sesionId, plantilla.id, vista.huella, true);

    await ctx.eliminar.ejecutar('analista-A', plantilla.id);

    expect((await ctx.datasets.buscarPorId(abril.datasetId, 'analista-A'))!.variableObjetivo).toEqual({ estado: 'confirmada', columna: 'aprobado' });
  });
});

describe('AplicarPlantillaDeAnalisis — RF-12', () => {
  test('la vista previa sobre un dataset compatible muestra los cambios y no guarda nada', async () => {
    const ctx = preparar();
    const { plantilla } = await plantillaDesdeMarzo(ctx);
    const abril = await ctx.cargar(ENCUESTA_ABRIL, 'analista-A', 'abril.csv');
    const bitacoraAntes = ctx.datasets.bitacora.length;

    const vista = await ctx.aplicar.previsualizar('analista-A', abril.sesionId, plantilla.id);

    expect(vista.plantilla).toEqual({ id: plantilla.id, nombre: 'Encuesta mensual' });
    expect(vista.nombreArchivo).toBe('abril.csv');
    expect(vista.plan.aplicable).toBe(true);
    expect(vista.plan.cambios.map((cambio) => cambio.tipo)).toEqual([
      'tipo_de_variable',
      'tipo_de_variable',
      'variable_objetivo',
      'criterio_de_clasificacion'
    ]);
    expect(vista.huella).toMatch(/^[0-9a-f]{64}$/);
    expect(ctx.datasets.bitacora.length).toBe(bitacoraAntes);
    expect(ctx.auditoria.registrar).not.toHaveBeenCalled();
  });

  test('aplicar confirmado deja el dataset configurado, con bitácora y auditoría de cada cambio, y devuelve el diagnóstico recalculado', async () => {
    const ctx = preparar();
    const { plantilla } = await plantillaDesdeMarzo(ctx);
    const abril = await ctx.cargar(ENCUESTA_ABRIL, 'analista-A', 'abril.csv');
    const vista = await ctx.aplicar.previsualizar('analista-A', abril.sesionId, plantilla.id);

    const resultado = await ctx.aplicar.ejecutar('analista-A', abril.sesionId, plantilla.id, vista.huella, true);

    const dataset = (await ctx.datasets.buscarPorId(abril.datasetId, 'analista-A'))!;
    expect(dataset.tiposCorregidos).toEqual({ edad: 'numerica_continua', ciudad: 'categorica_ordinal' });
    expect(dataset.variableObjetivo).toEqual({ estado: 'confirmada', columna: 'aprobado' });
    expect(dataset.criterioClasificacion?.toJSON()).toEqual(expect.objectContaining({ nombreColumna: 'puntaje', umbrales: UMBRALES }));
    expect(dataset.columnaClave).toBe('codigo');

    // Bitácora del dataset de abril, en el orden en que se aplicó.
    const bitacora = await ctx.datasets.listarBitacora(abril.datasetId, 'analista-A');
    expect(bitacora.map((entrada) => [entrada.operacion, entrada.variable])).toEqual([
      ['corregir_tipo', 'edad'],
      ['corregir_tipo', 'ciudad'],
      ['definir_variable_objetivo', 'aprobado'],
      ['configurar_criterio', 'puntaje']
    ]);

    // Auditoría: cada cambio por su lado, más el resumen de la plantilla.
    expect(ctx.auditoria.registrar.mock.calls.map(([registro]) => registro.accion)).toEqual([
      'CorregirTipoDeVariable',
      'CorregirTipoDeVariable',
      'DefinirVariableObjetivo',
      'ConfigurarCriterioDeClasificacion',
      'AplicarPlantillaDeAnalisis'
    ]);
    expect(ctx.auditoria.registrar).toHaveBeenLastCalledWith({
      usuario: 'analista-A',
      accion: 'AplicarPlantillaDeAnalisis',
      detalle: '"abril.csv" (original): plantilla "Encuesta mensual" aplicada (4 cambio(s))',
      datasetId: abril.datasetId
    });

    // Lo que necesita la pantalla para refrescarse.
    expect(resultado.cambiosAplicados).toEqual(vista.plan.cambios);
    expect(resultado.tiposCorregidos).toEqual({ edad: 'numerica_continua', ciudad: 'categorica_ordinal' });
    const ciudad = resultado.diagnostico.columnas.find((columna) => columna.nombre === 'ciudad')!;
    expect(ciudad.tipoDetallado).toBe('categorica_ordinal');
    expect(ciudad.tipoCorregidoManualmente).toBe(true);
    // Y la sesión abierta ya analiza con los tipos nuevos.
    expect(ctx.store.obtener('analista-A', abril.sesionId)!.tiposCorregidos).toEqual(resultado.tiposCorregidos);
  });

  test('sin confirmación no se aplica nada', async () => {
    const ctx = preparar();
    const { plantilla } = await plantillaDesdeMarzo(ctx);
    const abril = await ctx.cargar(ENCUESTA_ABRIL);
    const vista = await ctx.aplicar.previsualizar('analista-A', abril.sesionId, plantilla.id);

    await expect(ctx.aplicar.ejecutar('analista-A', abril.sesionId, plantilla.id, vista.huella, false)).rejects.toThrow(
      AplicacionDePlantillaSinConfirmarError
    );
    expect(await ctx.datasets.listarBitacora(abril.datasetId, 'analista-A')).toEqual([]);
  });

  test('si los cambios no son los de la vista previa confirmada, no se aplica nada', async () => {
    const ctx = preparar();
    const { plantilla } = await plantillaDesdeMarzo(ctx);
    const abril = await ctx.cargar(ENCUESTA_ABRIL);
    const vista = await ctx.aplicar.previsualizar('analista-A', abril.sesionId, plantilla.id);
    // Entre la vista previa y la confirmación, el analista corrigió un tipo en otra pestaña.
    await ctx.corregir.ejecutar('analista-A', abril.sesionId, 'edad', 'numerica_continua');
    const bitacoraAntes = (await ctx.datasets.listarBitacora(abril.datasetId, 'analista-A')).length;

    await expect(ctx.aplicar.ejecutar('analista-A', abril.sesionId, plantilla.id, vista.huella, true)).rejects.toThrow(
      VistaPreviaDePlantillaDesactualizadaError
    );
    expect((await ctx.datasets.listarBitacora(abril.datasetId, 'analista-A')).length).toBe(bitacoraAntes);
  });

  test('con columnas faltantes dice cuáles y no aplica nada', async () => {
    const ctx = preparar();
    const { plantilla } = await plantillaDesdeMarzo(ctx);
    const otro = await ctx.cargar({ edad: ENCUESTA_ABRIL.edad, ciudad: ENCUESTA_ABRIL.ciudad });

    const vista = await ctx.aplicar.previsualizar('analista-A', otro.sesionId, plantilla.id);
    expect(vista.plan.aplicable).toBe(false);
    expect(vista.plan.columnasFaltantes).toEqual(['aprobado', 'puntaje', 'codigo']);

    const error = await ctx.aplicar.ejecutar('analista-A', otro.sesionId, plantilla.id, vista.huella, true).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlantillaIncompatibleError);
    expect((error as PlantillaIncompatibleError).columnasFaltantes).toEqual(['aprobado', 'puntaje', 'codigo']);
    expect((error as Error).message).toBe(
      'La plantilla no se puede aplicar a este dataset: al dataset le faltan las columnas "aprobado", "puntaje", "codigo". No se aplicó ningún cambio.'
    );
    const dataset = (await ctx.datasets.buscarPorId(otro.datasetId, 'analista-A'))!;
    expect(dataset.tiposCorregidos).toEqual({});
    expect(await ctx.datasets.listarBitacora(otro.datasetId, 'analista-A')).toEqual([]);
  });

  test('es repetible: si se corta en el medio, la vista previa muestra solo lo que falta y volver a aplicar lo completa', async () => {
    const ctx = preparar();
    const { plantilla } = await plantillaDesdeMarzo(ctx);
    const abril = await ctx.cargar(ENCUESTA_ABRIL);

    // El criterio (lo último que se aplica) falla una vez, como si se cayera la base.
    const configurarQueFalla: ConfigurarCriterioDeClasificacionUseCase = {
      ejecutar: jest.fn().mockRejectedValueOnce(new Error('se cayó la conexión'))
    };
    const aplicarQueSeCorta = ctx.crearAplicar(configurarQueFalla);
    const primera = await aplicarQueSeCorta.previsualizar('analista-A', abril.sesionId, plantilla.id);
    await expect(aplicarQueSeCorta.ejecutar('analista-A', abril.sesionId, plantilla.id, primera.huella, true)).rejects.toThrow(
      'se cayó la conexión'
    );

    // Quedó a medias: tipos y variable objetivo sí, criterio no.
    const segunda = await ctx.aplicar.previsualizar('analista-A', abril.sesionId, plantilla.id);
    expect(segunda.plan.cambios.map((cambio) => cambio.tipo)).toEqual(['criterio_de_clasificacion']);
    expect(segunda.plan.yaVigentes).toBe(3);
    // Con la vista previa vieja no se puede: ya no es lo que falta.
    await expect(ctx.aplicar.ejecutar('analista-A', abril.sesionId, plantilla.id, primera.huella, true)).rejects.toThrow(
      VistaPreviaDePlantillaDesactualizadaError
    );

    await ctx.aplicar.ejecutar('analista-A', abril.sesionId, plantilla.id, segunda.huella, true);

    const bitacora = await ctx.datasets.listarBitacora(abril.datasetId, 'analista-A');
    // Cada operación una sola vez, aunque se haya aplicado en dos tandas.
    expect(bitacora.map((entrada) => entrada.operacion)).toEqual([
      'corregir_tipo',
      'corregir_tipo',
      'definir_variable_objetivo',
      'configurar_criterio'
    ]);
    const tercera = await ctx.aplicar.previsualizar('analista-A', abril.sesionId, plantilla.id);
    expect(tercera.plan.cambios).toEqual([]);
    expect(tercera.plan.yaVigentes).toBe(4);
  });

  test('aplicar una plantilla ya aplicada no cambia nada ni deja registros', async () => {
    const ctx = preparar();
    const { marzo, plantilla } = await plantillaDesdeMarzo(ctx);
    const bitacoraAntes = (await ctx.datasets.listarBitacora(marzo.datasetId, 'analista-A')).length;
    const vista = await ctx.aplicar.previsualizar('analista-A', marzo.sesionId, plantilla.id);

    const resultado = await ctx.aplicar.ejecutar('analista-A', marzo.sesionId, plantilla.id, vista.huella, true);

    expect(resultado.cambiosAplicados).toEqual([]);
    expect((await ctx.datasets.listarBitacora(marzo.datasetId, 'analista-A')).length).toBe(bitacoraAntes);
    expect(ctx.auditoria.registrar).not.toHaveBeenCalled();
  });

  test('no borra correcciones de columnas que la plantilla no menciona', async () => {
    const ctx = preparar();
    const { plantilla } = await plantillaDesdeMarzo(ctx);
    const abril = await ctx.cargar(ENCUESTA_ABRIL);
    await ctx.corregir.ejecutar('analista-A', abril.sesionId, 'turno', 'categorica_nominal');
    await ctx.corregir.ejecutar('analista-A', abril.sesionId, 'codigo', 'categorica_nominal');

    const vista = await ctx.aplicar.previsualizar('analista-A', abril.sesionId, plantilla.id);
    await ctx.aplicar.ejecutar('analista-A', abril.sesionId, plantilla.id, vista.huella, true);

    expect((await ctx.datasets.buscarPorId(abril.datasetId, 'analista-A'))!.tiposCorregidos).toEqual({
      turno: 'categorica_nominal',
      codigo: 'categorica_nominal',
      edad: 'numerica_continua',
      ciudad: 'categorica_ordinal'
    });
  });

  test('la plantilla de otro analista no existe para este', async () => {
    const ctx = preparar();
    const { plantilla } = await plantillaDesdeMarzo(ctx);
    const deB = await ctx.cargar(ENCUESTA_ABRIL, 'analista-B');

    await expect(ctx.aplicar.previsualizar('analista-B', deB.sesionId, plantilla.id)).rejects.toThrow(PlantillaDeAnalisisNoEncontradaError);
    await expect(ctx.aplicar.ejecutar('analista-B', deB.sesionId, plantilla.id, 'x', true)).rejects.toThrow(PlantillaDeAnalisisNoEncontradaError);
  });

  test('no se aplica sobre la sesión de otro analista', async () => {
    const ctx = preparar();
    const { plantilla } = await plantillaDesdeMarzo(ctx);
    const deB = await ctx.cargar(ENCUESTA_ABRIL, 'analista-B');

    await expect(ctx.aplicar.previsualizar('analista-A', deB.sesionId, plantilla.id)).rejects.toThrow(SesionAnalisisNoEncontradaError);
  });
});
