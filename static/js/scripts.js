document.addEventListener("DOMContentLoaded", function () {
  console.log("🟢 Scripts.js v6.0 (Hard Static Update) cargado");

  // ==========================================
  // 1. CONFIGURACIÓN DE RANGOS
  // ==========================================
  const RANGES = {
    voltage: { min: 190, warn: 205, high: 245, maxScale: 260 },
    battery: { critical: 20, low: 50 },
    load: { warning: 70, high: 90 },
  };

  let currentColors = { battery: "", voltage: "", load: "" };

  // ==========================================
  // 2. CONFIGURACIÓN DE TEMA
  // ==========================================
  const THEME = {
    dark: { text: "#94a3b8", grid: "rgba(255,255,255,0.05)" },
    light: { text: "#64748b", grid: "rgba(0,0,0,0.05)" },
  };

  let charts = {};

  // ==========================================
  // 3. HELPERS DE COLOR
  // ==========================================
  function getColorForBattery(val) {
    if (val <= RANGES.battery.critical) return "#ef4444";
    if (val <= RANGES.battery.low) return "#f59e0b";
    return "#10b981";
  }
  function getColorForVoltage(val) {
    if (val < RANGES.voltage.min) return "#ef4444";
    if (val < RANGES.voltage.warn) return "#f59e0b";
    if (val > RANGES.voltage.high) return "#ef4444";
    return "#3b82f6";
  }
  function getColorForLoad(val) {
    if (val >= RANGES.load.high) return "#ef4444";
    if (val >= RANGES.load.warning) return "#f59e0b";
    return "#10b981";
  }

  // ==========================================
  // 4. CONFIGURACIÓN DE GRÁFICOS
  // ==========================================
  function getGaugeConfig(label, maxVal, animate = true) {
    return {
      series: [0],
      chart: {
        type: "radialBar",
        height: 250,
        fontFamily: "Segoe UI, sans-serif",
        animations: {
          enabled: animate,
          easing: "easeinout",
          speed: 800,
          dynamicAnimation: { enabled: animate },
        },
        offsetY: -20,
        background: "transparent",
      },
      plotOptions: {
        radialBar: {
          startAngle: -135,
          endAngle: 135,
          track: { background: "rgba(128,128,128,0.2)", strokeWidth: "97%" },
          dataLabels: {
            name: { show: true, offsetY: -20, color: "#888", fontSize: "14px" },
            value: {
              offsetY: -10,
              fontSize: "22px",
              fontWeight: "bold",
              formatter: function (val) {
                return Math.round(val);
              },
            },
          },
          hollow: { size: "60%" },
        },
      },
      fill: {
        type: "gradient",
        gradient: { shade: "dark", type: "horizontal", stops: [0, 100] },
      },
      stroke: { lineCap: "round" },
      labels: [label],
      colors: ["#888"],
      yaxis: { max: maxVal },
    };
  }

  function getAreaConfig(color, title) {
    return {
      series: [{ name: title, data: [] }],
      chart: {
        type: "area",
        height: 300,
        toolbar: { show: false },
        background: "transparent",
        fontFamily: "Segoe UI, sans-serif",
        zoom: { enabled: false },
      },
      colors: [color],
      dataLabels: { enabled: false },
      stroke: { curve: "smooth", width: 2 },
      fill: {
        type: "gradient",
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.4,
          opacityTo: 0.05,
          stops: [0, 100],
        },
      },
      grid: { borderColor: "rgba(255,255,255,0.05)", strokeDashArray: 4 },
      xaxis: {
        type: "datetime",
        labels: {
          style: { colors: "#94a3b8" },
          datetimeFormatter: { hour: "HH:mm" },
        },
      },
      yaxis: { labels: { style: { colors: "#94a3b8" } } },
      theme: { mode: "dark" },
    };
  }

  // ==========================================
  // 5. INICIALIZACIÓN
  // ==========================================
  function init() {
    try {
      // Batería (Animado)
      charts.radBat = new ApexCharts(
        document.querySelector("#radialBattery"),
        getGaugeConfig("Batería %", 100, true),
      );
      charts.radBat.render();

      // Voltaje (NO Animado en config inicial)
      charts.radVolt = new ApexCharts(
        document.querySelector("#radialVoltage"),
        getGaugeConfig("Entrada V", RANGES.voltage.maxScale, false),
      );
      charts.radVolt.render();

      // Carga (Animado)
      charts.radLoad = new ApexCharts(
        document.querySelector("#radialLoad"),
        getGaugeConfig("Carga %", 100, true),
      );
      charts.radLoad.render();

      // Areas
      charts.areaVolt = new ApexCharts(
        document.querySelector("#areaVoltage"),
        getAreaConfig("#3b82f6", "Voltaje"),
      );
      charts.areaVolt.render();
      charts.areaLoad = new ApexCharts(
        document.querySelector("#areaLoad"),
        getAreaConfig("#f59e0b", "Carga"),
      );
      charts.areaLoad.render();
      charts.areaBat = new ApexCharts(
        document.querySelector("#areaBattery"),
        getAreaConfig("#10b981", "Batería"),
      );
      charts.areaBat.render();

      if (typeof initialData !== "undefined" && initialData)
        updateUI(initialData);
      else fetchLiveData();

      fetchHistory();
    } catch (e) {
      console.error("❌ Init Error:", e);
    }
  }

  // ==========================================
  // 6. ACTUALIZACIÓN (FIX ANIMACIÓN)
  // ==========================================

  function updateGauge(chartInstance, val, colorFunc, typeKey, shouldAnimate) {
    if (!chartInstance) return;

    const newColor = colorFunc(val);

    // Actualizar color solo si cambia (evita redraw innecesario)
    if (currentColors[typeKey] !== newColor) {
      chartInstance.updateOptions({ colors: [newColor] }, false, shouldAnimate);
      currentColors[typeKey] = newColor;
    }

    chartInstance.updateSeries([val], shouldAnimate);
  }

  function updateUI(data) {
    const statusEl = document.getElementById("status-indicator");

    if (!data || data.error) {
      if (statusEl) {
        statusEl.innerText = "API ERROR";
        statusEl.className = "status-offline";
      }
      return;
    }
    // Parseo
    let batVal = parseFloat(data.battery_charge || 0);
    let voltVal = parseFloat(data.input_voltage || 0);
    let loadVal = parseFloat(data.ups_load || 0);

    // Textos
    document.getElementById("val-battery").innerText = Math.round(batVal) + "%";
    document.getElementById("val-voltage").innerText =
      Math.round(voltVal) + " V";
    document.getElementById("val-load").innerText = Math.round(loadVal) + " %";

    // Estado
    if (statusEl) {
      if (voltVal > 150) {
        statusEl.innerText = "ONLINE (RED)";
        statusEl.className = "status-online";
      } else {
        statusEl.innerText = "OFFLINE (BATERÍA)";
        statusEl.className = "status-offline";
      }
    }

    document.getElementById("last-update").innerText =
      "Actualizado: " + new Date().toLocaleTimeString();

    updateGauge(charts.radBat, batVal, getColorForBattery, "battery", true); // Animado
    updateGauge(charts.radVolt, voltVal, getColorForVoltage, "voltage", false); // Estatico
    updateGauge(charts.radLoad, loadVal, getColorForLoad, "load", true); // Animado
  }

  function fetchLiveData() {
    fetch("/api/data")
      .then((r) => r.json())
      .then((d) => updateUI(d))
      .catch((e) => console.error(e));
  }

  function fetchHistory() {
    fetch("/api/last_24_hours")
      .then((r) => r.json())
      .then((data) => {
        if (!data || data.length === 0) return;
        const sBat = data.map((d) => ({
          x: new Date(d.timestamp).getTime(),
          y: parseFloat(d.battery_charge),
        }));
        const sVolt = data.map((d) => ({
          x: new Date(d.timestamp).getTime(),
          y: parseFloat(d.input_voltage),
        }));
        const sLoad = data.map((d) => ({
          x: new Date(d.timestamp).getTime(),
          y: parseFloat(d.ups_load),
        }));

        if (charts.areaBat) charts.areaBat.updateSeries([{ data: sBat }]);
        if (charts.areaVolt) charts.areaVolt.updateSeries([{ data: sVolt }]);
        if (charts.areaLoad) charts.areaLoad.updateSeries([{ data: sLoad }]);
      });
  }

  // --- DARK MODE ---
  const btnToggle = document.getElementById("theme-toggle");
  let isDarkMode = true;
  if (btnToggle) {
    btnToggle.addEventListener("click", () => {
      isDarkMode = !isDarkMode;
      document.body.classList.toggle("light-mode");
      document.body.classList.toggle("dark-mode");
      btnToggle.innerText = isDarkMode ? "☀" : "☾";

      let theme = isDarkMode ? THEME.dark : THEME.light;
      let modeStr = isDarkMode ? "dark" : "light";

      Object.values(charts).forEach((chart) => {
        if (chart) {
          chart.updateOptions({
            theme: { mode: modeStr },
            xaxis: { labels: { style: { colors: theme.text } } },
            yaxis: { labels: { style: { colors: theme.text } } },
            grid: { borderColor: theme.grid },
            plotOptions: {
              radialBar: {
                dataLabels: {
                  name: { color: theme.text },
                  value: { color: theme.text },
                },
              },
            },
          });
        }
      });
    });
  }

  init();
  setInterval(fetchLiveData, 5000);
  setInterval(fetchHistory, 300000);
});
