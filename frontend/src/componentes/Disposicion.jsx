import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { useAutenticacion } from '../context/AuthContext';
import { iniciales } from '../utilidades/formato';
import { InsigniaRol } from './Etiquetas';

/**
 * Disposicion principal: barra lateral de navegacion + area de contenido.
 *
 * El menu se construye a partir de una lista declarativa con los roles
 * permitidos. Agregar una seccion nueva es agregar un elemento al arreglo,
 * no duplicar bloques de JSX. DRY.
 */

const SECCIONES = [
  {
    grupo: 'Operacion',
    elementos: [
      { ruta: '/', etiqueta: 'Panel', icono: '▤', exacto: true },
      { ruta: '/tickets', etiqueta: 'Tickets', icono: '☰' },
      { ruta: '/tickets/nuevo', etiqueta: 'Nuevo ticket', icono: '＋' },
    ],
  },
  {
    grupo: 'Analisis',
    elementos: [
      { ruta: '/reportes', etiqueta: 'Reportes', icono: '▦', roles: ['AGENTE', 'ADMINISTRADOR'] },
    ],
  },
  {
    grupo: 'Administracion',
    elementos: [
      { ruta: '/usuarios', etiqueta: 'Usuarios', icono: '◉', roles: ['ADMINISTRADOR'] },
      { ruta: '/categorias', etiqueta: 'Categorias', icono: '◇', roles: ['ADMINISTRADOR'] },
    ],
  },
  {
    grupo: 'Cuenta',
    elementos: [{ ruta: '/perfil', etiqueta: 'Mi perfil', icono: '⚙' }],
  },
];

export default function Disposicion() {
  const { usuario, cerrarSesion, esGestor } = useAutenticacion();
  const navegar = useNavigate();
  const [menuAbierto, setMenuAbierto] = useState(false);

  async function manejarCierreSesion() {
    await cerrarSesion();
    navegar('/iniciar-sesion', { replace: true });
  }

  /** Filtra las secciones segun el rol del usuario autenticado. */
  const seccionesVisibles = SECCIONES.map((seccion) => ({
    ...seccion,
    elementos: seccion.elementos.filter(
      (elemento) => !elemento.roles || elemento.roles.includes(usuario?.rol)
    ),
  })).filter((seccion) => seccion.elementos.length > 0);

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* ---------- Barra lateral ---------- */}
      <aside
        className={`no-imprimir fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-slate-800 bg-slate-900 transition-transform lg:static lg:translate-x-0 ${
          menuAbierto ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Marca */}
        <div className="flex items-center gap-3 border-b border-slate-800 px-5 py-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-marca-600 text-sm font-bold text-white">
            ST
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">Sistema de Tickets</p>
            <p className="text-[11px] text-slate-400">Gestion de soporte</p>
          </div>
        </div>

        {/* Navegacion */}
        <nav className="sin-barra flex-1 overflow-y-auto px-3 py-4">
          {seccionesVisibles.map((seccion) => (
            <div key={seccion.grupo} className="mb-5">
              <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {seccion.grupo}
              </p>
              <ul className="space-y-1">
                {seccion.elementos.map((elemento) => (
                  <li key={elemento.ruta}>
                    <NavLink
                      to={elemento.ruta}
                      end={elemento.exacto}
                      onClick={() => setMenuAbierto(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                          isActive
                            ? 'bg-marca-600 font-semibold text-white'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`
                      }
                    >
                      <span aria-hidden="true" className="w-4 text-center text-xs">
                        {elemento.icono}
                      </span>
                      {elemento.etiqueta}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Tarjeta del usuario */}
        <div className="border-t border-slate-800 p-3">
          <div className="flex items-center gap-3 rounded-lg bg-slate-800 px-3 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-marca-500 text-xs font-bold text-white">
              {iniciales(usuario?.nombre_completo)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">{usuario?.nombre_completo}</p>
              <p className="truncate text-[10px] text-slate-400">{usuario?.correo}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={manejarCierreSesion}
            className="mt-2 w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
          >
            Cerrar sesion
          </button>
        </div>
      </aside>

      {/* Capa oscura del menu movil */}
      {menuAbierto ? (
        <div
          className="fixed inset-0 z-20 bg-slate-900/50 lg:hidden"
          onClick={() => setMenuAbierto(false)}
          aria-hidden="true"
        />
      ) : null}

      {/* ---------- Contenido ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Encabezado superior */}
        <header className="no-imprimir sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              onClick={() => setMenuAbierto(true)}
              aria-label="Abrir menu de navegacion"
            >
              ☰
            </button>
            <div className="hidden sm:block">
              <InsigniaRol rol={usuario?.rol} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-slate-500 md:inline">
              {esGestor ? 'Bandeja de soporte' : 'Mis solicitudes'}
            </span>
            <NavLink to="/perfil" className="boton-fantasma boton-pequeno">
              {iniciales(usuario?.nombre_completo)}
            </NavLink>
          </div>
        </header>

        {/* Area de trabajo */}
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>

        <footer className="no-imprimir border-t border-slate-200 px-4 py-4 sm:px-6">
          <p className="text-center text-xs text-slate-400">
            Sistema de Tickets — Proyecto final universitario — Node.js · Express · PostgreSQL · React
          </p>
        </footer>
      </div>
    </div>
  );
}
