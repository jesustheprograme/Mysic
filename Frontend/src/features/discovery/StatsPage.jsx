import { BarChart3, CalendarClock, Disc3, Flame, Headphones, Mic2, Music2, Play, Trash2, Users } from 'lucide-react'
import { memo, useEffect, useState } from 'react'
import { sizedImage } from '../../lib/imageSize.js'
import { clearListens, importLegacy, loadStats, onListensChange } from '../stats/listenDb.js'
import { bigDuration, formatDuration, RANGES, WEEKDAYS } from '../stats/statsCompute.js'
import { api } from '../youtube/lib/api.js'
import { playHistoryOwner, readPlayHistory } from '../youtube/playHistory.js'
import './stats-page.css'

// Estadísticas de reproducción (como Limusic): lo que de verdad escuchas en Mysic, calculado en este equipo a partir
// de los resúmenes de escuchas (features/stats). Se recalcula al abrir, al cambiar de periodo y con cada escucha.

let lastRange = 'month' // como Limusic: el periodo elegido se recuerda durante la sesión
const artistPhotos = new Map() // id → URL de su foto (se piden como mucho 8 por visita y se recuerdan)

const plural = (count, one, many) => `${count.toLocaleString('es-ES')} ${count === 1 ? one : many}`
const dayLabel = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' })
const monthLabel = new Intl.DateTimeFormat('es-ES', { month: 'short' })
const longDay = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
const longMonth = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' })
const longDate = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' })
const hourLabel = (hour) => `${String(hour).padStart(2, '0')}:00`

function useListeningStats(range) {
  // Mientras carga otro periodo se siguen viendo los números anteriores (sin parpadeo ni esqueleto).
  const [state, setState] = useState({ status: 'loading', stats: null })
  const [reload, setReload] = useState(0)
  // Abierta mientras suena algo: se recalcula con cada escucha nueva o actualizada (como mucho una vez cada 30 s).
  // Lee resúmenes precalculados: milisegundos aunque haya años de historial.
  useEffect(() => onListensChange(() => setReload((value) => value + 1)), [])
  useEffect(() => {
    let cancelled = false
    const owner = playHistoryOwner()
    ;(async () => {
      await importLegacy(owner, readPlayHistory()).catch(() => 0)
      const stats = await loadStats(owner, range)
      if (!cancelled) setState({ status: 'ready', stats })
    })().catch(() => { if (!cancelled) setState((current) => ({ ...current, status: current.stats ? 'ready' : 'error' })) })
    return () => { cancelled = true }
  }, [range, reload])
  return state
}

function useArtistPhotos(artists) {
  const [, setVersion] = useState(0)
  const ids = artists.map((artist) => artist.id).filter((id) => id?.startsWith('UC') && !artistPhotos.has(id)).slice(0, 8)
  const key = ids.join(',')
  useEffect(() => {
    if (!key) return undefined
    const controller = new AbortController()
    Promise.all(key.split(',').map((id) => api.artist(id, controller.signal)
      .then((page) => { artistPhotos.set(id, page?.thumbnail ?? null) })
      .catch(() => { artistPhotos.set(id, null) })))
      .then(() => { if (!controller.signal.aborted) setVersion((value) => value + 1) })
    return () => controller.abort()
  }, [key])
  return (artist) => (artist.id && artistPhotos.get(artist.id)) || artist.cover
}

const Section = ({ icon: Icon, title, children, className = '' }) => (
  <section className={`stats__section ${className}`}>
    <h2 className="stats__section-title"><Icon size={16} aria-hidden="true" />{title}</h2>
    {children}
  </section>
)

const ActivityChart = memo(function ActivityChart({ bars, peak }) {
  const max = Math.max(1, ...bars.map((bar) => bar.secs))
  const tickEvery = Math.max(1, Math.ceil(bars.length / (bars[0]?.monthly ? 12 : 7)))
  const [hover, setHover] = useState(null)
  const hovered = hover != null ? bars[hover] : null
  const labelOf = (bar) => (bar.monthly ? longMonth.format(bar.start) : longDay.format(bar.start))
  return (
    <div className="stats__chart">
      <div className={`stats__bars${bars.length > 40 ? ' stats__bars--dense' : ''}`} onMouseLeave={() => setHover(null)}>
        {bars.map((bar, index) => (
          <span
            className={index === hover ? 'stats__bar-slot stats__bar-slot--hover' : 'stats__bar-slot'}
            key={bar.key}
            onMouseEnter={() => setHover(index)}
            aria-label={`${labelOf(bar)}: ${formatDuration(bar.secs)}`}
            role="img"
          >
            <i className={bar === peak ? 'stats__bar stats__bar--peak' : 'stats__bar'} style={{ height: `${bar.secs ? Math.max(3, (bar.secs / max) * 100) : 0}%` }} />
          </span>
        ))}
        {hovered && (
          // Al lado de la barra (a la izquierda en la mitad derecha, para no salirse del gráfico).
          <div
            className={hover >= bars.length / 2 ? 'stats__tip stats__tip--left' : 'stats__tip'}
            style={{ left: `${((hover + 0.5) / bars.length) * 100}%` }}
            aria-hidden="true"
          >
            <strong>{labelOf(hovered)}</strong>
            <span><i />{formatDuration(hovered.secs)}</span>
          </div>
        )}
      </div>
      <div className="stats__ticks" aria-hidden="true">
        {bars.map((bar, index) => (
          <span key={bar.key}>{(bars.length - 1 - index) % tickEvery === 0 ? (bar.monthly ? monthLabel.format(bar.start) : dayLabel.format(bar.start)) : ''}</span>
        ))}
      </div>
    </div>
  )
})

function Donut({ parts, top }) {
  // Anillo con un arco por franja (stroke-dasharray sobre un círculo).
  const radius = 42
  const circumference = 2 * Math.PI * radius
  let offset = 0
  return (
    <svg className="stats__donut" viewBox="0 0 100 100" role="img" aria-label="Escuchas por franja del día">
      <circle cx="50" cy="50" r={radius} className="stats__donut-track" />
      {parts.map((part) => {
        const length = part.share * circumference
        const gap = parts.filter((entry) => entry.share > 0).length > 1 ? Math.min(1.6, length / 2) : 0
        const arc = (
          <circle
            key={part.id}
            cx="50"
            cy="50"
            r={radius}
            className={`stats__donut-arc stats__donut-arc--${part.id}`}
            strokeDasharray={`${Math.max(0, length - gap)} ${circumference}`}
            strokeDashoffset={-offset}
          />
        )
        offset += length
        return part.share > 0 ? arc : null
      })}
      {top && (
        <text x="50" y="50" textAnchor="middle" className="stats__donut-text">
          <tspan x="50" dy="-1" className="stats__donut-value">{Math.round(top.share * 100)}%</tspan>
          <tspan x="50" dy="11" className="stats__donut-label">{top.label.toLocaleLowerCase('es')}</tspan>
        </text>
      )}
    </svg>
  )
}

export default function StatsPage({ onNavigate, onPlaySongs }) {
  const [range, setRange] = useState(lastRange)
  const [confirmClear, setConfirmClear] = useState(false)
  const { stats, status } = useListeningStats(range)
  const photo = useArtistPhotos(stats?.topArtists ?? [])
  const chooseRange = (next) => { lastRange = next; setRange(next) }
  // Los textos van con los números que se ven (los del periodo anterior hasta que llegan los nuevos).
  const rangeInfo = RANGES.find((entry) => entry.id === (stats?.range ?? range))

  if (!stats) {
    return (
      <div className="route-page stats">
        {status === 'error'
          ? <p className="stats__note">No se pudieron leer tus estadísticas.</p>
          : <div className="stats__skeleton" aria-label="Cargando estadísticas"><i /><i /><i /></div>}
      </div>
    )
  }

  if (stats.empty) {
    return (
      <div className="route-page stats stats--empty">
        <span className="stats__empty-icon" aria-hidden="true"><BarChart3 size={30} /></span>
        <h1>Tus estadísticas empiezan aquí</h1>
        <p>Escucha música en Mysic y aquí verás cuánto escuchas, tus artistas, canciones y álbumes favoritos y cuándo escuchas.</p>
        <p className="stats__note">Se calcula en este equipo a partir de lo que reproduces en Mysic. No se envía ninguna información.</p>
      </div>
    )
  }

  const backdrop = stats.topSongs[0]?.song.thumbnail ?? stats.topArtists[0]?.cover
  const [hero, ...restArtists] = stats.topArtists
  const playTop = (index) => onPlaySongs?.(stats.topSongs.map((entry) => entry.song), index)
  const open = (type, id) => { if (id) onNavigate?.({ type, id }) }
  const total = bigDuration(stats.secs)

  return (
    <div className="route-page stats">
      {backdrop && <div className="stats__backdrop" style={{ backgroundImage: `url(${sizedImage(backdrop, 96)})` }} aria-hidden="true" />}

      <header className="stats__head">
        <div className="stats__title-row">
          <h1>Estadísticas de reproducción</h1>
          <div className="stats__ranges" role="tablist" aria-label="Periodo">
            {RANGES.map((option) => (
              <button
                className={range === option.id ? 'stats__range stats__range--active' : 'stats__range'}
                type="button"
                role="tab"
                aria-selected={range === option.id}
                key={option.id}
                onClick={() => chooseRange(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <p className="stats__total" aria-label={`${formatDuration(stats.secs)} escuchadas`}>
          {total.map((part) => (
            <span key={part.unit}><strong>{part.value}</strong><small>{part.unit}</small></span>
          ))}
        </p>
        <p className="stats__summary">
          {stats.all ? `escuchadas desde el ${longDate.format(stats.firstAt)}` : `escuchadas ${rangeInfo.since}`}
          {stats.change != null && (
            <>
              <span className={stats.change >= 0 ? 'stats__change stats__change--up' : 'stats__change'}>{stats.change > 0 ? '+' : ''}{stats.change}%</span>
              <span>{rangeInfo.previous}</span>
            </>
          )}
        </p>
      </header>

      <dl className="stats__tiles">
        <div className="stats__tile"><dt><Play size={13} aria-hidden="true" />Reproducciones</dt><dd>{stats.plays.toLocaleString('es-ES')}</dd></div>
        <div className="stats__tile"><dt><Music2 size={13} aria-hidden="true" />Canciones</dt><dd>{stats.songs.toLocaleString('es-ES')}</dd>{stats.newSongs > 0 && <small>{plural(stats.newSongs, 'nueva', 'nuevas')}</small>}</div>
        <div className="stats__tile"><dt><Users size={13} aria-hidden="true" />Artistas</dt><dd>{stats.artists.toLocaleString('es-ES')}</dd></div>
        <div className="stats__tile"><dt><Flame size={13} aria-hidden="true" />Racha de días</dt><dd>{stats.streak.current}</dd>{stats.streak.best > stats.streak.current && <small>Mejor: {stats.streak.best}</small>}</div>
      </dl>

      <Section icon={BarChart3} title="Actividad de reproducción">
        <div className="stats__facts">
          <div><span>{stats.bars[0]?.monthly ? 'Promedio mensual' : 'Promedio diario'}</span><strong>{formatDuration(stats.average)}</strong></div>
          {stats.peak && (
            <div>
              <span>{stats.peak.monthly ? 'Mes más activo' : 'Día más activo'}</span>
              <strong>{stats.peak.monthly ? longMonth.format(stats.peak.start) : longDay.format(stats.peak.start)} · {formatDuration(stats.peak.secs)}</strong>
            </div>
          )}
        </div>
        <ActivityChart bars={stats.bars} peak={stats.peak} />
        {stats.plays === 0 && <p className="stats__note">Nada se reprodujo en este periodo.</p>}
      </Section>

      {stats.plays > 0 && (
        <>
          <div className="stats__columns">
            {hero && (
              <Section icon={Mic2} title="Artistas más escuchados">
                <button className="stats__hero" type="button" disabled={!hero.id} onClick={() => open('artist', hero.id)}>
                  {photo(hero) ? <img src={sizedImage(photo(hero), 64)} alt="" width="64" height="64" loading="lazy" /> : <span className="stats__avatar-empty" aria-hidden="true" />}
                  <span className="stats__hero-copy">
                    <small>01</small>
                    <strong>{hero.name}</strong>
                    <span>{formatDuration(hero.secs)} · {plural(hero.plays, 'reproducción', 'reproducciones')}</span>
                    {stats.secs > 0 && <em>{Math.round((hero.secs / stats.secs) * 100)}% de tu tiempo de escucha</em>}
                  </span>
                </button>
                <ol className="stats__artists">
                  {restArtists.map((artist, index) => (
                    <li key={artist.name}>
                      <button type="button" disabled={!artist.id} onClick={() => open('artist', artist.id)}>
                        <span className="stats__rank">{String(index + 2).padStart(2, '0')}</span>
                        {photo(artist) ? <img src={sizedImage(photo(artist), 30)} alt="" width="30" height="30" loading="lazy" /> : <span className="stats__avatar-empty" aria-hidden="true" />}
                        <span className="stats__artist-copy">
                          <strong>{artist.name}</strong>
                          <span className="stats__meter" aria-hidden="true"><i style={{ width: `${Math.max(4, (artist.secs / hero.secs) * 100)}%` }} /></span>
                        </span>
                        <span className="stats__time">{formatDuration(artist.secs)}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </Section>
            )}

            <Section icon={Headphones} title="Canciones más escuchadas">
              <ol className="stats__songs">
                {stats.topSongs.map((entry, index) => (
                  <li key={entry.song.id}>
                    <button type="button" title={`Reproducir ${entry.song.title}`} onClick={() => playTop(index)}>
                      <span className="stats__rank">{index + 1}</span>
                      {entry.song.thumbnail ? <img src={sizedImage(entry.song.thumbnail, 34)} alt="" width="34" height="34" loading="lazy" /> : <span className="stats__cover-empty" aria-hidden="true" />}
                      <span className="stats__song-copy"><strong>{entry.song.title}</strong><span>{entry.song.artist}</span></span>
                      <span className="stats__plays">{plural(entry.plays, 'vez', 'veces')}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </Section>
          </div>

          {stats.topAlbums.length > 0 && (
            <Section icon={Disc3} title="Álbumes más escuchados">
              <ul className="stats__albums">
                {stats.topAlbums.map((album) => (
                  <li key={album.id}>
                    <button type="button" title={`Abrir ${album.title}`} onClick={() => open('album', album.id)}>
                      {album.thumbnail ? <img src={sizedImage(album.thumbnail, 112)} alt="" loading="lazy" /> : <span className="stats__cover-empty" aria-hidden="true" />}
                      <strong>{album.title}</strong>
                      <span>{album.artist} · {formatDuration(album.secs)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section icon={CalendarClock} title="Cuándo escuchas" className="stats__when">
            <div className="stats__daypart">
              <Donut parts={stats.dayparts} top={stats.topPart} />
              <ul className="stats__legend">
                {stats.dayparts.map((part) => (
                  <li key={part.id}><i className={`stats__dot stats__dot--${part.id}`} aria-hidden="true" />{part.label}<span>{Math.round(part.share * 100)}%</span></li>
                ))}
              </ul>
              {stats.topPart && (
                <p className="stats__persona">
                  <strong>{stats.topPart.persona}</strong>
                  Escuchas más entre las {hourLabel(stats.topPart.from)} y las {hourLabel(stats.topPart.to)}.
                </p>
              )}
            </div>
            <div className="stats__heat-block">
              <div className="stats__facts">
                {stats.busiestWeekday != null && <div><span>Día más activo de la semana</span><strong>{WEEKDAYS[stats.busiestWeekday]}</strong></div>}
                {stats.busiestHour != null && <div><span>Hora más activa</span><strong>{hourLabel(stats.busiestHour)}</strong></div>}
              </div>
              <div className="stats__heat" role="img" aria-label="Escuchas por día de la semana y hora">
                <span />
                {Array.from({ length: 24 }, (_, hour) => <span className="stats__heat-hour" key={hour}>{hour % 6 === 0 ? hour : ''}</span>)}
                {stats.heat.map((row, weekday) => (
                  <HeatRow key={WEEKDAYS[weekday]} row={row} secs={stats.heatSecs[weekday]} weekday={weekday} />
                ))}
              </div>
              <div className="stats__heat-legend" aria-hidden="true">
                Menos {[0, 1, 2, 3, 4].map((level) => <i className={`stats__cell stats__cell--${level}`} key={level} />)} Más
              </div>
            </div>
          </Section>
        </>
      )}

      <footer className="stats__footer">
        <p className="stats__note">Calculado en este equipo a partir de lo que reproduces en Mysic. No se envía ninguna información.</p>
        {confirmClear ? (
          <div className="stats__confirm" role="alertdialog" aria-label="¿Borrar el historial de reproducción?">
            <span>¿Borrar el historial de reproducción? Se perderán todas tus estadísticas.</span>
            <button type="button" className="stats__danger" onClick={async () => { await clearListens(playHistoryOwner()).catch(() => {}); setConfirmClear(false) }}>Borrar historial</button>
            <button type="button" onClick={() => setConfirmClear(false)}>Cancelar</button>
          </div>
        ) : (
          <button className="stats__clear" type="button" onClick={() => setConfirmClear(true)}><Trash2 size={14} aria-hidden="true" />Borrar el historial de reproducción</button>
        )}
      </footer>
    </div>
  )
}

const HeatRow = memo(function HeatRow({ row, secs, weekday }) {
  return (
    <>
      <span className="stats__heat-day">{WEEKDAYS[weekday].slice(0, 3)}</span>
      {row.map((level, hour) => (
        <i className={`stats__cell stats__cell--${level}`} key={hour} title={`${WEEKDAYS[weekday]} ${hourLabel(hour)}: ${formatDuration(secs[hour])}`} />
      ))}
    </>
  )
})
