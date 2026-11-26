import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { useAutenticacion } from '../context/AuthContext';
import { useAvisos } from '../context/AvisosContext';

/**
 * Pantalla de inicio de sesion.
 *
 * Incluye credenciales de demostracion visibles: en la sustentacion evita
 * perder tiempo escribiendo correos a mano y deja claro al evaluador que
 * existe un conjunto de datos de prueba cargado.
 */

const CUENTAS_DEMO = [
  { rol: 'Administrador', correo: 'admin@sistema-tickets.local', color: 'text-violet-700' },
  { rol: 'Agente', correo: 'agente1@sistema-tickets.local', color: 'text-blue-700' },
  { rol: 'Solicitante', correo: 'usuario1@sistema-tickets.local', color: 'text-slate-700' },
];

const CONTRASENA_DEMO = 'Demo2026#Tickets';

export default function IniciarSesion() {
  const { iniciarSesion, autenticado, cargando } = useAutenticacion();
  const { exito, mostrarError } = useAvisos();
  const navegar = useNavigate();
  const ubicacion = useLocation();

  const [formulario, setFormulario] = useState({ correo: '', contrasena: '' });
  const [enviando, setEnviando] = useState(false);
  const [verContrasena, setVerContrasena] = useState(false);
  const [erroresCampo, setErroresCampo] = useState({});

  // Si ya hay sesion activa, no tiene sentido mostrar el formulario.
  if (!cargando && autenticado) {
    return <Navigate to={ubicacion.state?.desde || '/'} replace />;
  }

  function actualizarCampo(campo, valor) {
    setFormulario((actual) => ({ ...actual, [campo]: valor }));
    if (erroresCampo[campo]) {
      setErroresCampo((actual) => ({ ...actual, [campo]: undefined }));
    }
  }

  /** Validacion previa en el cliente: evita un viaje innecesario al servidor. */
  function validar() {
    const nuevos = {};
    if (!formulario.correo.trim()) {
      nuevos.correo = 'El correo electronico es obligatorio.';
    } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(formulario.correo.trim())) {
      nuevos.correo = 'Ingrese un correo electronico valido.';
    }
    if (!formulario.contrasena) {
      nuevos.contrasena = 'La contrasena es obligatoria.';
    }

    setErroresCampo(nuevos);
    return Object.keys(nuevos).length === 0;
  }

  async function manejarEnvio(evento) {
    evento.preventDefault();
    if (!validar()) return;

    setEnviando(true);
    try {
      const usuario = await iniciarSesion({
        correo: formulario.correo.trim().toLowerCase(),
        contrasena: formulario.contrasena,
      });

      exito(`Bienvenido, ${usuario.nombre_completo.split(' ')[0]}`, 'Sesion iniciada correctamente.');
      navegar(ubicacion.state?.desde || '/', { replace: true });
    } catch (error) {
      // Si el backend devolvio errores de validacion por campo, se muestran
      // junto al campo correspondiente; si no, se muestra un aviso general.
      const porCampo = error?.erroresPorCampo || {};
      if (Object.keys(porCampo).length > 0) {
        setErroresCampo(porCampo);
      } else {
        mostrarError(error, 'No fue posible iniciar sesion');
      }
    } finally {
      setEnviando(false);
    }
  }

  /** Rellena el formulario con una cuenta de demostracion. */
  function usarCuentaDemo(correo) {
    setFormulario({ correo, contrasena: CONTRASENA_DEMO });
    setErroresCampo({});
  }

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* ---------- Panel lateral informativo ---------- */}
      <div className="hidden w-1/2 flex-col justify-between bg-slate-900 p-10 lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-marca-600 text-sm font-bold text-white">
            ST
          </span>
          <span className="text-sm font-semibold text-white">Sistema de Tickets</span>
        </div>

        <div>
          <h1 className="text-3xl font-bold leading-tight text-white">
            Gestion de soporte tecnico,
            <br />
            de la solicitud al cierre.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-400">
            Registre incidencias con evidencia, asigne responsables, controle los tiempos de
            respuesta y genere reportes de desempeno sin salir de la plataforma.
          </p>

          <ul className="mt-8 space-y-3">
            {[
              'Trazabilidad completa de cada ticket',
              'Control de SLA con alertas de vencimiento',
              'Evidencias adjuntas con validacion de archivos',
              'Reportes exportables en PDF y Excel',
            ].map((beneficio) => (
              <li key={beneficio} className="flex items-center gap-3 text-sm text-slate-300">
                <span
                  aria-hidden="true"
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-marca-600 text-[10px] font-bold text-white"
                >
                  ✓
                </span>
                {beneficio}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-slate-500">
          Node.js · Express · PostgreSQL · React · Docker
        </p>
      </div>

      {/* ---------- Formulario ---------- */}
      <div className="flex w-full items-center justify-center px-4 py-10 lg:w-1/2">
        <div className="w-full max-w-md">
          {/* Encabezado movil */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-marca-600 text-sm font-bold text-white">
              ST
            </span>
            <span className="text-base font-semibold text-slate-800">Sistema de Tickets</span>
          </div>

          <h2 className="text-2xl font-bold text-slate-900">Iniciar sesion</h2>
          <p className="mt-1 text-sm text-slate-500">
            Ingrese sus credenciales para acceder a la plataforma.
          </p>

          <form onSubmit={manejarEnvio} className="mt-8 space-y-5" noValidate>
            <div>
              <label htmlFor="correo" className="etiqueta-campo">
                Correo electronico
              </label>
              <input
                id="correo"
                name="correo"
                type="email"
                autoComplete="username"
                className="campo"
                placeholder="usuario@dominio.com"
                value={formulario.correo}
                onChange={(evento) => actualizarCampo('correo', evento.target.value)}
                aria-invalid={Boolean(erroresCampo.correo)}
                aria-describedby={erroresCampo.correo ? 'error-correo' : undefined}
              />
              {erroresCampo.correo ? (
                <p id="error-correo" className="texto-error">
                  {erroresCampo.correo}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="contrasena" className="etiqueta-campo">
                Contrasena
              </label>
              <div className="relative">
                <input
                  id="contrasena"
                  name="contrasena"
                  type={verContrasena ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="campo pr-20"
                  placeholder="••••••••"
                  value={formulario.contrasena}
                  onChange={(evento) => actualizarCampo('contrasena', evento.target.value)}
                  aria-invalid={Boolean(erroresCampo.contrasena)}
                  aria-describedby={erroresCampo.contrasena ? 'error-contrasena' : undefined}
                />
                <button
                  type="button"
                  onClick={() => setVerContrasena((actual) => !actual)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                >
                  {verContrasena ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
              {erroresCampo.contrasena ? (
                <p id="error-contrasena" className="texto-error">
                  {erroresCampo.contrasena}
                </p>
              ) : null}
            </div>

            <button type="submit" className="boton-primario w-full" disabled={enviando}>
              {enviando ? 'Verificando credenciales...' : 'Iniciar sesion'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            ¿No tiene una cuenta?{' '}
            <Link to="/registro" className="enlace">
              Registrese aqui
            </Link>
          </p>

          {/* Credenciales de demostracion */}
          <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Cuentas de demostracion
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Contrasena para todas: <code className="font-mono text-slate-700">{CONTRASENA_DEMO}</code>
            </p>

            <ul className="mt-3 space-y-1.5">
              {CUENTAS_DEMO.map((cuenta) => (
                <li key={cuenta.correo}>
                  <button
                    type="button"
                    onClick={() => usarCuentaDemo(cuenta.correo)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-slate-100"
                  >
                    <span className={`font-semibold ${cuenta.color}`}>{cuenta.rol}</span>
                    <span className="truncate font-mono text-slate-500">{cuenta.correo}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
