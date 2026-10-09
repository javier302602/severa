import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LimpiezaSeccion } from '../../../src/pages/analisis-datos/LimpiezaSeccion';
import {
  analisisDatosService,
  type PropuestaDeLimpieza,
  type ResultadoDeLimpiezaAplicada,
  type ResumenDeLimpieza
} from '../../../src/api/analisisDatosService';
import { HttpError } from '../../../src/api/httpClient';
import { EnvoltorioQuery } from '../../testUtils';

vi.mock('../../../src/api/analisisDatosService', () => ({
  analisisDatosService: { obtenerPropuestaDeLimpieza: vi.fn(), previsualizarLimpieza: vi.fn(), aplicarLimpieza: vi.fn() }
}));

// M-15, Ronda 2. RF-120: "el sistema nunca aplica una estrategia de
// tratamiento sin confirmación explícita del analista". En pantalla eso son
// tres pasos —elegir, ver qué pasaría, confirmar— y acá se comprueba que no
// se puede saltear ninguno.
const propuesta: PropuestaDeLimpieza = {
  totalFilas: 60,
  totalColumnas: 4,
  propuestas: [
    {
      columna: 'edad',
      tipo: 'numerica_discreta',
      valoresFaltantes: 7,
      porcentajeFaltante: 11.666,
      opciones: [
        { estrategia: 'eliminar_registros', disponible: true, metodos: [] },
        { estrategia: 'eliminar_columna', disponible: true, metodos: [] },
        { estrategia: 'imputar', disponible: true, metodos: ['media', 'mediana'] }
      ],
      recomendacion: { estrategia: 'imputar', metodo: 'media', motivo: 'Faltan 7 de 60 (11.7%): la variable no tiene valores atípicos.' }
    },
    {
      columna: 'ciudad',
      tipo: 'categorica_nominal',
      valoresFaltantes: 3,
      porcentajeFaltante: 5,
      opciones: [
        { estrategia: 'eliminar_registros', disponible: true, metodos: [] },
        { estrategia: 'eliminar_columna', disponible: true, metodos: [] },
        { estrategia: 'imputar', disponible: true, metodos: ['moda'] }
      ],
      recomendacion: { estrategia: 'eliminar_registros', motivo: 'Faltan pocos valores (3 de 60 (5%)).' }
    },
    {
      columna: 'alta',
      tipo: 'fecha',
      valoresFaltantes: 12,
      porcentajeFaltante: 20,
      opciones: [
        { estrategia: 'eliminar_registros', disponible: true, metodos: [] },
        { estrategia: 'eliminar_columna', disponible: true, metodos: [] },
        { estrategia: 'imputar', disponible: false, metodos: [], motivoNoDisponible: 'esta variable es de tipo fecha.' }
      ],
      recomendacion: { estrategia: 'no_tratar', motivo: 'Conviene dejarla como está.' }
    }
  ]
};

const resumen: ResumenDeLimpieza = {
  filasAntes: 60,
  filasDespues: 57,
  filasEliminadas: 3,
  columnasEliminadas: [],
  celdasImputadas: 7,
  operaciones: [
    { operacion: 'eliminar_registros', variable: 'ciudad', registrosAfectados: 3, metodo: 'eliminación de filas con el valor faltante' },
    { operacion: 'imputar', variable: 'edad', registrosAfectados: 7, metodo: 'media', valorImputado: 37.61234, nota: 'La media no es un número entero.' }
  ]
};

const resultado: ResultadoDeLimpiezaAplicada = {
  sesionId: 'sesion-2',
  datasetId: 'dataset-v1',
  datasetOriginalId: 'dataset-1',
  nombreArchivo: 'encuesta.csv',
  version: 1,
  versionBase: 0,
  diagnostico: { totalFilas: 57, filasDuplicadas: 0, columnas: [] },
  tiposCorregidos: {},
  variableObjetivo: { estado: 'pendiente', columna: null },
  resumen
};

function renderizar() {
  const onVersionGenerada = vi.fn();
  render(<LimpiezaSeccion sesionId="sesion-1" onReiniciar={vi.fn()} onVersionGenerada={onVersionGenerada} />, { wrapper: EnvoltorioQuery });
  return { onVersionGenerada };
}

const botonVer = () => screen.getByRole('button', { name: 'Ver qué pasaría' });
const botonGenerar = () => screen.queryByRole('button', { name: 'Generar versión procesada' });

describe('LimpiezaSeccion — RF-120/121', () => {
  afterEach(() => vi.clearAllMocks());

  test('muestra una fila por variable con faltantes, con la recomendación del sistema y su motivo', async () => {
    vi.mocked(analisisDatosService.obtenerPropuestaDeLimpieza).mockResolvedValue(propuesta);

    renderizar();

    const filaEdad = (await screen.findByText('7 (11.7%)')).closest('tr') as HTMLElement;
    // El texto de la recomendación (aparte de la opción del selector, que dice lo mismo).
    expect(within(filaEdad).getAllByText('Imputar por la media')[0].tagName).toBe('SPAN');
    expect(within(filaEdad).getByText(/la variable no tiene valores atípicos/)).toBeInTheDocument();
    expect(within(filaEdad).getByText('Numérica discreta')).toBeInTheDocument();
    expect(screen.getByText('Eliminar los registros')).toBeInTheDocument();
    expect(screen.getByText('No tratarla')).toBeInTheDocument();
    expect(analisisDatosService.obtenerPropuestaDeLimpieza).toHaveBeenCalledWith('sesion-1');
  });

  test('por defecto no hay nada elegido: la recomendación no se aplica sola', async () => {
    vi.mocked(analisisDatosService.obtenerPropuestaDeLimpieza).mockResolvedValue(propuesta);

    renderizar();
    await screen.findByLabelText('Qué hacer con edad');

    ['edad', 'ciudad', 'alta'].forEach((columna) => {
      expect((screen.getByLabelText(`Qué hacer con ${columna}`) as HTMLSelectElement).value).toBe('');
    });
    expect(botonVer()).toBeDisabled();
    expect(botonGenerar()).not.toBeInTheDocument();
    expect(analisisDatosService.previsualizarLimpieza).not.toHaveBeenCalled();
    expect(analisisDatosService.aplicarLimpieza).not.toHaveBeenCalled();
  });

  test('RF-121: cada variable ofrece solo los métodos que le corresponden, y explica cuando no se puede imputar', async () => {
    vi.mocked(analisisDatosService.obtenerPropuestaDeLimpieza).mockResolvedValue(propuesta);

    renderizar();
    const opcionesDe = async (columna: string) =>
      Array.from(((await screen.findByLabelText(`Qué hacer con ${columna}`)) as HTMLSelectElement).options).map((opcion) => opcion.value);

    expect(await opcionesDe('edad')).toEqual(['', 'eliminar_registros', 'eliminar_columna', 'imputar:media', 'imputar:mediana']);
    expect(await opcionesDe('ciudad')).toEqual(['', 'eliminar_registros', 'eliminar_columna', 'imputar:moda']);
    expect(await opcionesDe('alta')).toEqual(['', 'eliminar_registros', 'eliminar_columna']);
    expect(screen.getByText('No se puede imputar: esta variable es de tipo fecha.')).toBeInTheDocument();
  });

  test('"Usar las recomendaciones" las carga en los selectores, pero todavía no aplica nada', async () => {
    vi.mocked(analisisDatosService.obtenerPropuestaDeLimpieza).mockResolvedValue(propuesta);
    renderizar();

    await userEvent.click(await screen.findByRole('button', { name: 'Usar las recomendaciones' }));

    expect((screen.getByLabelText('Qué hacer con edad') as HTMLSelectElement).value).toBe('imputar:media');
    expect((screen.getByLabelText('Qué hacer con ciudad') as HTMLSelectElement).value).toBe('eliminar_registros');
    // "No tratarla" queda sin tratar.
    expect((screen.getByLabelText('Qué hacer con alta') as HTMLSelectElement).value).toBe('');
    expect(analisisDatosService.previsualizarLimpieza).not.toHaveBeenCalled();
    expect(analisisDatosService.aplicarLimpieza).not.toHaveBeenCalled();
  });

  test('la vista previa manda solo las variables con tratamiento elegido y muestra qué pasaría', async () => {
    vi.mocked(analisisDatosService.obtenerPropuestaDeLimpieza).mockResolvedValue(propuesta);
    vi.mocked(analisisDatosService.previsualizarLimpieza).mockResolvedValue(resumen);
    renderizar();
    await userEvent.click(await screen.findByRole('button', { name: 'Usar las recomendaciones' }));

    await userEvent.click(botonVer());

    await waitFor(() =>
      expect(analisisDatosService.previsualizarLimpieza).toHaveBeenCalledWith('sesion-1', [
        { columna: 'edad', estrategia: 'imputar', metodo: 'media' },
        { columna: 'ciudad', estrategia: 'eliminar_registros' }
      ])
    );
    expect(await screen.findByText(/De 60 fila\(s\) quedarían 57 \(se eliminan 3\)/)).toBeInTheDocument();
    expect(screen.getByText('media (valor: 37.6123)')).toBeInTheDocument();
    expect(screen.getByText('La media no es un número entero.')).toBeInTheDocument();
    // Ver la vista previa no aplica nada.
    expect(analisisDatosService.aplicarLimpieza).not.toHaveBeenCalled();
  });

  test('sin marcar la casilla de confirmación no se puede generar la versión', async () => {
    vi.mocked(analisisDatosService.obtenerPropuestaDeLimpieza).mockResolvedValue(propuesta);
    vi.mocked(analisisDatosService.previsualizarLimpieza).mockResolvedValue(resumen);
    renderizar();
    await userEvent.click(await screen.findByRole('button', { name: 'Usar las recomendaciones' }));
    await userEvent.click(botonVer());
    await screen.findByText('Vista previa: qué pasaría');

    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(botonGenerar()).toBeDisabled();
    await userEvent.click(botonGenerar() as HTMLElement);

    expect(analisisDatosService.aplicarLimpieza).not.toHaveBeenCalled();
  });

  test('con la casilla marcada aplica exactamente lo que se vio en la vista previa y avisa a la página', async () => {
    vi.mocked(analisisDatosService.obtenerPropuestaDeLimpieza).mockResolvedValue(propuesta);
    vi.mocked(analisisDatosService.previsualizarLimpieza).mockResolvedValue(resumen);
    vi.mocked(analisisDatosService.aplicarLimpieza).mockResolvedValue(resultado);
    const { onVersionGenerada } = renderizar();
    await userEvent.click(await screen.findByRole('button', { name: 'Usar las recomendaciones' }));
    await userEvent.click(botonVer());
    await screen.findByText('Vista previa: qué pasaría');

    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(botonGenerar() as HTMLElement);

    await waitFor(() =>
      expect(analisisDatosService.aplicarLimpieza).toHaveBeenCalledWith('sesion-1', [
        { columna: 'edad', estrategia: 'imputar', metodo: 'media' },
        { columna: 'ciudad', estrategia: 'eliminar_registros' }
      ])
    );
    expect(analisisDatosService.aplicarLimpieza).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onVersionGenerada).toHaveBeenCalledWith(resultado));
  });

  test('cambiar una elección después de la vista previa la descarta, junto con la confirmación', async () => {
    vi.mocked(analisisDatosService.obtenerPropuestaDeLimpieza).mockResolvedValue(propuesta);
    vi.mocked(analisisDatosService.previsualizarLimpieza).mockResolvedValue(resumen);
    renderizar();
    await userEvent.click(await screen.findByRole('button', { name: 'Usar las recomendaciones' }));
    await userEvent.click(botonVer());
    await screen.findByText('Vista previa: qué pasaría');
    await userEvent.click(screen.getByRole('checkbox'));

    await userEvent.selectOptions(screen.getByLabelText('Qué hacer con edad'), 'imputar:mediana');

    // Lo que se confirma tiene que ser lo que se acaba de ver: hay que volver a pedir la vista previa.
    expect(screen.queryByText('Vista previa: qué pasaría')).not.toBeInTheDocument();
    expect(botonGenerar()).not.toBeInTheDocument();

    await userEvent.click(botonVer());
    await screen.findByText('Vista previa: qué pasaría');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(analisisDatosService.previsualizarLimpieza).toHaveBeenLastCalledWith('sesion-1', [
      { columna: 'edad', estrategia: 'imputar', metodo: 'mediana' },
      { columna: 'ciudad', estrategia: 'eliminar_registros' }
    ]);
  });

  test('si el backend rechaza las decisiones, muestra el motivo y no ofrece confirmar', async () => {
    vi.mocked(analisisDatosService.obtenerPropuestaDeLimpieza).mockResolvedValue(propuesta);
    vi.mocked(analisisDatosService.previsualizarLimpieza).mockRejectedValue(
      new HttpError(400, 'Con estas decisiones se eliminarían todas las filas del dataset.')
    );
    renderizar();
    await userEvent.selectOptions(await screen.findByLabelText('Qué hacer con alta'), 'eliminar_registros');

    await userEvent.click(botonVer());

    expect(await screen.findByRole('alert')).toHaveTextContent('se eliminarían todas las filas');
    expect(botonGenerar()).not.toBeInTheDocument();
  });

  test('si falla al generar la versión, muestra el error y no avisa a la página', async () => {
    vi.mocked(analisisDatosService.obtenerPropuestaDeLimpieza).mockResolvedValue(propuesta);
    vi.mocked(analisisDatosService.previsualizarLimpieza).mockResolvedValue(resumen);
    vi.mocked(analisisDatosService.aplicarLimpieza).mockRejectedValue(new HttpError(400, 'La limpieza no se aplica sin confirmación explícita.'));
    const { onVersionGenerada } = renderizar();
    await userEvent.click(await screen.findByRole('button', { name: 'Usar las recomendaciones' }));
    await userEvent.click(botonVer());
    await screen.findByText('Vista previa: qué pasaría');
    await userEvent.click(screen.getByRole('checkbox'));

    await userEvent.click(botonGenerar() as HTMLElement);

    expect(await screen.findByRole('alert')).toHaveTextContent('sin confirmación explícita');
    expect(onVersionGenerada).not.toHaveBeenCalled();
  });

  test('un dataset sin valores faltantes no tiene nada que tratar', async () => {
    vi.mocked(analisisDatosService.obtenerPropuestaDeLimpieza).mockResolvedValue({ totalFilas: 10, totalColumnas: 2, propuestas: [] });

    renderizar();

    expect(await screen.findByText('Este dataset no tiene valores faltantes: no hay nada que tratar.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver qué pasaría' })).not.toBeInTheDocument();
  });
});
