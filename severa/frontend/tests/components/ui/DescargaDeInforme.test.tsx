import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DescargaDeInforme } from '../../../src/components/ui/DescargaDeInforme';

function montar(enCurso = false) {
  const onDescargar = vi.fn();
  render(<DescargaDeInforme idBase="prueba" enCurso={enCurso} onDescargar={onDescargar} />);
  return {
    onDescargar,
    formato: screen.getByLabelText('Formato') as HTMLSelectElement,
    graficos: screen.getByLabelText(/Incluir cada gráfico como archivo aparte/) as HTMLInputElement,
    boton: () => screen.getByRole('button')
  };
}

describe('DescargaDeInforme', () => {
  test('por defecto descarga en PDF, sin gráficos adjuntos', async () => {
    const { onDescargar, formato, graficos, boton } = montar();

    expect(formato.value).toBe('pdf');
    expect(graficos.checked).toBe(false);
    await userEvent.click(boton());

    expect(onDescargar).toHaveBeenCalledWith({ formato: 'pdf', adjuntarGraficos: false });
  });

  test('ofrece los cinco formatos', () => {
    const { formato } = montar();
    expect([...formato.options].map((opcion) => opcion.value)).toEqual(['pdf', 'docx', 'html', 'latex', 'xlsx']);
  });

  test('formato y opción de gráficos elegidos llegan tal cual a onDescargar, y se avisa que será un .zip', async () => {
    const { onDescargar, formato, graficos, boton } = montar();

    await userEvent.selectOptions(formato, 'html');
    await userEvent.click(graficos);

    expect(screen.getByText(/Se descarga un \.zip con el informe y una carpeta de gráficos/)).toBeInTheDocument();
    await userEvent.click(boton());
    expect(onDescargar).toHaveBeenCalledWith({ formato: 'html', adjuntarGraficos: true });
  });

  test('con LaTeX la opción de gráficos queda marcada e inhabilitada (el paquete ya los trae) y no se manda', async () => {
    const { onDescargar, formato, graficos, boton } = montar();

    await userEvent.click(graficos);
    await userEvent.selectOptions(formato, 'latex');

    expect(graficos.checked).toBe(true);
    expect(graficos.disabled).toBe(true);
    expect(screen.getByText(/El paquete LaTeX siempre trae sus figuras/)).toBeInTheDocument();
    await userEvent.click(boton());
    expect(onDescargar).toHaveBeenCalledWith({ formato: 'latex', adjuntarGraficos: false });
  });

  test('al volver de LaTeX a otro formato se respeta lo que el usuario había elegido antes', async () => {
    const { formato, graficos } = montar();

    await userEvent.selectOptions(formato, 'latex');
    await userEvent.selectOptions(formato, 'docx');

    expect(graficos.checked).toBe(false);
    expect(graficos.disabled).toBe(false);
  });

  test('mientras se genera, el botón queda inhabilitado y lo dice', () => {
    const { boton } = montar(true);

    expect(boton()).toBeDisabled();
    expect(boton()).toHaveTextContent('Generando…');
  });
});
