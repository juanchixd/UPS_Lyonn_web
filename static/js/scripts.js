document.addEventListener("DOMContentLoaded", function () {
  // Función para crear y actualizar los gauges
  function createGauge(
    elementId,
    minValue,
    maxValue,
    initialValue,
    gaugeColors
  ) {
    var opts = {
      angle: 0.2,
      lineWidth: 0.2,
      radiusScale: 1,
      pointer: {
        length: 0.7,
        strokeWidth: 0.035,
        color: "#484848",
      },
      staticLabels: {
        font: "16px monserrat",
        labels: [minValue, maxValue],
        color: "#000000",
        fractionDigits: 0,
      },
      staticZones: gaugeColors.map((color) => ({
        strokeStyle: color.color,
        min: color.min,
        max: color.max,
      })),
      renderTicks: {
        divisions: 5,
        divWidth: 1.5,
        divLength: 0.7,
        divColor: "#000000",
        subDivisions: 3,
        subDivWidth: 1,
        subDivLength: 0.4,
        subDivColor: "#000000",
      },
      highDpiSupport: true,
      animationSpeed: 1,
    };

    var target = document.getElementById(elementId);
    var gauge = new Gauge(target).setOptions(opts);
    gauge.maxValue = maxValue;
    gauge.setMinValue(minValue);
    gauge.set(initialValue);

    return gauge;
  }

  // Función para actualizar los gauges con datos
  function fetchDataAndUpdateGauges() {
    fetch("/api/data")
      .then((response) => response.json())
      .then((data) => {
        console.log(data);

        const batteryChargeColors = [
          { color: "#FF4C4C", min: 0, max: 20 },
          { color: "#FFBF00", min: 20, max: 50 },
          { color: "#4CAF50", min: 50, max: 100 },
        ];

        const inputVoltageColors = [
          { color: "#FF4C4C", min: 170, max: 190 },
          { color: "#FFBF00", min: 190, max: 200 },
          { color: "#4CAF50", min: 200, max: 240 },
          { color: "#FFBF00", min: 240, max: 250 },
          { color: "#FF4C4C", min: 250, max: 270 },
        ];

        const upsLoadColors = [
          { color: "#4CAF50", min: 0, max: 60 },
          { color: "#FFBF00", min: 60, max: 80 },
          { color: "#FF4C4C", min: 80, max: 100 },
        ];

        const batteryChargeGauge = createGauge(
          "batteryChargeGauge",
          0,
          100,
          data.battery_charge,
          batteryChargeColors
        );

        const inputVoltageGauge = createGauge(
          "inputVoltageGauge",
          170,
          270,
          data.input_voltage,
          inputVoltageColors
        );

        const upsLoadGauge = createGauge(
          "upsLoadGauge",
          0,
          100,
          data.ups_load,
          upsLoadColors
        );

        document.getElementById("batteryChargeValue").textContent =
          data.battery_charge + "%";
        document.getElementById("inputVoltageValue").textContent =
          data.input_voltage + "V";
        document.getElementById("upsLoadValue").textContent =
          data.ups_load + "%" + " = " + data.ups_load * 8 + "W";
      })
      .catch((error) => console.error("Error fetching data:", error));
  }

  // Función para crear las gráficas de las últimas 24 horas / Function to create the 24 hours charts
  function create24HoursChart(data, canvasId, label, dataKey) {
    const ctx = document.getElementById(canvasId).getContext("2d");
    const labels = data.map((d) => {
      const date = new Date(d.timestamp);
      date.setHours(date.getHours() + 3); // Convert from UTC to UTC-3
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    });
    const chartData = data.map((d) => d[dataKey]);

    new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: label,
            data: chartData,
            borderColor: "rgba(75, 192, 192, 1)",
            backgroundColor: "rgba(75, 192, 192, 0.2)",
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        scales: {
          x: {
            display: true,
            title: {
              display: true,
              text: "Time",
            },
            ticks: {
              autoSkip: true,
              maxRotation: 0,
              minRotation: 0,
              maxTicksLimit: 10,
            },
            time: {
              unit: "minute",
              stepSize: 15,
            },
          },
          y: {
            display: true,
            title: {
              display: true,
              text: label,
            },
          },
        },
      },
    });
  }

  // Función para obtener datos de las últimas 24 horas y crear las gráficas
  function fetch24HoursData() {
    fetch("/api/last_24_hours")
      .then((response) => response.json())
      .then((data) => {
        create24HoursChart(
          data,
          "batteryChargeChart",
          "Battery Charge (%)",
          "battery_charge"
        );
        create24HoursChart(
          data,
          "inputVoltageChart",
          "Input Voltage (V)",
          "input_voltage"
        );
        create24HoursChart(data, "upsLoadChart", "Load (%)", "ups_load");
      })
      .catch((error) => console.error("Error fetching data:", error));
  }

  function fetch24hours_update() {
    fetch("/api/last_24_hours")
      .then((response) => response.json())
      .then((data) => {
        const batteryChargeChart =
          document.getElementById("batteryChargeChart");
        const inputVoltageChart = document.getElementById("inputVoltageChart");
        const upsLoadChart = document.getElementById("upsLoadChart");

        batteryChargeChart.data.datasets[0].data = data.map(
          (d) => d.battery_charge
        );
        batteryChargeChart.update();

        inputVoltageChart.data.datasets[0].data = data.map(
          (d) => d.input_voltage
        );
        inputVoltageChart.update();

        upsLoadChart.data.datasets[0].data = data.map((d) => d.ups_load);
        upsLoadChart.update();
      })
      .catch((error) => console.error("Error fetching data:", error));
  }

  fetchDataAndUpdateGauges();
  setInterval(fetchDataAndUpdateGauges, 10000);
  fetch24HoursData();
  setInterval(fetch24hours_update, 600000);
});
