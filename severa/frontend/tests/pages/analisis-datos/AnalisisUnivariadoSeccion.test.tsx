import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnalisisUnivariadoSeccion } from '../../../src/pages/analisis-datos/AnalisisUnivariadoSeccion';
import { analisisDatosService, type AnalisisUnivariado } from '../../../src/api/analisisDatosService';
import { EnvoltorioQuery } from '../../testUtils';

vi.mock('../../../src/api/analisisDatosService', () => ({
  analisisDatosService: { obtenerAnalisisUnivariado: vi.fn() }
}));

const columnas = [
  { nombre: 'Precio', tipo: 'numerica' as const, valoresFaltantes: 0, porcentajeFaltante: 0, valoresUnicos: 5, valoresInconsistentes: 0 },
  { nombre: 'Categoria', tipo: 'categorica' as const, valoresFaltantes: 0, porcentajeFaltante: 0, valoresUnicos: 2, valoresInconsistentes: 0 }
];

const analisisNumerico: AnalisisUnivariado = {
  tipo: 'numerica',
  nombre: 'Precio',
  valoresValidos: 5,
  valoresFaltantes: 0,
  resumenCincoNumeros: { minimo: 10, q1: 50, mediana: 90, q3: 150, maximo: 200, media: 100 },
  moda: [90],
  varianza: 10,
  desviacionEstandar: 3.16,
  coeficienteVariacion: 3.16,
  distribucion: [{ intervalo: '10-200', limiteInferior: 10, limiteSuperior: 200, marcaDeClase: 105, frecuenciaAbsoluta: 5, frecuenciaRelativa: 1, frecuenciaRelativaPorcentaje: 100, frecuenciaAcumulada: 5, frecuenciaRelativaAcumulada: 1 }]
};

const analisisCategorico: AnalisisUnivariado = {
  tipo: 'categorica',
  nombre: 'Categoria',
  valoresValidos: 5,
  valoresFaltantes: 0,
  valoresUnicos: 2,
  moda: ['Electronica'],
  distribucion: [
    { valor: 'Electronica', frecuenciaAbsoluta: 3, frecuenciaRelativaPorcentaje: 60 },
    { valor: 'Muebles', frecuenciaAbsoluta: 2, frecuenciaRelativaPorcentaje: 40 }
  ]
};

describe('AnalisisUnivariadoSeccion', () => {
  afterEach(() => vi.clearAllMocks());

  test('analiza la primera columna por defecto y renderiza la vista numérica (histograma + resumen)', async () => {
    vi.mocked(analisisDatosService.obtenerAnalisisUnivariado).mockResolvedValue(analisisNumerico);

    render(<AnalisisUnivariadoSeccion sesionId="sesion-1" columnas={columnas} onReiniciar={vi.fn()} />, { wrapper: EnvoltorioQuery });

    await waitFor(() => expect(analisisDatosService.obtenerAnalisisUnivariado).toHaveBeenCalledWith('sesion-1', 'Precio'));
    expect(await screen.findByText('10-200')).toBeInTheDocument();
  });

  test('cambiar la columna en el selector pide el análisis de la nueva columna y muestra la vista categórica', async () => {
    vi.mocked(analisisDatosService.obtenerAnalisisUnivariado).mockImplementation((_sesionId, columna) =>
      Promise.resolve(columna === 'Categoria' ? analisisCategorico : analisisNumerico)
    );

    render(<AnalisisUnivariadoSeccion sesionId="sesion-1" columnas={columnas} onReiniciar={vi.fn()} />, { wrapper: EnvoltorioQuery });
    await waitFor(() => expect(analisisDatosService.obtenerAnalisisUnivariado).toHaveBeenCalledWith('sesion-1', 'Precio'));

    await userEvent.selectOptions(screen.getByLabelText('Columna'), 'Categoria');

    await waitFor(() => expect(analisisDatosService.obtenerAnalisisUnivariado).toHaveBeenCalledWith('sesion-1', 'Categoria'));
    expect(await screen.findByText('Electronica')).toBeInTheDocument();
    expect(screen.getByText('Muebles')).toBeInTheDocument();
  });
});
