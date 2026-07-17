import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { RUTAS } from '../../routes/paths';
import { MensajeError } from '../../components/ui/MensajeError';
import { mensajeDeError } from '../../utils/mensajeDeError';

// Regla replicada de Correo.ts (backend): formato básico usuario@dominio, sin
// restricción de dominio (RegistrarAnalista no le pasa allowedDomains).
const esquemaLogin = z.object({
  correo: z.string().min(1, 'El correo es obligatorio').email('Correo inválido'),
  contrasena: z.string().min(1, 'La contraseña es obligatoria')
});

type DatosLogin = z.infer<typeof esquemaLogin>;

interface EstadoNavegacion {
  from?: string;
  mensaje?: string;
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const estadoNavegacion = location.state as EstadoNavegacion | null;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<DatosLogin>({ resolver: zodResolver(esquemaLogin) });

  const onSubmit = async (datos: DatosLogin) => {
    setErrorEnvio(null);
    try {
      await login(datos);
      navigate(estadoNavegacion?.from ?? RUTAS.catalogo, { replace: true });
    } catch (error) {
      setErrorEnvio(mensajeDeError(error));
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-slate-100 dark:bg-slate-950">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-sm space-y-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-8 shadow-sm"
      >
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Iniciar sesión — SEVERA</h1>

        {estadoNavegacion?.mensaje && (
          <p className="rounded-md bg-green-50 px-4 py-2 text-sm text-green-700 dark:bg-green-900/30 dark:text-green-300">
            {estadoNavegacion.mensaje}
          </p>
        )}
        {errorEnvio && <MensajeError mensaje={errorEnvio} />}

        <div>
          <label htmlFor="correo" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Correo
          </label>
          <input
            id="correo"
            type="email"
            autoComplete="email"
            {...register('correo')}
            className="campo-formulario mt-1 w-full"
          />
          {errors.correo && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.correo.message}</p>}
        </div>

        <div>
          <label htmlFor="contrasena" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Contraseña
          </label>
          <input
            id="contrasena"
            type="password"
            autoComplete="current-password"
            {...register('contrasena')}
            className="campo-formulario mt-1 w-full"
          />
          {errors.contrasena && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.contrasena.message}</p>}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300 disabled:opacity-50"
        >
          {isSubmitting ? 'Ingresando…' : 'Ingresar'}
        </button>

        <p className="text-center text-sm text-slate-600 dark:text-slate-400">
          ¿No tenés cuenta?{' '}
          <Link to={RUTAS.registro} className="text-slate-900 dark:text-slate-100 underline">
            Registrate
          </Link>
        </p>
      </form>
    </div>
  );
}
