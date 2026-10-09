import { formatearMomento, formatearDiaCalendario } from '../../../../../src/infrastructure/adapters/out/reportes/FormatoDeFechasInforme';
import { config } from '../../../../../src/infrastructure/config/env';

// Las dos funciones tienen que dar lo mismo sin importar la zona horaria ni
// el idioma del servidor. Se fuerza una zona al oeste de Greenwich para todo
// el archivo: es donde el código viejo (toLocaleDateString() a secas) se
// equivocaba de día.
const ZONA_ORIGINAL = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'America/Lima';
});
afterAll(() => {
  process.env.TZ = ZONA_ORIGINAL;
});

describe('formatearMomento — hora de generación del informe', () => {
  const instante = new Date('2026-10-08T19:05:26Z');

  test('día/mes/año y hora de 24 h en la zona pedida, con la zona escrita', () => {
    expect(formatearMomento(instante, 'America/Lima')).toBe('08/10/2026 14:05 (America/Lima)');
    expect(formatearMomento(instante, 'Europe/Madrid')).toBe('08/10/2026 21:05 (Europe/Madrid)');
  });

  test('cruza la medianoche correctamente', () => {
    expect(formatearMomento(new Date('2026-10-09T03:30:00Z'), 'America/Lima')).toBe('08/10/2026 22:30 (America/Lima)');
  });

  test('sin zona explícita usa la configurada (ZONA_HORARIA_INFORMES), no la del proceso', () => {
    process.env.TZ = 'Asia/Tokyo';
    try {
      expect(formatearMomento(instante)).toBe(formatearMomento(instante, config.zonaHorariaInformes));
      expect(formatearMomento(instante)).toContain(`(${config.zonaHorariaInformes})`);
    } finally {
      process.env.TZ = 'America/Lima';
    }
  });

  test('zona mal escrita en la configuración: cae a UTC y lo dice, no tumba la generación del informe', () => {
    expect(formatearMomento(instante, 'Peru/Tingo_Maria')).toBe('08/10/2026 19:05 (UTC)');
  });

  test('solo caracteres que las fuentes estándar del PDF tienen (sin espacios U+202F/U+00A0 de Intl)', () => {
    expect(formatearMomento(instante, 'America/Lima')).toMatch(/^[\x20-\x7e]+$/);
  });
});

describe('formatearDiaCalendario — un día sin hora', () => {
  test('medianoche UTC del 10 de enero es 10 de enero, no el día anterior, aunque el servidor esté en UTC-5', () => {
    expect(formatearDiaCalendario('2024-01-10T00:00:00.000Z')).toBe('2024-01-10');
    expect(formatearDiaCalendario(new Date(Date.UTC(2024, 5, 28)))).toBe('2024-06-28');
  });

  test('un valor inválido no tira: queda rotulado', () => {
    expect(formatearDiaCalendario('no-es-fecha')).toBe('fecha inválida');
  });
});
