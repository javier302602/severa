import { SesionAnalisisStoreEnMemoria } from '../../src/infrastructure/adapters/out/dataset-generico/SesionAnalisisStoreEnMemoria';

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
