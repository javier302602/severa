import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { PostgresDatasetGenericoRepository } from '../../src/infrastructure/adapters/out/persistencia/repositorios/PostgresDatasetGenericoRepository';
import { PostgresAuditoriaRepository } from '../../src/infrastructure/adapters/out/persistencia/repositorios/PostgresAuditoriaRepository';
import { OperacionParaBitacora } from '../../src/application/ports/out/persistencia/repositorios/DatasetGenericoRepository';
import { DatasetGenerico } from '../../src/domain/entities/DatasetGenerico';
import { RegistroDatasetGenerico } from '../../src/domain/entities/RegistroDatasetGenerico';
import { CriterioDeClasificacionValue } from '../../src/domain/shared/value-objects/CriterioDeClasificacion';
import { DatasetGenericoNoEncontradoError } from '../../src/domain/errors/DatasetGenericoNoEncontradoError';

// Test de integración REAL contra Postgres (migración 016 aplicada). Lo que
// se prueba acá no lo puede probar un doble en memoria: que el SQL acote por
// analista, que la numeración de versiones aguante limpiezas simultáneas,
// que una versión a medio crear no quede guardada, y que la base rechace
// cualquier intento de modificar un dataset ya cargado (RF-137), venga de
// donde venga.
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/severa_dev';

const ANALISTA_A = 'analista-versiones-integration-a';
const ANALISTA_B = 'analista-versiones-integration-b';

const IMPUTAR: OperacionParaBitacora[] = [
  { operacion: 'imputar', variable: 'edad', registrosAfectados: 1, metodo: 'media', detalle: { valorImputado: 30 } }
];

describe('PostgresDatasetGenericoRepository — versiones, bitácora e inmutabilidad (integración real)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const repository = new PostgresDatasetGenericoRepository(pool);
  const auditoriaRepository = new PostgresAuditoriaRepository(pool);

  async function crearAnalistas(): Promise<void> {
    for (const [id, nombre] of [
      [ANALISTA_A, 'Ana Integración'],
      [ANALISTA_B, 'Beto Integración']
    ]) {
      await pool.query(
        `INSERT INTO analistas (id, nombre, correo, contrasena_hash, rol)
         VALUES ($1, $2, $3, 'hash', 'analista')
         ON CONFLICT (id) DO NOTHING`,
        [id, nombre, `${id}@severa.local`]
      );
    }
  }

  async function limpiar(): Promise<void> {
    // El borrado en cascada desde analistas se lleva datasets, versiones,
    // registros y bitácora; la auditoría no tiene FK y se borra aparte.
    await pool.query('DELETE FROM registros_auditoria WHERE usuario = ANY($1)', [[ANALISTA_A, ANALISTA_B]]);
    await pool.query('DELETE FROM analistas WHERE id = ANY($1)', [[ANALISTA_A, ANALISTA_B]]);
  }

  async function cargarOriginal(
    analistaId = ANALISTA_A,
    filas: Array<Record<string, unknown>> = [
      { edad: 20, ciudad: 'Lima' },
      { edad: null, ciudad: 'Cusco' },
      { edad: 40, ciudad: 'Lima' }
    ]
  ): Promise<DatasetGenerico> {
    const dataset = new DatasetGenerico(
      randomUUID(),
      analistaId,
      'encuesta.csv',
      Object.keys(filas[0]),
      'archivo',
      null,
      0,
      new Date('2026-03-01T10:00:00Z'),
      null,
      null,
      'a'.repeat(64),
      undefined,
      undefined,
      undefined,
      filas.length
    );
    await repository.guardar(dataset);
    await repository.guardarRegistros(
      filas.map((valores, posicion) => new RegistroDatasetGenerico(randomUUID(), dataset.id, analistaId, valores, new Date(), posicion))
    );
    return dataset;
  }

  function versionLimpia(base: DatasetGenerico, operaciones: OperacionParaBitacora[] = IMPUTAR) {
    return {
      base,
      columnas: ['edad', 'ciudad'],
      filas: [
        { edad: 20, ciudad: 'Lima' },
        { edad: 30, ciudad: 'Cusco' },
        { edad: 40, ciudad: 'Lima' }
      ],
      filasDuplicadas: 0,
      tiposCorregidos: {},
      operaciones,
      fecha: new Date('2026-03-02T15:00:00Z')
    };
  }

  beforeAll(async () => {
    await limpiar();
  });

  beforeEach(async () => {
    await crearAnalistas();
  });

  afterEach(async () => {
    await limpiar();
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('carga y lectura', () => {
    test('guarda el dataset como original (versión 0) y lo recupera completo', async () => {
      const dataset = await cargarOriginal();

      const leido = await repository.buscarPorId(dataset.id, ANALISTA_A);

      expect(leido).toMatchObject({
        id: dataset.id,
        nombreArchivo: 'encuesta.csv',
        columnas: ['edad', 'ciudad'],
        esOriginal: true,
        version: 0,
        totalFilas: 3,
        hashOriginalSha256: 'a'.repeat(64),
        tiposCorregidos: {},
        variableObjetivo: { estado: 'pendiente', columna: null }
      });
      expect(leido?.linaje).toEqual({ datasetOriginalId: null, version: 0, versionBase: null });
    });

    test('los registros vuelven en el orden del archivo, aunque se hayan insertado en otro', async () => {
      const dataset = await cargarOriginal(ANALISTA_A, [{ n: 'cabecera' }]);
      await repository.guardarRegistros(
        [3, 1, 2].map((posicion) => new RegistroDatasetGenerico(randomUUID(), dataset.id, ANALISTA_A, { n: `fila ${posicion}` }, new Date(), posicion))
      );

      const registros = await repository.listarRegistros(dataset.id, ANALISTA_A);

      expect(registros.map((registro) => registro.valores.n)).toEqual(['cabecera', 'fila 1', 'fila 2', 'fila 3']);
      expect(registros.map((registro) => registro.posicion)).toEqual([0, 1, 2, 3]);
    });

    test('una celda de fecha (Date) se recupera como Date, no como texto', async () => {
      const alta = new Date('2024-01-15T00:00:00.000Z');
      const dataset = await cargarOriginal(ANALISTA_A, [{ alta, nota: 'texto común', codigo: '2024-01-15' }]);

      const [registro] = await repository.listarRegistros(dataset.id, ANALISTA_A);

      expect(registro.valores.alta).toBeInstanceOf(Date);
      expect((registro.valores.alta as Date).getTime()).toBe(alta.getTime());
      // Un texto con forma de fecha corta sigue siendo el texto que era.
      expect(registro.valores.codigo).toBe('2024-01-15');
      expect(registro.valores.nota).toBe('texto común');
    });

    test('lo que es de un analista no existe para otro', async () => {
      const dataset = await cargarOriginal(ANALISTA_A);
      await repository.crearVersionProcesada(versionLimpia(dataset));

      expect(await repository.buscarPorId(dataset.id, ANALISTA_B)).toBeNull();
      expect(await repository.listarRegistros(dataset.id, ANALISTA_B)).toEqual([]);
      expect(await repository.listarVersiones(dataset.id, ANALISTA_B)).toEqual([]);
      expect(await repository.listarBitacora(dataset.id, ANALISTA_B)).toEqual([]);
      expect(await repository.listarTodos(ANALISTA_B)).toEqual([]);
    });
  });

  describe('RF-136 — versiones', () => {
    test('crea la versión 1 con sus propios registros y deja el original intacto', async () => {
      const original = await cargarOriginal();
      const registrosAntes = await repository.listarRegistros(original.id, ANALISTA_A);

      const v1 = await repository.crearVersionProcesada(versionLimpia(original));

      expect(v1).toMatchObject({ esOriginal: false, version: 1, fuente: 'limpieza', totalFilas: 3, hashOriginalSha256: null });
      expect(v1.linaje).toEqual({ datasetOriginalId: original.id, version: 1, versionBase: 0 });
      // Lo que devuelve es lo que quedó guardado.
      expect(await repository.buscarPorId(v1.id, ANALISTA_A)).toEqual(v1);

      const registrosV1 = await repository.listarRegistros(v1.id, ANALISTA_A);
      expect(registrosV1.map((registro) => registro.valores)).toEqual([
        { edad: 20, ciudad: 'Lima' },
        { edad: 30, ciudad: 'Cusco' },
        { edad: 40, ciudad: 'Lima' }
      ]);

      // RF-137: el original no cambió en nada.
      expect(await repository.listarRegistros(original.id, ANALISTA_A)).toEqual(registrosAntes);
      expect(await repository.buscarPorId(original.id, ANALISTA_A)).toEqual(original);
    });

    test('numera 1, 2, 3 dentro de la familia y recuerda de qué versión partió cada una', async () => {
      const original = await cargarOriginal();

      const v1 = await repository.crearVersionProcesada(versionLimpia(original));
      const v2 = await repository.crearVersionProcesada(versionLimpia(v1));
      const v3 = await repository.crearVersionProcesada(versionLimpia(original));

      expect([v1, v2, v3].map((version) => [version.version, version.linaje.versionBase])).toEqual([
        [1, 0],
        [2, 1],
        [3, 0]
      ]);
      // Todas cuelgan del original, también la que se generó a partir de v1.
      expect([v1, v2, v3].every((version) => version.idDelOriginal === original.id)).toBe(true);
      expect((await repository.listarVersiones(original.id, ANALISTA_A)).map((version) => version.version)).toEqual([0, 1, 2, 3]);
    });

    test('la numeración es por familia: otro dataset del mismo analista empieza de nuevo en 1', async () => {
      const uno = await cargarOriginal();
      const otro = await cargarOriginal();
      await repository.crearVersionProcesada(versionLimpia(uno));
      await repository.crearVersionProcesada(versionLimpia(uno));

      const v1DeOtro = await repository.crearVersionProcesada(versionLimpia(otro));

      expect(v1DeOtro.version).toBe(1);
      expect(await repository.listarTodos(ANALISTA_A)).toHaveLength(5);
    });

    test('limpiezas simultáneas del mismo dataset reciben números de versión distintos', async () => {
      const original = await cargarOriginal();

      const versiones = await Promise.all(Array.from({ length: 6 }, () => repository.crearVersionProcesada(versionLimpia(original))));

      expect(versiones.map((version) => version.version).sort()).toEqual([1, 2, 3, 4, 5, 6]);
      expect(await repository.listarVersiones(original.id, ANALISTA_A)).toHaveLength(7);
    });

    test('si algo falla a mitad de camino no queda nada guardado: ni versión, ni registros, ni bitácora', async () => {
      const original = await cargarOriginal();
      // Un valor que la columna INTEGER de la bitácora rechaza: la bitácora es
      // lo último que se escribe, así que la versión y sus registros ya se
      // insertaron dentro de la transacción cuando falla.
      const operacionInvalida: OperacionParaBitacora[] = [{ ...IMPUTAR[0], registrosAfectados: Number.NaN }];

      await expect(repository.crearVersionProcesada(versionLimpia(original, operacionInvalida))).rejects.toThrow();

      expect((await repository.listarVersiones(original.id, ANALISTA_A)).map((version) => version.version)).toEqual([0]);
      expect(await repository.listarBitacora(original.id, ANALISTA_A)).toEqual([]);
      const { rows } = await pool.query('SELECT count(*)::int AS total FROM registros_datasets_genericos WHERE analista_id = $1', [ANALISTA_A]);
      expect(rows[0].total).toBe(3);

      // Y el siguiente intento válido recibe el número 1, no el 2.
      expect((await repository.crearVersionProcesada(versionLimpia(original))).version).toBe(1);
    });

    test('no se puede versionar un dataset cuyo original ya no existe', async () => {
      const fantasma = new DatasetGenerico(randomUUID(), ANALISTA_A, 'no-guardado.csv', ['edad', 'ciudad'], 'archivo', null, 0);

      await expect(repository.crearVersionProcesada(versionLimpia(fantasma))).rejects.toThrow(DatasetGenericoNoEncontradoError);
    });

    test('la versión hereda criterio, columna clave y variable objetivo solo si sus columnas siguen existiendo', async () => {
      const original = await cargarOriginal();
      await repository.actualizarCriterioClasificacion(
        original.id,
        ANALISTA_A,
        CriterioDeClasificacionValue.numerica('edad', [{ minimo: 0, etiqueta: 'Bajo' }]),
        'ciudad'
      );
      await repository.actualizarVariableObjetivo(original.id, ANALISTA_A, { estado: 'confirmada', columna: 'edad' });
      const configurado = (await repository.buscarPorId(original.id, ANALISTA_A)) as DatasetGenerico;

      const conTodo = await repository.crearVersionProcesada(versionLimpia(configurado));
      const sinEdad = await repository.crearVersionProcesada({
        ...versionLimpia(configurado),
        columnas: ['ciudad'],
        filas: [{ ciudad: 'Lima' }]
      });

      const leidaConTodo = (await repository.buscarPorId(conTodo.id, ANALISTA_A)) as DatasetGenerico;
      expect(leidaConTodo.criterioClasificacion?.nombreColumna).toBe('edad');
      expect(leidaConTodo.columnaClave).toBe('ciudad');
      expect(leidaConTodo.variableObjetivo).toEqual({ estado: 'confirmada', columna: 'edad' });

      const leidaSinEdad = (await repository.buscarPorId(sinEdad.id, ANALISTA_A)) as DatasetGenerico;
      expect(leidaSinEdad.criterioClasificacion).toBeNull();
      expect(leidaSinEdad.columnaClave).toBe('ciudad');
      expect(leidaSinEdad.variableObjetivo).toEqual({ estado: 'pendiente', columna: null });
    });
  });

  describe('RF-110/111 — configuración del dataset', () => {
    test('guarda y recupera los tipos corregidos y la decisión sobre la variable objetivo', async () => {
      const dataset = await cargarOriginal();

      await repository.actualizarTiposCorregidos(dataset.id, ANALISTA_A, { edad: 'categorica_nominal' });
      await repository.actualizarVariableObjetivo(dataset.id, ANALISTA_A, { estado: 'confirmada', columna: 'ciudad' });

      expect(await repository.buscarPorId(dataset.id, ANALISTA_A)).toMatchObject({
        tiposCorregidos: { edad: 'categorica_nominal' },
        variableObjetivo: { estado: 'confirmada', columna: 'ciudad' }
      });

      await repository.actualizarVariableObjetivo(dataset.id, ANALISTA_A, { estado: 'rechazada', columna: null });
      expect((await repository.buscarPorId(dataset.id, ANALISTA_A))?.variableObjetivo).toEqual({ estado: 'rechazada', columna: null });
    });

    test('otro analista no puede cambiar la configuración de un dataset ajeno', async () => {
      const dataset = await cargarOriginal(ANALISTA_A);

      await repository.actualizarTiposCorregidos(dataset.id, ANALISTA_B, { edad: 'texto_libre' });
      await repository.actualizarVariableObjetivo(dataset.id, ANALISTA_B, { estado: 'confirmada', columna: 'edad' });

      expect(await repository.buscarPorId(dataset.id, ANALISTA_A)).toMatchObject({
        tiposCorregidos: {},
        variableObjetivo: { estado: 'pendiente', columna: null }
      });
    });

    test('la base no acepta una variable objetivo "confirmada" sin columna, ni "pendiente" con columna', async () => {
      const dataset = await cargarOriginal();

      await expect(
        pool.query(`UPDATE datasets_genericos SET estado_variable_objetivo = 'confirmada', variable_objetivo = NULL WHERE id = $1`, [dataset.id])
      ).rejects.toThrow(/chk_datasets_genericos_estado_objetivo/);
      await expect(
        pool.query(`UPDATE datasets_genericos SET estado_variable_objetivo = 'pendiente', variable_objetivo = 'edad' WHERE id = $1`, [dataset.id])
      ).rejects.toThrow(/chk_datasets_genericos_estado_objetivo/);
    });
  });

  describe('RF-123 — bitácora', () => {
    test('una limpieza deja una entrada por operación, en orden, con fecha, usuario, operación, variable, registros y método', async () => {
      const original = await cargarOriginal();
      const operaciones: OperacionParaBitacora[] = [
        { operacion: 'eliminar_columna', variable: 'notas', registrosAfectados: 9, metodo: 'eliminación de la columna' },
        { operacion: 'eliminar_registros', variable: 'ciudad', registrosAfectados: 1, metodo: 'eliminación de filas con el valor faltante' },
        { operacion: 'imputar', variable: 'edad', registrosAfectados: 2, metodo: 'mediana', detalle: { valorImputado: 30, nota: 'una nota' } }
      ];

      await repository.crearVersionProcesada(versionLimpia(original, operaciones));

      const bitacora = await repository.listarBitacora(original.id, ANALISTA_A);
      expect(bitacora.map((entrada) => [entrada.secuencia, entrada.operacion, entrada.variable, entrada.registrosAfectados, entrada.metodo])).toEqual([
        [0, 'eliminar_columna', 'notas', 9, 'eliminación de la columna'],
        [1, 'eliminar_registros', 'ciudad', 1, 'eliminación de filas con el valor faltante'],
        [2, 'imputar', 'edad', 2, 'mediana']
      ]);
      bitacora.forEach((entrada) => {
        expect(entrada).toMatchObject({
          datasetOriginalId: original.id,
          analistaId: ANALISTA_A,
          nombreAnalista: 'Ana Integración',
          versionOrigen: 0,
          versionResultado: 1
        });
        expect(entrada.fecha.toISOString()).toBe('2026-03-02T15:00:00.000Z');
      });
      expect(bitacora[2].detalle).toEqual({ valorImputado: 30, nota: 'una nota' });
      expect(bitacora[0].detalle).toEqual({});
    });

    test('las operaciones que no generan versión quedan con versionResultado nulo, y la bitácora reúne a toda la familia', async () => {
      const original = await cargarOriginal();
      await repository.registrarEnBitacora(
        original,
        [{ operacion: 'corregir_tipo', variable: 'edad', registrosAfectados: 2, metodo: 'manual', detalle: { tipoNuevo: 'categorica_nominal' } }],
        new Date('2026-03-02T09:00:00Z')
      );
      const v1 = await repository.crearVersionProcesada(versionLimpia(original));
      await repository.registrarEnBitacora(
        v1,
        [{ operacion: 'definir_variable_objetivo', variable: null, registrosAfectados: 0, metodo: 'descartada por el analista' }],
        new Date('2026-03-03T09:00:00Z')
      );

      const bitacora = await repository.listarBitacora(original.id, ANALISTA_A);

      expect(bitacora.map((entrada) => [entrada.operacion, entrada.variable, entrada.versionOrigen, entrada.versionResultado])).toEqual([
        ['corregir_tipo', 'edad', 0, null],
        ['imputar', 'edad', 0, 1],
        ['definir_variable_objetivo', null, 1, null]
      ]);
    });

    test('registrar una lista vacía de operaciones no hace nada', async () => {
      const original = await cargarOriginal();

      await repository.registrarEnBitacora(original, [], new Date());

      expect(await repository.listarBitacora(original.id, ANALISTA_A)).toEqual([]);
    });
  });

  // RF-137: "impedir, a nivel de diseño, que cualquier operación escriba
  // sobre el dataset original". Estas consultas van directo a la base, sin
  // pasar por el repositorio: simulan código futuro, un script o alguien con
  // acceso a psql.
  describe('RF-137 — la base rechaza modificar un dataset ya cargado', () => {
    test('no se puede modificar un registro (ni sus valores, ni su posición, ni a qué dataset pertenece)', async () => {
      const original = await cargarOriginal();
      const antes = await repository.listarRegistros(original.id, ANALISTA_A);

      await expect(
        pool.query(`UPDATE registros_datasets_genericos SET valores = '{"edad": 999}'::jsonb WHERE dataset_id = $1`, [original.id])
      ).rejects.toThrow(/toda transformación genera una versión nueva \(RF-137\)/);
      await expect(pool.query('UPDATE registros_datasets_genericos SET posicion = 0 WHERE dataset_id = $1', [original.id])).rejects.toThrow(/RF-137/);

      expect(await repository.listarRegistros(original.id, ANALISTA_A)).toEqual(antes);
    });

    test('tampoco los registros de una versión procesada', async () => {
      const v1 = await repository.crearVersionProcesada(versionLimpia(await cargarOriginal()));

      await expect(
        pool.query(`UPDATE registros_datasets_genericos SET valores = '{}'::jsonb WHERE dataset_id = $1`, [v1.id])
      ).rejects.toThrow(/RF-137/);
    });

    test.each([
      ['el nombre del archivo', `nombre_archivo = 'otro.csv'`],
      ['las columnas', `columnas = '["x"]'::jsonb`],
      ['el hash del archivo original', `hash_original_sha256 = 'b'`],
      ['la fecha de carga', `fecha_carga = now()`],
      ['el dueño', `analista_id = '${ANALISTA_B}'`],
      ['la cantidad de filas', `total_filas = 99`],
      ['la fuente', `fuente = 'limpieza'`]
    ])('no se puede cambiar %s de la cabecera', async (_que, asignacion) => {
      const original = await cargarOriginal();

      await expect(pool.query(`UPDATE datasets_genericos SET ${asignacion} WHERE id = $1`, [original.id])).rejects.toThrow(
        /El contenido de un dataset ya cargado no se modifica/
      );
      expect(await repository.buscarPorId(original.id, ANALISTA_A)).toEqual(original);
    });

    test('no se puede renumerar una versión ni moverla a otra familia', async () => {
      const original = await cargarOriginal();
      const otro = await cargarOriginal();
      const v1 = await repository.crearVersionProcesada(versionLimpia(original));

      await expect(pool.query('UPDATE datasets_genericos SET version = 7 WHERE id = $1', [v1.id])).rejects.toThrow(/RF-137/);
      await expect(pool.query('UPDATE datasets_genericos SET dataset_original_id = $2 WHERE id = $1', [v1.id, otro.id])).rejects.toThrow(/RF-137/);
      await expect(pool.query('UPDATE datasets_genericos SET version_base = 0, version = 2 WHERE id = $1', [v1.id])).rejects.toThrow(/RF-137/);
    });

    test('lo que el analista configura después de cargar SÍ se puede actualizar', async () => {
      const original = await cargarOriginal();

      await repository.actualizarTiposCorregidos(original.id, ANALISTA_A, { edad: 'categorica_nominal' });
      await repository.actualizarVariableObjetivo(original.id, ANALISTA_A, { estado: 'confirmada', columna: 'edad' });
      await repository.actualizarCriterioClasificacion(
        original.id,
        ANALISTA_A,
        CriterioDeClasificacionValue.numerica('edad', [{ minimo: 0, etiqueta: 'Bajo' }]),
        'ciudad'
      );

      const leido = (await repository.buscarPorId(original.id, ANALISTA_A)) as DatasetGenerico;
      expect(leido.tiposCorregidos).toEqual({ edad: 'categorica_nominal' });
      expect(leido.columnaClave).toBe('ciudad');
      expect(leido.criterioClasificacion?.nombreColumna).toBe('edad');
    });

    test('la bitácora tampoco se reescribe (RF-123)', async () => {
      const original = await cargarOriginal();
      await repository.crearVersionProcesada(versionLimpia(original));

      await expect(
        pool.query(`UPDATE bitacora_datasets SET metodo = 'otro', registros_afectados = 0 WHERE dataset_original_id = $1`, [original.id])
      ).rejects.toThrow(/La bitácora de un dataset no se modifica \(RF-123\)/);

      expect((await repository.listarBitacora(original.id, ANALISTA_A))[0]).toMatchObject({ metodo: 'media', registrosAfectados: 1 });
    });

    test('la base no acepta una numeración de versiones incoherente', async () => {
      const original = await cargarOriginal();
      const insertar = (version: number, versionBase: number | null, originalId: string | null) =>
        pool.query(
          `INSERT INTO datasets_genericos (id, analista_id, nombre_archivo, columnas, fuente, filas_duplicadas, dataset_original_id, version, version_base)
           VALUES ($1, $2, 'x.csv', '[]'::jsonb, 'limpieza', 0, $3, $4, $5)`,
          [randomUUID(), ANALISTA_A, originalId, version, versionBase]
        );

      // Un "original" con número de versión; una versión sin base; una
      // versión cuya base no es anterior a ella.
      await expect(insertar(1, null, null)).rejects.toThrow(/chk_datasets_genericos_version/);
      await expect(insertar(1, null, original.id)).rejects.toThrow(/chk_datasets_genericos_version/);
      await expect(insertar(2, 2, original.id)).rejects.toThrow(/chk_datasets_genericos_version/);

      // Y dos versiones con el mismo número en la misma familia, tampoco.
      await insertar(1, 0, original.id);
      await expect(insertar(1, 0, original.id)).rejects.toThrow(/uq_datasets_genericos_version/);
    });
  });

  // RF-98: eliminar la cuenta se lleva todos los datos del analista. Los
  // disparadores de inmutabilidad bloquean UPDATE, no DELETE.
  describe('RF-98 — eliminar la cuenta borra sus datasets, versiones, registros y bitácora', () => {
    test('el borrado en cascada funciona con versiones y bitácora de por medio, y no toca lo de otro analista', async () => {
      const original = await cargarOriginal(ANALISTA_A);
      const v1 = await repository.crearVersionProcesada(versionLimpia(original));
      await repository.crearVersionProcesada(versionLimpia(v1));
      const ajeno = await cargarOriginal(ANALISTA_B);

      await pool.query('DELETE FROM analistas WHERE id = $1', [ANALISTA_A]);

      const contar = async (tabla: string) =>
        (await pool.query(`SELECT count(*)::int AS total FROM ${tabla} WHERE analista_id = $1`, [ANALISTA_A])).rows[0].total;
      expect(await contar('datasets_genericos')).toBe(0);
      expect(await contar('registros_datasets_genericos')).toBe(0);
      expect(await contar('bitacora_datasets')).toBe(0);
      expect(await repository.listarRegistros(ajeno.id, ANALISTA_B)).toHaveLength(3);
    });
  });

  // RF-138: "el administrador puede consultar la auditoría completa de un
  // dataset específico".
  describe('RF-138 — auditoría por dataset', () => {
    async function auditar(accion: string, datasetId?: string): Promise<void> {
      await auditoriaRepository.registrar({ usuario: ANALISTA_A, accion, detalle: `detalle de ${accion}`, datasetId });
    }

    test('filtra por dataset y devuelve el datasetId de cada registro', async () => {
      const uno = await cargarOriginal();
      const otro = await cargarOriginal();
      await auditar('ImportarDatasetGenerico', uno.id);
      await auditar('LimpiarDatasetGenerico', uno.id);
      await auditar('ImportarDatasetGenerico', otro.id);
      await auditar('Login');

      const deUno = await auditoriaRepository.listar({ datasetId: uno.id });

      expect(deUno.map((registro) => registro.accion).sort()).toEqual(['ImportarDatasetGenerico', 'LimpiarDatasetGenerico']);
      expect(deUno.every((registro) => registro.datasetId === uno.id && registro.usuario === ANALISTA_A)).toBe(true);
    });

    test('pedirla con el id de una versión procesada devuelve la auditoría de toda la familia', async () => {
      const original = await cargarOriginal();
      const v1 = await repository.crearVersionProcesada(versionLimpia(original));
      await auditar('ImportarDatasetGenerico', original.id);
      await auditar('LimpiarDatasetGenerico', original.id);

      const porVersion = await auditoriaRepository.listar({ datasetId: v1.id });

      expect(porVersion.map((registro) => registro.accion).sort()).toEqual(['ImportarDatasetGenerico', 'LimpiarDatasetGenerico']);
    });

    test('sin filtro siguen apareciendo todos, los que tienen dataset y los que no', async () => {
      const original = await cargarOriginal();
      await auditar('ImportarDatasetGenerico', original.id);
      await auditar('Login');

      const propios = (await auditoriaRepository.listar()).filter((registro) => registro.usuario === ANALISTA_A);

      expect(propios.map((registro) => [registro.accion, registro.datasetId]).sort()).toEqual([
        ['ImportarDatasetGenerico', original.id],
        ['Login', null]
      ]);
    });

    test('un dataset sin operaciones auditadas, o un id que no existe, devuelve una lista vacía', async () => {
      const original = await cargarOriginal();

      expect(await auditoriaRepository.listar({ datasetId: original.id })).toEqual([]);
      expect(await auditoriaRepository.listar({ datasetId: 'no-existe' })).toEqual([]);
    });

    test('la auditoría de un dataset sobrevive a que el dataset se elimine con la cuenta', async () => {
      const original = await cargarOriginal();
      await auditar('ImportarDatasetGenerico', original.id);
      await auditar('ExportarDatasetGenerico', original.id);

      await pool.query('DELETE FROM analistas WHERE id = $1', [ANALISTA_A]);

      expect(await repository.buscarPorId(original.id, ANALISTA_A)).toBeNull();
      expect((await auditoriaRepository.listar({ datasetId: original.id })).map((registro) => registro.accion).sort()).toEqual([
        'ExportarDatasetGenerico',
        'ImportarDatasetGenerico'
      ]);
    });
  });
});
