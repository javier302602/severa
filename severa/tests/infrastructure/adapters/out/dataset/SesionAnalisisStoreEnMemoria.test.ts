import { SesionAnalisisStoreEnMemoria } from '../../../../../src/infrastructure/adapters/out/dataset/SesionAnalisisStoreEnMemoria';

const TREINTA_MINUTOS_MS = 30 * 60 * 1000;

function datosDePrueba(): { columnas: string[]; filas: Array<Record<string, unknown>> } {
  return { columnas: ['Producto'], filas: [{ Producto: 'Laptop' }] };
}

describe('SesionAnalisisStoreEnMemoria — Mejora 4 (Análisis de Datos General) Fase 3', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('un analista no puede acceder a un sesionId creado por otro analista (undefined, no revela que existe)', () => {
    const store = new SesionAnalisisStoreEnMemoria();
    const sesionId = store.crear('analista-A', datosDePrueba());

    expect(store.obtener('analista-B', sesionId)).toBeUndefined();
    // El dueño real sigue pudiendo acceder: el intento fallido de otro
    // analista no invalidó ni borró la sesión.
    expect(store.obtener('analista-A', sesionId)).toEqual(datosDePrueba());
  });

  test('un sesionId inexistente también devuelve undefined (mismo resultado que el caso de otro dueño)', () => {
    const store = new SesionAnalisisStoreEnMemoria();
    expect(store.obtener('analista-A', 'sesion-que-no-existe')).toBeUndefined();
  });

  test('la sesión expira tras 30 minutos y acceder después devuelve undefined', () => {
    jest.useFakeTimers();
    const store = new SesionAnalisisStoreEnMemoria();
    const sesionId = store.crear('analista-A', datosDePrueba());

    jest.advanceTimersByTime(TREINTA_MINUTOS_MS + 1);

    expect(store.obtener('analista-A', sesionId)).toBeUndefined();
  });

  test('el acceso renueva (desliza) la expiración: acceder antes del TTL extiende la vida más allá del TTL original', () => {
    jest.useFakeTimers();
    const store = new SesionAnalisisStoreEnMemoria();
    const sesionId = store.crear('analista-A', datosDePrueba());

    // A los 20 minutos (antes de expirar) se accede una vez: desliza la
    // expiración a 20 + 30 = 50 minutos desde la creación.
    jest.advanceTimersByTime(20 * 60 * 1000);
    expect(store.obtener('analista-A', sesionId)).toEqual(datosDePrueba());

    // A los 35 minutos desde la creación (5 más) — ya pasó el TTL
    // ORIGINAL (30 min) pero sigue viva gracias al deslizamiento.
    jest.advanceTimersByTime(15 * 60 * 1000);
    expect(store.obtener('analista-A', sesionId)).toEqual(datosDePrueba());

    // Sin volver a acceder, a los 30 minutos más (65 min desde la
    // creación, 30 desde el último acceso a los 35) ya debería haber
    // expirado.
    jest.advanceTimersByTime(TREINTA_MINUTOS_MS + 1);
    expect(store.obtener('analista-A', sesionId)).toBeUndefined();
  });

  test('el tope de 100 sesiones concurrentes descarta la más vieja (por creación) al excederlo', () => {
    const store = new SesionAnalisisStoreEnMemoria();
    const sesionIds = Array.from({ length: 100 }, (_, indice) =>
      store.crear(`analista-${indice}`, { columnas: ['n'], filas: [{ n: indice }] })
    );

    const primeraSesion = sesionIds[0];
    expect(store.obtener('analista-0', primeraSesion)).toBeDefined();

    // La sesión 101 excede el tope: debe descartar la primera (más vieja).
    const sesion101 = store.crear('analista-100', { columnas: ['n'], filas: [{ n: 100 }] });

    expect(store.obtener('analista-0', primeraSesion)).toBeUndefined();
    expect(store.obtener('analista-100', sesion101)).toBeDefined();
    // El resto (2da a 100ma) sigue vivo — solo se descartó la más vieja.
    expect(store.obtener('analista-1', sesionIds[1])).toBeDefined();
    expect(store.obtener('analista-99', sesionIds[99])).toBeDefined();
  });
});

// RF-111 (M-14, Ronda 2): la corrección de tipo vive en la sesión, para que
// todos los análisis posteriores de esa sesión la usen.
describe('SesionAnalisisStoreEnMemoria — actualizarTiposCorregidos (RF-111)', () => {
  test('guarda las correcciones sin tocar columnas, filas ni el dataset asociado', () => {
    const store = new SesionAnalisisStoreEnMemoria();
    const filas = [{ cp: 15001 }, { cp: 15003 }];
    const sesionId = store.crear('analista-A', { columnas: ['cp'], filas, datasetId: 'dataset-1' });

    expect(store.actualizarTiposCorregidos('analista-A', sesionId, { cp: 'categorica_nominal' })).toBe(true);

    const datos = store.obtener('analista-A', sesionId);
    expect(datos).toEqual({ columnas: ['cp'], filas, datasetId: 'dataset-1', tiposCorregidos: { cp: 'categorica_nominal' } });
    // Las filas son las mismas, no una copia: corregir un tipo no duplica el dataset en memoria.
    expect(datos?.filas).toBe(filas);
  });

  test('reemplaza el conjunto completo de correcciones (un objeto vacío las quita todas)', () => {
    const store = new SesionAnalisisStoreEnMemoria();
    const sesionId = store.crear('analista-A', { columnas: ['a', 'b'], filas: [], tiposCorregidos: { a: 'texto_libre', b: 'identificador' } });

    store.actualizarTiposCorregidos('analista-A', sesionId, { a: 'categorica_nominal' });
    expect(store.obtener('analista-A', sesionId)?.tiposCorregidos).toEqual({ a: 'categorica_nominal' });

    store.actualizarTiposCorregidos('analista-A', sesionId, {});
    expect(store.obtener('analista-A', sesionId)?.tiposCorregidos).toEqual({});
  });

  test('guarda una copia: modificar después el objeto que se le pasó no cambia la sesión', () => {
    const store = new SesionAnalisisStoreEnMemoria();
    const sesionId = store.crear('analista-A', { columnas: ['a'], filas: [] });
    const correcciones: Record<string, 'texto_libre' | 'identificador'> = { a: 'texto_libre' };

    store.actualizarTiposCorregidos('analista-A', sesionId, correcciones);
    correcciones.a = 'identificador';

    expect(store.obtener('analista-A', sesionId)?.tiposCorregidos).toEqual({ a: 'texto_libre' });
  });

  test('otro analista no puede modificar la sesión, y una sesión inexistente devuelve false', () => {
    const store = new SesionAnalisisStoreEnMemoria();
    const sesionId = store.crear('analista-A', { columnas: ['a'], filas: [] });

    expect(store.actualizarTiposCorregidos('analista-B', sesionId, { a: 'texto_libre' })).toBe(false);
    expect(store.actualizarTiposCorregidos('analista-A', 'no-existe', { a: 'texto_libre' })).toBe(false);
    expect(store.obtener('analista-A', sesionId)?.tiposCorregidos).toBeUndefined();
  });
});
