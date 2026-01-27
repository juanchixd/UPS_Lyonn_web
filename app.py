"""
Created on 2024
@Creator: Juan Bautista Gonzalez
@Position: Student electronic engineering and programmer part-time
@Contact:
    - Email: contacto@juangonzalez.com.ar
"""


# Importar librerías / Import libraries
import os
import requests
from datetime import datetime, timedelta
from flask import Flask, render_template, jsonify
from flask_caching import Cache

# Crear una instancia de Flask / Create a Flask instance
app = Flask(__name__)

# Configuración de caché / Cache configuration
cache = Cache(app, config={'CACHE_TYPE': 'SimpleCache'})

# Timeout
REQUEST_TIMEOUT = 5

# Configurar conexión a Supabase usando variables de entorno / Setup Supabase connection using environment variables
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
API_URL = os.getenv("API_URL")
NAME_TABLE = os.getenv("NAME_TABLE")

def get_ups_data():
    """Obtiene datos de la API externa / Get data from the external API"""
    try:
        response = requests.get(API_URL, timeout=REQUEST_TIMEOUT)
        if response.status_code == 200:
            data = response.json()
            return data
    except requests.exceptions.RequestException as e:
        print(f"Error fetching UPS data: {e}")
    # En caso de error, devolver valores predeterminados / In case of error, return default values
    return {
        "ups_load": 0,
        "input_voltage": 0,
        "battery_charge": 0,
        "status": 'offline'
    }

# Ruta principal / Main route


@app.route('/')
def index():
    # Renderiza la plantilla index.html / Render the index.html template
    return render_template('index.html', data=None)

# Ruta para obtener los datos de la API / Route to get data from the API


@app.route('/api/data')
def api_data():
    # Realiza una solicitud GET a la API externa / Make a GET request to the external API
    return jsonify(get_ups_data())

# Ruta para obtener los datos de las últimas 24 horas / Route to get the last 24 hours data


@app.route('/api/last_24_hours')
@cache.cached(timeout=300)  # Cachear por 5 minutos / Cache for 5 minutes
def last_24_hours():
    # Asegúrate de usar UTC si tu servidor y Supabase están en zonas horarias diferentes / Make sure to use UTC if your server and Supabase are in different time zones
    now = datetime.now()
    last_24_hours = now - timedelta(hours=24)

    url = f"{SUPABASE_URL}/rest/v1/{NAME_TABLE}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }

    # Parámetros para filtrar por timestamp y seleccionar las columnas necesarias / Parameters to filter by timestamp and select the necessary columns
    params = {
        "select": "timestamp,ups_load,input_voltage,battery_charge",
        "timestamp": f"gte.{last_24_hours.isoformat()}",
        "order": "timestamp.asc"
    }

    try:
        response = requests.get(url, headers=headers, params=params, timeout=REQUEST_TIMEOUT)
        if response.status_code == 200:
            return jsonify(response.json())
    except requests.exceptions.RequestException as e:
        print(f"Error fetching last 24 hours data: {e}")
    return jsonify([])

if __name__ == "__main__":
    app.run(host='0.0.0.0', debug=False)
