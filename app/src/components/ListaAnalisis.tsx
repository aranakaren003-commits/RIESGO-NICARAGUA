import { useCallback, useEffect, useState } from 'react'
import Papa from 'papaparse'
import { sb } from '../lib/supabase'
import { fmtFechaHora } from '../lib/fechas'
import { usePais } from '../lib/pais'
import { P, type Permisos } from '../lib/permisos'
import type { Llamada } from '../types/database.types'
import RegistroForm from './RegistroForm'

const TAM = 50

interface Props {
  titulo: string
  tabla?: 'llamadas_bienvenida' | 'v_historial_numero_equivocado' // por defecto llamadas_bienvenida
  columna?: 'caso_sospecha' | 'estatus_llamada'
  valor?: string // 'SI' o 'NUMERO EQUIVOCADO'
  comentarioCampo: 'comentario_llamada' | 'numero_pertenece_a'
  comentarioLabel: string
  archivoBase: string
  permisos: Permisos
}

// Vista de análisis: todos los registros del país (o países, en vista regional) que cumplen un criterio (sospecha o número equivocado),
// sin importar la carga en la que llegaron. Reutilizada por «Casos sospechosos» y «Número equivocado».
export default function ListaAnalisis({ titulo, tabla = 'llamadas_bienvenida', columna, valor, comentarioCampo, comentarioLabel, archivoBase, permisos }: Props) {
  const { pais } = usePais()
  const tz = pais.zona_horaria
  const puedeEditar = permisos.has(P.registrosEditar)
  const puedeDescargar = permisos.has(P.dashboardDescargar)
  const [texto, setTexto] = useState('')
  const [textoInput, setTextoInput] = useState('')
  const [pagina, setPagina] = useState(0)
  const [filas, setFilas] = useState<Llamada[]>([])
  const [total, setTotal] = useState(0)
  const [cargando, setCargando] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [error, setError] = useState('')
  const [editando, setEditando] = useState<Llamada | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setTexto(textoInput)
      setPagina(0)
    }, 350)
    return () => clearTimeout(t)
  }, [textoInput])

  const consulta = useCallback(
    <T extends { eq: (c: string, v: string) => T; or: (f: string) => T }>(q: T): T => {
      let r = q.eq('id_pais', pais.id)
      if (columna && valor) r = r.eq(columna, valor)
      const t = texto.trim().replace(/[,()%*]/g, ' ')
      if (t) {
        const partes = [`cliente.ilike.%${t}%`, `cedula.ilike.%${t}%`, `telefono.ilike.%${t}%`, `promotor.ilike.%${t}%`]
        if (/^\d+$/.test(t)) partes.push(`numero_solicitud.eq.${t}`)
        r = r.or(partes.join(','))
      }
      return r
    },
    [pais.id, columna, valor, texto],
  )

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    const { data, count, error } = await consulta(sb.from(tabla as 'llamadas_bienvenida').select('*', { count: 'exact' }))
      .order('fecha_formalizado', { ascending: false, nullsFirst: false })
      .range(pagina * TAM, pagina * TAM + TAM - 1)
    if (error) setError(error.message)
    setFilas((data as Llamada[] | null) ?? [])
    setTotal(count ?? 0)
    setCargando(false)
  }, [consulta, pagina, tabla])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function exportar() {
    setExportando(true)
    const acum: Llamada[] = []
    for (let d = 0; ; d += 1000) {
      const { data, error } = await consulta(sb.from(tabla as 'llamadas_bienvenida').select('*'))
        .order('fecha_formalizado', { ascending: false, nullsFirst: false })
        .range(d, d + 999)
      if (error) {
        setError(error.message)
        break
      }
      acum.push(...((data as Llamada[] | null) ?? []))
      if (!data || data.length < 1000) break
    }
    const cab = ['CLIENTE', 'NUMERO DE SOLICITUD', 'CEDULA', 'TELEFONO', 'TIPO DE CRÉDITO', 'PROMOTOR', 'SUCURSAL', 'ORIGEN', 'FECHA DE FORMALIZADO', 'ESTATUS DE LLAMADA', comentarioLabel]
    const datos = acum.map((r) => [
      r.cliente, r.numero_solicitud, r.cedula ?? '', r.telefono ?? '', r.tipo_credito ?? '', r.promotor ?? '', r.sucursal ?? '', r.origen ?? '',
      fmtFechaHora(r.fecha_formalizado, tz), r.estatus_llamada ?? '', r[comentarioCampo] ?? '',
    ])
    const csv = Papa.unparse({ fields: cab, data: datos }, { delimiter: ';' })
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${archivoBase}_${pais.codigo}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    setExportando(false)
  }

  const paginas = Math.max(1, Math.ceil(total / TAM))

  return (
    <>
      <div className="barra">
        <label>
          Buscar
          <input placeholder="Cliente, cédula, teléfono, promotor, solicitud…" value={textoInput} onChange={(e) => setTextoInput(e.target.value)} style={{ width: 280 }} />
        </label>
        <div className="espacio" />
        {puedeDescargar && <button className="btn secundario" onClick={exportar} disabled={exportando || total === 0}>{exportando ? 'Exportando…' : 'Exportar CSV'}</button>}
      </div>

      {error && <div className="aviso error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="tarjeta">
        <div className="tabla-envoltorio">
          <table>
            <thead>
              <tr>
                <th>CLIENTE</th>
                <th>NUMERO DE SOLICITUD</th>
                <th>TELEFONO</th>
                <th>TIPO DE CRÉDITO</th>
                <th>PROMOTOR</th>
                <th>FECHA DE FORMALIZADO</th>
                <th>{comentarioLabel}</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((r) => (
                <tr key={r.id} className={r.caso_sospecha === 'SI' ? 'fila-sospecha' : ''} onClick={() => setEditando(r)}>
                  <td title={r.cliente}>{r.cliente}</td>
                  <td>{r.numero_solicitud}</td>
                  <td>{r.telefono}</td>
                  <td>{r.tipo_credito}</td>
                  <td title={r.promotor ?? ''}>{r.promotor}</td>
                  <td>{fmtFechaHora(r.fecha_formalizado, tz)}</td>
                  <td title={r[comentarioCampo] ?? ''}>{r[comentarioCampo]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!cargando && filas.length === 0 && <div className="vacio">No hay registros de «{titulo}» en {pais.nombre}.</div>}
        </div>
        <div className="pie">
          <span>{cargando ? 'Cargando…' : `${total.toLocaleString('es-NI')} registros`}</span>
          <div className="espacio" />
          <button className="btn secundario" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>Anterior</button>
          <span>Página {pagina + 1} de {paginas}</span>
          <button className="btn secundario" disabled={pagina + 1 >= paginas} onClick={() => setPagina(pagina + 1)}>Siguiente</button>
        </div>
      </div>

      {editando && (
        <RegistroForm
          registro={editando}
          idCarga={null}
          soloLectura={!puedeEditar}
          onClose={() => setEditando(null)}
          onSaved={() => {
            setEditando(null)
            cargar()
          }}
        />
      )}
    </>
  )
}
