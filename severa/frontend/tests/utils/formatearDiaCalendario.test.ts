import { describe, expect, test } from 'vitest';
import { formatearDiaCalendario } from '../../src/utils/formatearDiaCalendario';

describe('formatearDiaCalendario', () => {
  test('muestra el día que dice el dato, no el anterior, aunque el navegador esté al oeste de Greenwich', () => {
    // Medianoche UTC del 10 de enero: en UTC-5 (Perú) todavía es 9 de enero.
    const texto = formatearDiaCalendario('2024-01-10T00:00:00.000Z');

    expect(texto).toBe(new Date(Date.UTC(2024, 0, 10)).toLocaleDateString(undefined, { timeZone: 'UTC' }));
    expect(texto).toContain('10');
    expect(texto).not.toMatch(/(^|\D)9(\D|$)/);
  });

  test('un valor que no es una fecha no rompe la pantalla', () => {
    expect(formatearDiaCalendario('no-es-fecha')).toBe('—');
  });
});
