document.addEventListener("DOMContentLoaded", function () {
  // ==========================================
  // 1. CONFIGURACIÓN
  // ==========================================
  const RANGES = {
    voltage: { min: 190, warn: 205, high: 245, maxScale: 260 },
    battery: { critical: 20, low: 50 },
    load: { warning: 70, high: 90 },
  };

  let currentColors = { battery: "", voltage: "", load: "" };
  let lastValidData = { bat: 0, volt: 0, load: 0 };
  let isFirstLoad = true;

  const THEME = {
    dark: { text: "#94a3b8", grid: "rgba(255,255,255,0.05)" },
    light: { text: "#64748b", grid: "rgba(0,0,0,0.05)" },
  };

  let charts = {};

  // ==========================================
  // 2. HELPERS DE COLOR
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
  // 3. CONFIGURACIÓN GRÁFICOS
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
  // 4. INICIALIZACIÓN
  // ==========================================
  function init() {
    try {
      charts.radBat = new ApexCharts(
        document.querySelector("#radialBattery"),
        getGaugeConfig("Batería %", 100, true),
      );
      charts.radBat.render();

      charts.radVolt = new ApexCharts(
        document.querySelector("#radialVoltage"),
        getGaugeConfig("Entrada V", RANGES.voltage.maxScale, false),
      );
      charts.radVolt.render();

      charts.radLoad = new ApexCharts(
        document.querySelector("#radialLoad"),
        getGaugeConfig("Carga %", 100, true),
      );
      charts.radLoad.render();

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

      // Carga inicial asíncrona (esto evita que se bloquee la carga de la página)
      if (typeof initialData !== "undefined" && initialData) {
        updateUI(initialData);
      } else {
        // Si no hay datos iniciales, mostramos "Cargando..." y pedimos
        document.getElementById("status-indicator").innerText = "CONECTANDO...";
        fetchLiveData();
      }
      fetchHistory();
    } catch (e) {
      console.error("❌ Init Error:", e);
    }
  }

  // ==========================================
  // 5. UPDATE
  // ==========================================

  function updateGauge(chartInstance, val, colorFunc, typeKey, shouldAnimate) {
    if (!chartInstance) return;
    const newColor = colorFunc(val);
    if (currentColors[typeKey] !== newColor) {
      chartInstance.updateOptions({ colors: [newColor] }, false, shouldAnimate);
      currentColors[typeKey] = newColor;
    }
    chartInstance.updateSeries([val], shouldAnimate);
  }

  function updateUI(data) {
    const statusEl = document.getElementById("status-indicator");

    // 1. BLINDAJE CONTRA FALLOS
    // Si data es null, undefined, o tiene error, NO ACTUALIZAMOS nada visualmente
    // y mantenemos los valores anteriores.
    if (!data || data.error) {
      console.warn(
        "⚠️ Fetch fallido o datos corruptos. Manteniendo valores anteriores.",
      );
      if (statusEl) {
        statusEl.innerText = "RECONECTANDO...";
        statusEl.className = "status-offline";
        statusEl.style.color = "#f59e0b"; // Naranja advertencia
      }
      return; // SALIR DE LA FUNCIÓN, NO TOCAR LOS GRÁFICOS
    }

    // 2. PARSEO SEGURO
    // Si por alguna razón viene 0, verificamos si es un cero real o un fallo de lectura
    // Aquí asumimos que si viene data, es buena.
    let batVal = parseFloat(data.battery_charge);
    let voltVal = parseFloat(data.input_voltage);
    let loadVal = parseFloat(data.ups_load);

    // Si falló el parseFloat (NaN), usamos el último valor válido
    if (isNaN(batVal)) batVal = lastValidData.bat;
    if (isNaN(voltVal)) voltVal = lastValidData.volt;
    if (isNaN(loadVal)) loadVal = lastValidData.load;

    // Guardamos para la próxima vez que falle
    lastValidData = { bat: batVal, volt: voltVal, load: loadVal };

    // 3. ACTUALIZACIÓN VISUAL
    document.getElementById("val-battery").innerText = Math.round(batVal) + "%";
    document.getElementById("val-voltage").innerText =
      Math.round(voltVal) + " V";
    document.getElementById("val-load").innerText = Math.round(loadVal) + " %";

    if (statusEl) {
      if (voltVal > 150) {
        statusEl.innerText = "ONLINE (RED)";
        statusEl.className = "status-online";
        statusEl.style.color = ""; // Reset color
      } else {
        statusEl.innerText = "OFFLINE (BATERÍA)";
        statusEl.className = "status-offline";
      }
    }

    document.getElementById("last-update").innerText =
      "Actualizado: " +
      new Date().toLocaleTimeString("es-AR", { hour12: false });

    // Evitar animación brusca en la primera carga
    const animate = !isFirstLoad;

    updateGauge(charts.radBat, batVal, getColorForBattery, "battery", animate);
    updateGauge(charts.radVolt, voltVal, getColorForVoltage, "voltage", false); // Voltaje siempre estático
    updateGauge(charts.radLoad, loadVal, getColorForLoad, "load", animate);

    isFirstLoad = false;
  }

  function fetchLiveData() {
    fetch("/api/data")
      .then((r) => {
        if (!r.ok) throw new Error("HTTP Error");
        return r.json();
      })
      .then((d) => updateUI(d))
      .catch((e) => {
        console.error("Error en fetch:", e);
        // Si falla el fetch, updateUI no se llama,
        // pero cambiamos el estado visual a reconectando
        const statusEl = document.getElementById("status-indicator");
        if (statusEl) {
          statusEl.innerText = "ESPERANDO DATOS...";
          statusEl.className = "status-offline";
        }
      });
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
  setInterval(fetchLiveData, 10000);
  setInterval(fetchHistory, 300000);
});
