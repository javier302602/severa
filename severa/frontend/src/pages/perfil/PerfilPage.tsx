import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { usePerfil, useEditarPerfil } from '../../hooks/usePerfil';
import { Spinner } from '../../components/ui/Spinner';
import { MensajeError } from '../../components/ui/MensajeError';
import { mensajeDeError } from '../../utils/mensajeDeError';

const ETIQUETA_ROL: Record<string, string> = {
  analista: 'Analista',
  administrador: 'Administrador'
};

// Mismas reglas que RegistroPage: el correo exige formato válido, el nombre
// solo "no vacío" (el backend, vía Correo.ts y Analista.actualizarPerfil, no
// impone nada más).
const esquemaPerfil = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio'),
  correo: z.string().min(1, 'El correo es obligatorio').email('Correo inválido')
});

type DatosPerfil = z.infer<typeof esquemaPerfil>;

// RF-09/RF-10 (M-02). GET /perfil trae nombre/correo/rol del analista
// autenticado (nunca de un id pasado por el cliente — ver PerfilController.ts
// y el test IDOR en AppSeguridad.test.ts); PUT /perfil edita nombre/correo.
// El rol se muestra pero no se expone como campo editable: ni
// EditarPerfilUseCase ni Analista.actualizarPerfil aceptan cambiarlo.
export function PerfilPage() {
  const { data, isLoading, isError, error } = usePerfil();
  const editarPerfil = useEditarPerfil();
  const [guardadoOk, setGuardadoOk] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<DatosPerfil>({
    resolver: zodResolver(esquemaPerfil),
    values: data ? { nombre: data.nombre, correo: data.correo } : undefined
  });

  const onSubmit = async (datos: DatosPerfil) => {
    setGuardadoOk(false);
    try {
      await editarPerfil.mutateAsync(datos);
      setGuardadoOk(true);
    } catch {
      // El error ya queda expuesto vía editarPerfil.isError/error más abajo.
    }
  };

  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Mi perfil</h1>

      {isLoading && <Spinner etiqueta="Cargando perfil…" />}
      {isError && <MensajeError mensaje={mensajeDeError(error)} />}

      {data && (
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm p-6"
        >
          {editarPerfil.isError && <MensajeError mensaje={mensajeDeError(editarPerfil.error)} />}
          {guardadoOk && !editarPerfil.isError && (
            <p className="rounded-md border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
              Perfil actualizado.
            </p>
          )}

          <div>
            <label htmlFor="nombre" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Nombre
            </label>
            <input id="nombre" type="text" autoComplete="name" {...register('nombre')} className="campo-formulario mt-1 w-full" />
            {errors.nombre && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.nombre.message}</p>}
          </div>

          <div>
            <label htmlFor="correo" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Correo
            </label>
            <input id="correo" type="email" autoComplete="email" {...register('correo')} className="campo-formulario mt-1 w-full" />
            {errors.correo && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.correo.message}</p>}
          </div>

          <div>
            <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">Rol</span>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{ETIQUETA_ROL[data.rol] ?? data.rol}</p>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || editarPerfil.isPending}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300 disabled:opacity-50"
          >
            {editarPerfil.isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </form>
      )}
    </div>
  );
}
