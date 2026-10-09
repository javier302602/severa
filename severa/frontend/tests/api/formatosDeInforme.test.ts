import { describe, expect, test } from 'vitest';
import { FORMATOS_DE_INFORME, nombreDeArchivoDeInforme, parametrosDeInforme } from '../../src/api/formatosDeInforme';

describe('formatosDeInforme', () => {
  test('ofrece los cinco formatos del backend', () => {
    expect(FORMATOS_DE_INFORME.map((formato) => formato.valor)).toEqual(['pdf', 'docx', 'html', 'latex', 'xlsx']);
  });

  test('parametrosDeInforme: adjuntarGraficos solo viaja cuando está activo', () => {
    expect(parametrosDeInforme({ formato: 'html', adjuntarGraficos: false })).toEqual({ formato: 'html' });
    expect(parametrosDeInforme({ formato: 'pdf', adjuntarGraficos: true })).toEqual({ formato: 'pdf', adjuntarGraficos: 'true' });
  });

  describe('nombreDeArchivoDeInforme', () => {
    const blob = (tipo: string) => new Blob(['x'], { type: tipo });

    test.each([
      ['pdf', 'application/pdf', 'informe.pdf'],
      ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'informe.docx'],
      ['html', 'text/html; charset=utf-8', 'informe.html'],
      ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'informe.xlsx'],
      ['latex', 'application/zip', 'informe.zip']
    ] as const)('formato %s: la extensión sale del tipo que mandó el servidor', (formato, tipo, esperado) => {
      expect(nombreDeArchivoDeInforme('informe', blob(tipo), { formato, adjuntarGraficos: false })).toBe(esperado);
    });

    test('con gráficos adjuntos el servidor manda un zip aunque se haya pedido PDF: el archivo se guarda como .zip', () => {
      expect(nombreDeArchivoDeInforme('informe', blob('application/zip'), { formato: 'pdf', adjuntarGraficos: true })).toBe('informe.zip');
    });

    test('si el tipo del Blob no dice nada útil, se deduce del pedido', () => {
      expect(nombreDeArchivoDeInforme('informe', blob(''), { formato: 'docx', adjuntarGraficos: false })).toBe('informe.docx');
      expect(nombreDeArchivoDeInforme('informe', blob('application/octet-stream'), { formato: 'docx', adjuntarGraficos: true })).toBe('informe.zip');
      expect(nombreDeArchivoDeInforme('informe', blob(''), { formato: 'latex', adjuntarGraficos: false })).toBe('informe.zip');
    });
  });
});
