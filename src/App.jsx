import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'
import {
  Activity,
  AlertTriangle,
  BatteryCharging,
  Clock,
  Cpu,
  Github,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sun,
  WifiOff,
  Zap,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

function RadialGauge({ value, max, unit, label, sublabel, color, isDark }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  const radius = 50
  const circumference = 2 * Math.PI * radius
  const arcLength = circumference * 0.75
  const dashOffset = arcLength - (pct / 100) * arcLength

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative w-36 h-32 flex items-center justify-center">
        <svg className="w-36 h-36 -rotate-[225deg]" viewBox="0 0 120 120">
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={isDark ? '#1e293b' : '#e2e8f0'}
            strokeWidth="10"
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
          />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.4s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
          <span className="text-2xl font-bold tracking-tight">
            {typeof value === 'number' ? value : '--'}
            <span className="text-sm font-medium opacity-75 ml-0.5">{unit}</span>
          </span>
          {sublabel && (
            <span className="text-xs font-medium opacity-60 mt-0.5">{sublabel}</span>
          )}
        </div>
      </div>
      <span className="text-xs uppercase tracking-wider font-semibold opacity-70 -mt-2">
        {label}
      </span>
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
        .limit(10),
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
        fullDate: dt.toLocaleString('es-AR', { hour12: false }),
        input_voltage: Number(pt.input_voltage),
        output_voltage: Number(pt.output_voltage),
        ups_load: Number(pt.ups_load),
        ups_watts: Number(pt.ups_watts),
        battery_charge: Number(pt.battery_charge),
        battery_voltage: Number(pt.battery_voltage),
      }
    })
  }, [telemetry])

  const stats = useMemo(() => {
    if (!chartData.length) return null
    const volts = chartData.map((d) => d.input_voltage).filter((v) => v > 0)
    const watts = chartData.map((d) => d.ups_watts)
    return {
      vMin: volts.length ? Math.min(...volts).toFixed(1) : '--',
      vMax: volts.length ? Math.max(...volts).toFixed(1) : '--',
      wAvg: watts.length
        ? Math.round(watts.reduce((a, b) => a + b, 0) / watts.length)
        : '--',
      wPeak: watts.length ? Math.round(Math.max(...watts)) : '--',
    }
  }, [chartData])

  const inVolt = Number(live?.input_voltage ?? 0)
  const outVolt = Number(live?.output_voltage ?? 0)
  const freq = Number(live?.input_frequency ?? 50)
  const loadPct = Number(live?.ups_load ?? 0)
  const watts = Number(live?.ups_watts ?? 0)
  const va = Number(live?.ups_va ?? 0)
  const kw = (watts / 1000).toFixed(2)
  const battPct = Number(live?.battery_charge ?? 0)
  const battVolt = Number(live?.battery_voltage ?? 0)
  const runtimeMin = Number(live?.runtime_min ?? 0)

  const voltColor =
    inVolt < 195 || inVolt > 245
      ? '#ef4444'
      : inVolt < 208 || inVolt > 238
      ? '#f59e0b'
      : '#38bdf8'
  const loadColor =
    loadPct >= 85 ? '#ef4444' : loadPct >= 65 ? '#f59e0b' : '#f59e0b'
  const battColor =
    battPct <= 25 ? '#ef4444' : battPct <= 55 ? '#f59e0b' : '#10b981'

  return (
    <div
      className={
        isDark
          ? 'min-h-screen bg-slate-950 text-slate-100 transition-colors'
          : 'min-h-screen bg-slate-50 text-slate-900 transition-colors'
      }
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Header */}
        <header
          className={`rounded-2xl border p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-lg ${
            isDark
              ? 'bg-slate-900/80 border-slate-800'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <Zap className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                  UPS LYONN 800VA
                </h1>
                <span className="text-xs px-2 py-0.5 rounded-md font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30">
                  480W / 800VA
                </span>
              </div>
              <p className="text-xs sm:text-sm opacity-65 mt-0.5">
                Telemetría Eléctrica en Tiempo Real • Host Lenovo M920 + Zabbix + Supabase
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-center">
            {/* Live status badge */}
            {loading ? (
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Conectando...
              </span>
            ) : isServerStale ? (
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                <WifiOff className="w-3.5 h-3.5" />
                SERVIDOR OFFLINE (hace {Math.floor(secondsSinceUpdate / 60)}m)
              </span>
            ) : isOnBattery ? (
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse">
                <AlertTriangle className="w-3.5 h-3.5" />
                EN BATERÍA ({live?.ups_status})
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                ONLINE • RED ELÉCTRICA ({live?.ups_status || 'OL'})
              </span>
            )}

            <button
              onClick={() => setIsDark(!isDark)}
              className={`p-2.5 rounded-xl border transition ${
                isDark
                  ? 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-amber-300'
                  : 'bg-slate-100 border-slate-300 hover:bg-slate-200 text-slate-700'
              }`}
              title="Cambiar tema Claro/Oscuro"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Stale Server Alert Banner */}
        {isServerStale && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 flex items-start gap-3 text-amber-300 text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
            <div>
              <p className="font-semibold">
                El servidor local lleva {Math.floor(secondsSinceUpdate / 60)} min sin reportar a Supabase
              </p>
              <p className="opacity-80 text-xs mt-0.5">
                Mostrando el último estado conocido guardado en la nube antes de perder conexión (
                {live?.updated_at
                  ? new Date(live.updated_at).toLocaleString('es-AR', { hour12: false })
                  : 'N/A'}
                ).
              </p>
            </div>
          </div>
        )}

        {/* 4 KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Voltage */}
          <div
            className={`rounded-2xl border p-5 flex flex-col justify-between shadow-md ${
              isDark
                ? 'bg-slate-900/75 border-slate-800'
                : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider opacity-60">
                  Tensión de Línea
                </p>
                <p className="text-2xl font-bold mt-1">{inVolt.toFixed(1)} V</p>
              </div>
              <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400">
                <Activity className="w-5 h-5" />
              </div>
            </div>

            <RadialGauge
              value={Math.round(inVolt)}
              max={260}
              unit="V"
              label="Entrada AC"
              sublabel={`Salida: ${outVolt.toFixed(1)}V • ${freq.toFixed(0)}Hz`}
              color={voltColor}
              isDark={isDark}
            />
          </div>

          {/* Card 2: Power Load in Watts & % */}
          <div
            className={`rounded-2xl border p-5 flex flex-col justify-between shadow-md ${
              isDark
                ? 'bg-slate-900/75 border-slate-800'
                : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider opacity-60">
                  Consumo Real
                </p>
                <div className="flex items-baseline gap-2 mt-1">
                  <p className="text-2xl font-bold text-amber-400">
                    {Math.round(watts)} W
                  </p>
                  <span className="text-xs opacity-70 font-medium">
                    ({kw} kW • {Math.round(va)} VA)
                  </span>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400">
                <Cpu className="w-5 h-5" />
              </div>
            </div>

            <RadialGauge
              value={Math.round(loadPct)}
              max={100}
              unit="%"
              label="Carga sobre 480W"
              sublabel={`${Math.round(watts)} W / 480 W máx`}
              color={loadColor}
              isDark={isDark}
            />
          </div>

          {/* Card 3: Battery */}
          <div
            className={`rounded-2xl border p-5 flex flex-col justify-between shadow-md ${
              isDark
                ? 'bg-slate-900/75 border-slate-800'
                : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider opacity-60">
                  Carga Batería
                </p>
                <p className="text-2xl font-bold text-emerald-400 mt-1">
                  {Math.round(battPct)}%
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400">
                <BatteryCharging className="w-5 h-5" />
              </div>
            </div>

            <RadialGauge
              value={Math.round(battPct)}
              max={100}
              unit="%"
              label="Batería 12V 7Ah"
              sublabel={`Tensión DC: ${battVolt.toFixed(2)} V`}
              color={battColor}
              isDark={isDark}
            />
          </div>

          {/* Card 4: Estimated Runtime & Specs */}
          <div
            className={`rounded-2xl border p-5 flex flex-col justify-between shadow-md ${
              isDark
                ? 'bg-slate-900/75 border-slate-800'
                : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider opacity-60">
                  Autonomía Estimada
                </p>
                <p className="text-2xl font-bold text-indigo-400 mt-1">
                  ~{Math.round(runtimeMin)} min
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400">
                <Clock className="w-5 h-5" />
              </div>
            </div>

            <div className="my-auto space-y-3 pt-4">
              <div className="flex justify-between text-xs">
                <span className="opacity-70">Potencia Activa:</span>
                <span className="font-semibold">{Math.round(watts)} W / 480 W</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="opacity-70">Potencia Aparente:</span>
                <span className="font-semibold">{Math.round(va)} VA / 800 VA</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="opacity-70">Voltaje Flotación DC:</span>
                <span className="font-semibold">{battVolt.toFixed(2)} V</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="opacity-70">Última sincronización:</span>
                <span className="font-semibold">
                  {live?.updated_at
                    ? new Date(live.updated_at).toLocaleTimeString('es-AR', {
                        hour12: false,
                      })
                    : '--:--:--'}
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs opacity-70">
              <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                <ShieldCheck className="w-3.5 h-3.5" /> RLS Protegido
              </span>
              <span>Supabase Realtime</span>
            </div>
          </div>
        </div>

        {/* Range Selector & Summary Bar */}
        <div
          className={`rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${
            isDark
              ? 'bg-slate-900/75 border-slate-800'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm">
            <span className="font-semibold">Estadísticas del período:</span>
            {stats && (
              <>
                <span className="px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  Tensión Mín/Máx: <b>{stats.vMin}V</b> / <b>{stats.vMax}V</b>
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Consumo Promedio: <b>{stats.wAvg} W</b> • Pico: <b>{stats.wPeak} W</b>
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 self-start sm:self-center">
            {[
              { label: '1h', val: 1 },
              { label: '6h', val: 6 },
              { label: '24h', val: 24 },
              { label: '7d', val: 168 },
            ].map((btn) => (
              <button
                key={btn.val}
                onClick={() => setHoursRange(btn.val)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  hoursRange === btn.val
                    ? 'bg-sky-500 text-white shadow-sm'
                    : isDark
                    ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* Telemetry Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Chart 1: Voltage */}
          <div
            className={`rounded-2xl border p-5 shadow-md ${
              isDark
                ? 'bg-slate-900/75 border-slate-800'
                : 'bg-white border-slate-200'
            }`}
          >
            <h3 className="text-sm font-semibold mb-4 flex items-center justify-between">
              <span>Historial de Tensión (V)</span>
              <span className="text-xs text-sky-400 font-normal">
                Últimas {hoursRange}h
              </span>
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="gradVolt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={isDark ? '#1e293b' : '#e2e8f0'}
                  />
                  <XAxis
                    dataKey="time"
                    stroke={isDark ? '#64748b' : '#94a3b8'}
                    fontSize={11}
                  />
                  <YAxis
                    domain={['dataMin - 4', 'dataMax + 4']}
                    stroke={isDark ? '#64748b' : '#94a3b8'}
                    fontSize={11}
                    unit="V"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#0f172a' : '#ffffff',
                      borderColor: isDark ? '#334155' : '#cbd5e1',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="input_voltage"
                    name="Entrada (V)"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    fill="url(#gradVolt)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Power in Watts */}
          <div
            className={`rounded-2xl border p-5 shadow-md ${
              isDark
                ? 'bg-slate-900/75 border-slate-800'
                : 'bg-white border-slate-200'
            }`}
          >
            <h3 className="text-sm font-semibold mb-4 flex items-center justify-between">
              <span>Consumo Eléctrico (Watts)</span>
              <span className="text-xs text-amber-400 font-normal">
                Potencia Activa (W)
              </span>
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="gradWatts" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={isDark ? '#1e293b' : '#e2e8f0'}
                  />
                  <XAxis
                    dataKey="time"
                    stroke={isDark ? '#64748b' : '#94a3b8'}
                    fontSize={11}
                  />
                  <YAxis
                    domain={[0, 'dataMax + 40']}
                    stroke={isDark ? '#64748b' : '#94a3b8'}
                    fontSize={11}
                    unit="W"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#0f172a' : '#ffffff',
                      borderColor: isDark ? '#334155' : '#cbd5e1',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                    }}
                    formatter={(val, name, props) => {
                      if (name === 'Consumo (W)') {
                        return [`${val} W (${props.payload.ups_load}%)`, name]
                      }
                      return [val, name]
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="ups_watts"
                    name="Consumo (W)"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    fill="url(#gradWatts)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 3: Battery */}
          <div
            className={`rounded-2xl border p-5 shadow-md ${
              isDark
                ? 'bg-slate-900/75 border-slate-800'
                : 'bg-white border-slate-200'
            }`}
          >
            <h3 className="text-sm font-semibold mb-4 flex items-center justify-between">
              <span>Carga de Batería (%)</span>
              <span className="text-xs text-emerald-400 font-normal">
                Respaldo 12V DC
              </span>
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="gradBat" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={isDark ? '#1e293b' : '#e2e8f0'}
                  />
                  <XAxis
                    dataKey="time"
                    stroke={isDark ? '#64748b' : '#94a3b8'}
                    fontSize={11}
                  />
                  <YAxis
                    domain={[0, 105]}
                    stroke={isDark ? '#64748b' : '#94a3b8'}
                    fontSize={11}
                    unit="%"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#0f172a' : '#ffffff',
                      borderColor: isDark ? '#334155' : '#cbd5e1',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="battery_charge"
                    name="Batería (%)"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#gradBat)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Outages Table */}
        <div
          className={`rounded-2xl border p-5 shadow-md ${
            isDark
              ? 'bg-slate-900/75 border-slate-800'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold">
                ⚡ Historial de Cortes de Suministro Eléctrico
              </h3>
              <p className="text-xs opacity-65">
                Eventos registrados por Zabbix y sincronizados en la nube (Supabase)
              </p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 font-medium">
              {outages.length} eventos
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr
                  className={`border-b ${
                    isDark ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-500'
                  }`}
                >
                  <th className="py-2.5 px-3 font-semibold">Fecha</th>
                  <th className="py-2.5 px-3 font-semibold">Inicio</th>
                  <th className="py-2.5 px-3 font-semibold">Fin</th>
                  <th className="py-2.5 px-3 font-semibold">Duración</th>
                  <th className="py-2.5 px-3 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {outages.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center opacity-60">
                      No hay cortes registrados.
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
                          isDark ? 'border-slate-800/60' : 'border-slate-100'
                        }`}
                      >
                        <td className="py-3 px-3 font-medium">
                          {startDt.toLocaleDateString('es-AR')}
                        </td>
                        <td className="py-3 px-3 font-mono">
                          {startDt.toLocaleTimeString('es-AR', { hour12: false })}
                        </td>
                        <td className="py-3 px-3 font-mono">
                          {endDt
                            ? endDt.toLocaleTimeString('es-AR', { hour12: false })
                            : 'En curso'}
                        </td>
                        <td className="py-3 px-3 font-semibold text-amber-400">
                          {formatDuration(ev.duration_sec)}
                        </td>
                        <td className="py-3 px-3">
                          {ev.status === 'resolved' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              Resuelto
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse">
                              En Curso
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

        {/* Footer */}
        <footer className="pt-2 pb-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs opacity-65">
          <p>
            Creado con 🧉 por{' '}
            <a
              href="https://juangonzalez.com.ar"
              target="_blank"
              rel="noreferrer"
              className="text-sky-400 hover:underline font-medium"
            >
              Juan Gonzalez
            </a>
          </p>
          <div className="flex items-center gap-3">
            <span>UPS Monitor v3.0 (React + Zabbix + Supabase)</span>
            <span>•</span>
            <a
              href="https://github.com/juanchixd/UPS_Lyonn_web"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-sky-400"
            >
              <Github className="w-3.5 h-3.5" /> GitHub Repo
            </a>
          </div>
        </footer>
      </div>
    </div>
  )
}
