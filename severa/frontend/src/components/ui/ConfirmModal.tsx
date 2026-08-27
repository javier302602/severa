import type { ReactNode } from 'react';

interface ConfirmModalProps {
  titulo: string;
  mensaje: ReactNode;
  textoConfirmar?: string;
  textoCancelar?: string;
  confirmando?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

// Modal de confirmación genérico para acciones destructivas/irreversibles
// (ver "Restablecer datos" en ImportarDatasetPage.tsx). No hay ningún patrón
// de modal existente en el resto del frontend para reutilizar — este queda
// como el primero, con la misma paleta/convenciones de dark mode que el
// resto de components/ui/.
export function ConfirmModal({
  titulo,
  mensaje,
  textoConfirmar = 'Confirmar',
  textoCancelar = 'Cancelar',
  confirmando = false,
  onConfirmar,
  onCancelar
}: ConfirmModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-titulo"
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl dark:bg-slate-800">
        <h2 id="confirm-modal-titulo" className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {titulo}
        </h2>
        <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">{mensaje}</div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancelar}
            disabled={confirmando}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50 dark:text-slate-300 dark:ring-slate-600 dark:hover:bg-slate-700"
          >
            {textoCancelar}
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={confirmando}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {confirmando ? 'Procesando…' : textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
