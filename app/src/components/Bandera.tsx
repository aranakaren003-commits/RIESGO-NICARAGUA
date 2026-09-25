// Banderas simplificadas en SVG (los emoji de bandera no se ven en Windows). Para un país sin bandera definida se muestra su código.
const ESTRELLA = '12,2 14.4,8.6 21.5,8.9 16,13.3 17.9,20.2 12,16.3 6.1,20.2 8,13.3 2.5,8.9 9.6,8.6'

function Estrella({ x, y, color }: { x: number; y: number; color: string }) {
  return <polygon points={ESTRELLA} fill={color} transform={`translate(${x} ${y}) scale(0.32)`} />
}

export default function Bandera({ codigo, alto = 18 }: { codigo: string; alto?: number }) {
  const ancho = Math.round(alto * 1.5)
  const props = { width: ancho, height: alto, viewBox: '0 0 30 20', role: 'img', 'aria-label': `Bandera ${codigo}`, style: { borderRadius: 2, boxShadow: '0 0 0 1px rgba(255,255,255,.35)' } }

  switch (codigo.toUpperCase()) {
    case 'NI':
      return (
        <svg {...props}>
          <rect width="30" height="20" fill="#0067C6" />
          <rect y="6.67" width="30" height="6.67" fill="#fff" />
          <polygon points="15,7.6 18,12.4 12,12.4" fill="#f2c200" stroke="#2e7d32" strokeWidth="0.5" />
        </svg>
      )
    case 'SV':
      return (
        <svg {...props}>
          <rect width="30" height="20" fill="#0F47AF" />
          <rect y="6.67" width="30" height="6.67" fill="#fff" />
          <circle cx="15" cy="10" r="2.2" fill="#f2c200" stroke="#2e7d32" strokeWidth="0.5" />
        </svg>
      )
    case 'PA':
      return (
        <svg {...props}>
          <rect width="30" height="20" fill="#fff" />
          <rect x="15" width="15" height="10" fill="#D21034" />
          <rect y="10" width="15" height="10" fill="#005293" />
          <Estrella x={4.6} y={1.2} color="#005293" />
          <Estrella x={19.6} y={11.2} color="#D21034" />
        </svg>
      )
    case 'CR':
      return (
        <svg {...props}>
          <rect width="30" height="20" fill="#002B7F" />
          <rect y="3.33" width="30" height="13.33" fill="#fff" />
          <rect y="6.67" width="30" height="6.67" fill="#CE1126" />
        </svg>
      )
    default:
      return (
        <span className="bandera-codigo" style={{ height: alto, minWidth: ancho, lineHeight: `${alto}px` }}>
          {codigo.toUpperCase()}
        </span>
      )
  }
}
