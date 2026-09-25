import type { Pais } from '../types/database.types'

interface Props {
  paises: Pais[]
  email: string | undefined
  onElegir: (p: Pais) => void
  onSalir: () => void
}

export default function SeleccionPais({ paises, email, onElegir, onSalir }: Props) {
  return (
    <div className="login-fondo">
      <div className="tarjeta login" style={{ width: 'min(520px, 100%)' }}>
        <h1>Selecciona el país</h1>
        <p>Llamada de Bienvenida · Instacredit{email ? ` · ${email}` : ''}</p>
        {paises.length === 0 && <div className="aviso info">No hay países activos. Pide a un administrador que configure uno en Administración.</div>}
        <div className="paises-rejilla">
          {paises.map((p) => (
            <button key={p.id} className="pais-tarjeta" onClick={() => onElegir(p)}>
              <strong>{p.nombre}</strong>
              <span>{p.codigo} · {p.zona_horaria}</span>
            </button>
          ))}
        </div>
        <button className="btn secundario" onClick={onSalir}>Cerrar sesión</button>
      </div>
    </div>
  )
}
