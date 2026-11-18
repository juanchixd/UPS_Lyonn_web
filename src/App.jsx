import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

function RadialGauge({ value, max, label, color, isDark }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  const radius = 52
  const circumference = 2 * Math.PI * radius
  const arcLength = circumference * 0.75
  const dashOffset = arcLength - (pct / 100) * arcLength

  return (
    <div className="relative w-36 h-36 shrink-0 flex items-center justify-center select-none">
      <svg className="w-36 h-36 -rotate-[225deg]" viewBox="0 0 128 128">
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke={isDark ? 'rgba(148,163,184,0.15)' : 'rgba(100,116,139,0.15)'}
          strokeWidth="10"
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeLinecap="round"
        />
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`text-[11px] font-medium ${
            isDark ? 'text-slate-400' : 'text-slate-500'
          }`}
        >
          {label}
        </span>
        <span className="text-xl font-bold leading-tight mt-0.5">
          {typeof value === 'number' ? Math.round(value) : '--'}
        </span>
      </div>
    </div>
  )
}

function formatDuration(sec) {
  if (sec == null) return 'En curso'
  const s = Math.max(0, Number(sec))
  const hrs = Math.floor(s / 3600)
  const mins = Math.floor((s % 3600) / 60)
  const rem = s % 60
  if (hrs > 0) return `${hrs}h ${mins}m ${rem}s`
  if (mins > 0) return `${mins}m ${rem}s`
  return `${rem}s`
}

export default function App() {
  const [isDark, setIsDark] = useState(true)
  const [live, setLive] = useState(null)
  const [telemetry, setTelemetry] = useState([])
  const [outages, setOutages] = useState([])
  const [hoursRange, setHoursRange] = useState(24)
  const [nowTs, setNowTs] = useState(Date.now())
  const [loading, setLoading] = useState(true)

  const fetchLiveAndOutages = async () => {
    const [{ data: liveRows }, { data: outageRows }] = await Promise.all([
      supabase.from('ups_live').select('*').eq('id', 1).maybeSingle(),
      supabase
        .from('ups_outages')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(8),
    ])
    if (liveRows) setLive(liveRows)
    if (outageRows) setOutages(outageRows)
    setLoading(false)
  }

  const fetchTelemetry = async (hours) => {
    const since = new Date(Date.now() - hours * 3600 * 1000).toISOString()
    const { data } = await supabase
      .from('ups_telemetry')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(1500)
    if (data) setTelemetry(data)
  }

  useEffect(() => {
    fetchLiveAndOutages()
    fetchTelemetry(hoursRange)

    const channel = supabase
      .channel('ups-live-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ups_live' },
        (payload) => {
          if (payload.new) setLive(payload.new)
        }
      )
      .subscribe()

    const pollLive = setInterval(fetchLiveAndOutages, 15000)
    const pollHist = setInterval(() => fetchTelemetry(hoursRange), 60000)
    const tick = setInterval(() => setNowTs(Date.now()), 5000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollLive)
      clearInterval(pollHist)
      clearInterval(tick)
    }
  }, [hoursRange])

  const secondsSinceUpdate = useMemo(() => {
    if (!live?.updated_at) return null
    return Math.max(0, Math.floor((nowTs - new Date(live.updated_at).getTime()) / 1000))
  }, [live, nowTs])

  const isServerStale = secondsSinceUpdate !== null && secondsSinceUpdate > 75
  const isOnBattery = live?.ups_status && live.ups_status.includes('OB')

  const chartData = useMemo(() => {
    return telemetry.map((pt) => {
      const dt = new Date(pt.created_at)
      return {
        time: dt.toLocaleTimeString('es-AR', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }),
        input_voltage: Math.round(Number(pt.input_voltage) * 10) / 10,
        ups_load: Math.round(Number(pt.ups_load)),
        ups_watts: Math.round(Number(pt.ups_watts)),
        battery_charge: Math.round(Number(pt.battery_charge)),
      }
    })
  }, [telemetry])

  const inVolt = Number(live?.input_voltage ?? 0)
  const outVolt = Number(live?.output_voltage ?? 0)
  const freq = Number(live?.input_frequency ?? 50)
  const loadPct = Number(live?.ups_load ?? 0)
  const watts = Number(live?.ups_watts ?? 0)
  const va = Number(live?.ups_va ?? 0)
  const battPct = Number(live?.battery_charge ?? 0)
  const battVolt = Number(live?.battery_voltage ?? 0)
  const runtimeMin = Number(live?.runtime_min ?? 0)

  const voltColor =
    inVolt < 190 || inVolt > 245
      ? '#ef4444'
      : inVolt < 205
      ? '#f59e0b'
      : '#3b82f6'
  const loadColor =
    loadPct >= 85 ? '#ef4444' : loadPct >= 65 ? '#f59e0b' : '#10b981'
  const battColor =
    battPct <= 20 ? '#ef4444' : battPct <= 50 ? '#f59e0b' : '#10b981'

  const cardClass = isDark
    ? 'bg-[#1e293b] border border-white/5 rounded-xl p-5 shadow-sm'
    : 'bg-white border border-slate-200/80 rounded-xl p-5 shadow-sm'

  return (
    <div
      className={
        isDark
          ? 'min-h-screen bg-[#0f172a] text-[#f8fafc] transition-colors font-sans'
          : 'min-h-screen bg-[#f1f5f9] text-[#1e293b] transition-colors font-sans'
      }
    >
      {/* Floating Theme Toggle */}
      <button
        onClick={() => setIsDark(!isDark)}
        title="Cambiar Tema"
        className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-[#3b82f6] text-white text-xl shadow-lg hover:scale-105 transition flex items-center justify-center z-50 cursor-pointer"
      >
        {isDark ? '☀' : '☾'}
      </button>

      <div className="max-w-[1500px] mx-auto px-5 py-6">
        {/* Clean Header */}
        <header
          className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 mb-6 border-b ${
            isDark ? 'border-white/5' : 'border-black/5'
          }`}
        >
          <div>
            <h1 className="text-2xl font-bold tracking-tight m-0">UPS MONITOR</h1>
            <p
              className={`text-sm m-0 ${
                isDark ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              Lyonn 800VA (480W) • Real-time Power Stats
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Period filter */}
            <div
              className={`inline-flex rounded-lg p-1 border ${
                isDark
                  ? 'bg-[#1e293b] border-white/5'
                  : 'bg-white border-slate-200'
              }`}
            >
              {[
                { label: '1h', val: 1 },
                { label: '6h', val: 6 },
                { label: '24h', val: 24 },
                { label: '7d', val: 168 },
              ].map((btn) => (
                <button
                  key={btn.val}
                  onClick={() => setHoursRange(btn.val)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                    hoursRange === btn.val
                      ? 'bg-[#3b82f6] text-white'
                      : isDark
                      ? 'text-slate-400 hover:text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            {/* Status Indicator */}
            {loading ? (
              <div className="px-4 py-1.5 rounded-full text-xs font-bold tracking-wider border bg-slate-500/15 text-slate-400 border-slate-500">
                CONECTANDO...
              </div>
            ) : isServerStale ? (
              <div className="px-4 py-1.5 rounded-full text-xs font-bold tracking-wider border bg-amber-500/15 text-amber-400 border-amber-500">
                SIN CONEXIÓN (HACE {Math.floor(secondsSinceUpdate / 60)}M)
              </div>
            ) : isOnBattery ? (
              <div className="px-4 py-1.5 rounded-full text-xs font-bold tracking-wider border bg-red-500/15 text-red-400 border-red-500 animate-pulse">
                OFFLINE (BATERÍA)
              </div>
            ) : (
              <div className="px-4 py-1.5 rounded-full text-xs font-bold tracking-wider border bg-emerald-500/15 text-emerald-400 border-emerald-500">
                ONLINE (RED)
              </div>
            )}
          </div>
        </header>

        {/* KPI Grid (3 Horizontal Cards matching original design) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
          {/* KPI 1: Batería */}
          <div className={`${cardClass} flex items-center justify-between min-h-[155px]`}>
            <div className="space-y-1.5">
              <h3
                className={`text-xs font-semibold uppercase tracking-wider ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                Batería
              </h3>
              <div className="text-4xl font-bold leading-none">
                {Math.round(battPct)}%
              </div>
              <div
                className={`text-xs pt-1 space-y-0.5 ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                <div>Tensión DC: {battVolt.toFixed(1)} V</div>
                <div>Autonomía est.: ~{Math.round(runtimeMin)} min</div>
              </div>
            </div>
            <RadialGauge
              value={battPct}
              max={100}
              label="Batería %"
              color={battColor}
              isDark={isDark}
            />
          </div>

          {/* KPI 2: Entrada */}
          <div className={`${cardClass} flex items-center justify-between min-h-[155px]`}>
            <div className="space-y-1.5">
              <h3
                className={`text-xs font-semibold uppercase tracking-wider ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                Entrada
              </h3>
              <div className="text-4xl font-bold leading-none">
                {Math.round(inVolt)} V
              </div>
              <div
                className={`text-xs pt-1 space-y-0.5 ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                <div>Exacto: {inVolt.toFixed(1)} V ({freq.toFixed(0)} Hz)</div>
                <div>Salida: {outVolt.toFixed(1)} V</div>
              </div>
            </div>
            <RadialGauge
              value={inVolt}
              max={260}
              label="Entrada V"
              color={voltColor}
              isDark={isDark}
            />
          </div>

          {/* KPI 3: Carga UPS (Watts + %) */}
          <div className={`${cardClass} flex items-center justify-between min-h-[155px]`}>
            <div className="space-y-1.5">
              <h3
                className={`text-xs font-semibold uppercase tracking-wider ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                Carga UPS
              </h3>
              <div className="flex items-baseline gap-2.5">
                <span className="text-4xl font-bold leading-none">
                  {Math.round(watts)} W
                </span>
                <span
                  className={`text-lg font-semibold ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  ({Math.round(loadPct)}%)
                </span>
              </div>
              <div
                className={`text-xs pt-1 space-y-0.5 ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                <div>
                  {(watts / 1000).toFixed(2)} kW • ~{Math.round(va)} VA
                </div>
                <div>Capacidad: 480 W / 800 VA</div>
              </div>
            </div>
            <RadialGauge
              value={loadPct}
              max={100}
              label="Carga %"
              color={loadColor}
              isDark={isDark}
            />
          </div>
        </div>

        {/* History Charts Grid (3 Equal Columns) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
          {/* Chart 1: Voltaje */}
          <div className={cardClass}>
            <h3
              className={`text-sm font-semibold mb-4 ${
                isDark ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              Historial Voltaje ({hoursRange}h)
            </h3>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="gradVolt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="4 4"
                    stroke={isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}
                  />
                  <XAxis
                    dataKey="time"
                    stroke={isDark ? '#94a3b8' : '#64748b'}
                    fontSize={11}
                    tickLine={false}
                    minTickGap={28}
                  />
                  <YAxis
                    domain={[
                      (dataMin) => Math.floor((dataMin || 215) - 4),
                      (dataMax) => Math.ceil((dataMax || 235) + 4),
                    ]}
                    allowDecimals={false}
                    tickFormatter={(v) => `${Math.round(v)}`}
                    stroke={isDark ? '#94a3b8' : '#64748b'}
                    fontSize={11}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#0f172a' : '#ffffff',
                      borderColor: isDark ? '#334155' : '#cbd5e1',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(val) => [`${val} V`, 'Voltaje']}
                  />
                  <Area
                    type="monotone"
                    dataKey="input_voltage"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#gradVolt)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Carga (Watts & %) */}
          <div className={cardClass}>
            <h3
              className={`text-sm font-semibold mb-4 ${
                isDark ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              Historial Consumo en Watts ({hoursRange}h)
            </h3>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="gradLoad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="4 4"
                    stroke={isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}
                  />
                  <XAxis
                    dataKey="time"
                    stroke={isDark ? '#94a3b8' : '#64748b'}
                    fontSize={11}
                    tickLine={false}
                    minTickGap={28}
                  />
                  <YAxis
                    domain={[0, (dataMax) => Math.ceil(((dataMax || 150) + 40) / 20) * 20]}
                    allowDecimals={false}
                    tickFormatter={(v) => `${Math.round(v)}W`}
                    stroke={isDark ? '#94a3b8' : '#64748b'}
                    fontSize={11}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#0f172a' : '#ffffff',
                      borderColor: isDark ? '#334155' : '#cbd5e1',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(val, _name, props) => [
                      `${val} W (${props.payload.ups_load}%)`,
                      'Consumo',
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="ups_watts"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    fill="url(#gradLoad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 3: Batería */}
          <div className={cardClass}>
            <h3
              className={`text-sm font-semibold mb-4 ${
                isDark ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              Historial Batería ({hoursRange}h)
            </h3>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="gradBat" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="4 4"
                    stroke={isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}
                  />
                  <XAxis
                    dataKey="time"
                    stroke={isDark ? '#94a3b8' : '#64748b'}
                    fontSize={11}
                    tickLine={false}
                    minTickGap={28}
                  />
                  <YAxis
                    domain={[0, 100]}
                    ticks={[0, 25, 50, 75, 100]}
                    allowDecimals={false}
                    tickFormatter={(v) => `${v}%`}
                    stroke={isDark ? '#94a3b8' : '#64748b'}
                    fontSize={11}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#0f172a' : '#ffffff',
                      borderColor: isDark ? '#334155' : '#cbd5e1',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(val) => [`${val}%`, 'Batería']}
                  />
                  <Area
                    type="monotone"
                    dataKey="battery_charge"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#gradBat)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Outages Card */}
        <div className={cardClass}>
          <h3
            className={`text-sm font-semibold mb-3 ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            Últimos Cortes de Energía
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr
                  className={`border-b text-xs uppercase ${
                    isDark
                      ? 'border-white/5 text-slate-400'
                      : 'border-slate-200 text-slate-500'
                  }`}
                >
                  <th className="py-2 px-3">Fecha</th>
                  <th className="py-2 px-3">Hora Inicio</th>
                  <th className="py-2 px-3">Hora Fin</th>
                  <th className="py-2 px-3">Duración</th>
                  <th className="py-2 px-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {outages.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className={`py-4 text-center text-xs ${
                        isDark ? 'text-slate-500' : 'text-slate-400'
                      }`}
                    >
                      Sin cortes registrados
                    </td>
                  </tr>
                ) : (
                  outages.map((ev) => {
                    const startDt = new Date(ev.started_at)
                    const endDt = ev.ended_at ? new Date(ev.ended_at) : null
                    return (
                      <tr
                        key={ev.id}
                        className={`border-b last:border-0 ${
                          isDark ? 'border-white/5' : 'border-slate-100'
                        }`}
                      >
                        <td className="py-2.5 px-3">
                          {startDt.toLocaleDateString('es-AR')}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-xs">
                          {startDt.toLocaleTimeString('es-AR', { hour12: false })}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-xs">
                          {endDt
                            ? endDt.toLocaleTimeString('es-AR', { hour12: false })
                            : 'En curso'}
                        </td>
                        <td className="py-2.5 px-3 font-semibold">
                          {formatDuration(ev.duration_sec)}
                        </td>
                        <td className="py-2.5 px-3">
                          {ev.status === 'resolved' ? (
                            <span className="text-xs font-semibold text-emerald-400">
                              Resuelto
                            </span>
                          ) : (
                            <span className="text-xs font-semibold text-red-400 animate-pulse">
                              En curso
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Original Footer */}
        <footer
          className={`mt-10 pt-5 border-t text-sm flex flex-col sm:flex-row items-center justify-between gap-4 ${
            isDark
              ? 'border-white/5 text-slate-400'
              : 'border-black/5 text-slate-500'
          }`}
        >
          <div>
            Created with 🧉 by{' '}
            <a
              href="https://juangonzalez.com.ar"
              target="_blank"
              rel="noreferrer"
              className="text-[#3b82f6] font-semibold hover:underline"
            >
              Juan Gonzalez
            </a>
          </div>

          <div
            className={`px-4 py-1.5 rounded-full border text-xs ${
              isDark
                ? 'bg-[#1e293b] border-white/5'
                : 'bg-white border-slate-200'
            }`}
          >
            <span>UPS Monitor v3.0</span>
            <span className="mx-2 opacity-30">•</span>
            <span>
              Actualizado:{' '}
              {live?.updated_at
                ? new Date(live.updated_at).toLocaleTimeString('es-AR', {
                    hour12: false,
                  })
                : 'Esperando datos...'}
            </span>
          </div>

          <a
            href="https://github.com/juanchixd/UPS_Lyonn_web"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 hover:text-white transition"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
            </svg>
            GitHub Repo
          </a>
        </footer>
      </div>
    </div>
  )
}
