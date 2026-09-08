import { ConfigurarCriterioDeClasificacion } from '../../../src/application/usecases/module_carga_gestion_datasets/ConfigurarCriterioDeClasificacion';
import { DatasetGenericoRepository } from '../../../src/application/ports/out/persistencia/repositorios/DatasetGenericoRepository';
import { DatasetGenerico } from '../../../src/domain/entities/DatasetGenerico';
import { RegistroDatasetGenerico } from '../../../src/domain/entities/RegistroDatasetGenerico';
import { DatasetGenericoNoEncontradoError } from '../../../src/domain/errors/DatasetGenericoNoEncontradoError';
import { ColumnaDeDatasetInvalidaError } from '../../../src/domain/errors/ColumnaDeDatasetInvalidaError';

function repositorioFalso(dataset: DatasetGenerico | null, registros: RegistroDatasetGenerico[] = []): jest.Mocked<DatasetGenericoRepository> {
  return {
    guardar: jest.fn().mockResolvedValue(undefined),
    guardarRegistros: jest.fn().mockResolvedValue(undefined),
    buscarPorId: jest.fn().mockResolvedValue(dataset),
    listarRegistros: jest.fn().mockResolvedValue(registros),
    actualizarCriterioClasificacion: jest.fn().mockResolvedValue(undefined)
  };
}

const datasetNumerico = new DatasetGenerico('d1', 'analista-A', 'riesgos.xlsx', ['Producto', 'Puntaje'], 'archivo', null, 0);
const registrosNumericos = [
  new RegistroDatasetGenerico('r1', 'd1', 'analista-A', { Producto: 'Router', Puntaje: 9.5 }),
  new RegistroDatasetGenerico('r2', 'd1', 'analista-A', { Producto: 'Switch', Puntaje: 3.2 })
];

const datasetCategorico = new DatasetGenerico('d2', 'analista-A', 'incidentes.xlsx', ['Producto', 'Prioridad'], 'archivo', null, 0);
// Baja cardinalidad relativa (2 categorías repetidas sobre 6 filas) a
// propósito: DetectorDeTipoDeColumna.inferirTipoColumna solo clasifica como
// 'categorica' cuando valoresUnicos/total <= 0.5 — con 2 filas y 2 valores
// únicos (ratio 1.0) el detector la habría marcado 'texto', no 'categorica'.
const registrosCategoricos = [
  new RegistroDatasetGenerico('r1', 'd2', 'analista-A', { Producto: 'Router', Prioridad: 'Alta' }),
  new RegistroDatasetGenerico('r2', 'd2', 'analista-A', { Producto: 'Switch', Prioridad: 'Baja' }),
  new RegistroDatasetGenerico('r3', 'd2', 'analista-A', { Producto: 'Firewall', Prioridad: 'Alta' }),
  new RegistroDatasetGenerico('r4', 'd2', 'analista-A', { Producto: 'AP', Prioridad: 'Baja' }),
  new RegistroDatasetGenerico('r5', 'd2', 'analista-A', { Producto: 'Modem', Prioridad: 'Alta' }),
  new RegistroDatasetGenerico('r6', 'd2', 'analista-A', { Producto: 'Hub', Prioridad: 'Baja' })
];

describe('ConfigurarCriterioDeClasificacion', () => {
  test('configura un criterio numérico sobre una columna numérica real', async () => {
    const repository = repositorioFalso(datasetNumerico, registrosNumericos);
    const usecase = new ConfigurarCriterioDeClasificacion(repository);

    const resultado = await usecase.ejecutar('d1', 'analista-A', {
      nombreColumna: 'Puntaje',
      tipo: 'numerica',
      umbrales: [
        { minimo: 8, etiqueta: 'Alto' },
        { minimo: 0, etiqueta: 'Bajo' }
      ]
    });

    expect(resultado.criterioClasificacion?.clasificar(9)).toBe('Alto');
    expect(repository.actualizarCriterioClasificacion).toHaveBeenCalledWith(
      'd1',
      'analista-A',
      expect.objectContaining({ nombreColumna: 'Puntaje', tipo: 'numerica' }),
      null
    );
  });

  test('configura un criterio ordinal sobre una columna categórica real', async () => {
    const repository = repositorioFalso(datasetCategorico, registrosCategoricos);
    const usecase = new ConfigurarCriterioDeClasificacion(repository);

    const resultado = await usecase.ejecutar('d2', 'analista-A', {
      nombreColumna: 'Prioridad',
      tipo: 'ordinal',
      ordenCategorias: ['Baja', 'Alta']
    });

    expect(resultado.criterioClasificacion?.clasificar('Alta')).toBe('Alta');
  });

  test('acepta columnaClave junto con el criterio en el mismo llamado', async () => {
    const repository = repositorioFalso(datasetNumerico, registrosNumericos);
    const usecase = new ConfigurarCriterioDeClasificacion(repository);

    const resultado = await usecase.ejecutar('d1', 'analista-A', {
      nombreColumna: 'Puntaje',
      tipo: 'numerica',
      umbrales: [{ minimo: 0, etiqueta: 'Bajo' }],
      columnaClave: 'Producto'
    });

    expect(resultado.columnaClave).toBe('Producto');
    expect(repository.actualizarCriterioClasificacion).toHaveBeenCalledWith(
      'd1',
      'analista-A',
      expect.anything(),
      'Producto'
    );
  });

  test('sin columnaClave en el input, conserva la que el dataset ya tenía configurada', async () => {
    const datasetConClave = new DatasetGenerico(
      'd1', 'analista-A', 'riesgos.xlsx', ['Producto', 'Puntaje'], 'archivo', null, 0, new Date(), null, 'Producto'
    );
    const repository = repositorioFalso(datasetConClave, registrosNumericos);
    const usecase = new ConfigurarCriterioDeClasificacion(repository);

    const resultado = await usecase.ejecutar('d1', 'analista-A', {
      nombreColumna: 'Puntaje',
      tipo: 'numerica',
      umbrales: [{ minimo: 0, etiqueta: 'Bajo' }]
    });

    expect(resultado.columnaClave).toBe('Producto');
  });

  test('lanza DatasetGenericoNoEncontradoError si el dataset no existe o es de otro analista', async () => {
    const repository = repositorioFalso(null);
    const usecase = new ConfigurarCriterioDeClasificacion(repository);

    await expect(
      usecase.ejecutar('no-existe', 'analista-A', { nombreColumna: 'Puntaje', tipo: 'numerica', umbrales: [] })
    ).rejects.toThrow(DatasetGenericoNoEncontradoError);
    expect(repository.listarRegistros).not.toHaveBeenCalled();
  });

  test('rechaza una columna que no existe en el dataset', async () => {
    const repository = repositorioFalso(datasetNumerico, registrosNumericos);
    const usecase = new ConfigurarCriterioDeClasificacion(repository);

    await expect(
      usecase.ejecutar('d1', 'analista-A', { nombreColumna: 'NoExiste', tipo: 'numerica', umbrales: [{ minimo: 0, etiqueta: 'Bajo' }] })
    ).rejects.toThrow(ColumnaDeDatasetInvalidaError);
  });

  test('rechaza una columnaClave que no existe en el dataset', async () => {
    const repository = repositorioFalso(datasetNumerico, registrosNumericos);
    const usecase = new ConfigurarCriterioDeClasificacion(repository);

    await expect(
      usecase.ejecutar('d1', 'analista-A', {
        nombreColumna: 'Puntaje',
        tipo: 'numerica',
        umbrales: [{ minimo: 0, etiqueta: 'Bajo' }],
        columnaClave: 'NoExiste'
      })
    ).rejects.toThrow(ColumnaDeDatasetInvalidaError);
  });

  test('rechaza una columna de texto libre (tipo detectado "texto")', async () => {
    const dataset = new DatasetGenerico('d3', 'analista-A', 'notas.xlsx', ['Producto', 'Descripcion'], 'archivo', null, 0);
    const registros = [
      new RegistroDatasetGenerico('r1', 'd3', 'analista-A', { Descripcion: 'Un texto libre bastante largo y único' }),
      new RegistroDatasetGenerico('r2', 'd3', 'analista-A', { Descripcion: 'Otro texto completamente distinto al anterior' })
    ];
    const repository = repositorioFalso(dataset, registros);
    const usecase = new ConfigurarCriterioDeClasificacion(repository);

    await expect(
      usecase.ejecutar('d3', 'analista-A', { nombreColumna: 'Descripcion', tipo: 'ordinal', ordenCategorias: ['a'] })
    ).rejects.toThrow(ColumnaDeDatasetInvalidaError);
    expect(repository.actualizarCriterioClasificacion).not.toHaveBeenCalled();
  });

  test('rechaza una columna de fecha', async () => {
    const dataset = new DatasetGenerico('d4', 'analista-A', 'fechas.xlsx', ['Producto', 'FechaAlta'], 'archivo', null, 0);
    const registros = [
      new RegistroDatasetGenerico('r1', 'd4', 'analista-A', { FechaAlta: '2024-01-15' }),
      new RegistroDatasetGenerico('r2', 'd4', 'analista-A', { FechaAlta: '2024-02-20' })
    ];
    const repository = repositorioFalso(dataset, registros);
    const usecase = new ConfigurarCriterioDeClasificacion(repository);

    await expect(
      usecase.ejecutar('d4', 'analista-A', { nombreColumna: 'FechaAlta', tipo: 'ordinal', ordenCategorias: ['a'] })
    ).rejects.toThrow(ColumnaDeDatasetInvalidaError);
  });

  test('rechaza tipo "numerica" sin umbrales', async () => {
    const repository = repositorioFalso(datasetNumerico, registrosNumericos);
    const usecase = new ConfigurarCriterioDeClasificacion(repository);

    await expect(
      usecase.ejecutar('d1', 'analista-A', { nombreColumna: 'Puntaje', tipo: 'numerica', umbrales: [] })
    ).rejects.toThrow(ColumnaDeDatasetInvalidaError);
  });

  test('rechaza tipo "ordinal" sobre columna numérica (tipo inconsistente con lo detectado)', async () => {
    const repository = repositorioFalso(datasetNumerico, registrosNumericos);
    const usecase = new ConfigurarCriterioDeClasificacion(repository);

    await expect(
      usecase.ejecutar('d1', 'analista-A', { nombreColumna: 'Puntaje', tipo: 'ordinal', ordenCategorias: ['a', 'b'] })
    ).rejects.toThrow(ColumnaDeDatasetInvalidaError);
  });

  test('rechaza tipo "ordinal" sin ordenCategorias sobre columna categórica', async () => {
    const repository = repositorioFalso(datasetCategorico, registrosCategoricos);
    const usecase = new ConfigurarCriterioDeClasificacion(repository);

    await expect(
      usecase.ejecutar('d2', 'analista-A', { nombreColumna: 'Prioridad', tipo: 'ordinal', ordenCategorias: [] })
    ).rejects.toThrow(ColumnaDeDatasetInvalidaError);
  });
});
