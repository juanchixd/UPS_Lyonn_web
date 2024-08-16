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
from supabase import create_client, Client

# Crear una instancia de Flask / Create a Flask instance
app = Flask(__name__)

# Configurar conexión a Supabase usando variables de entorno / Setup Supabase connection using environment variables
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
API_URL = os.getenv("API_URL")

# Crear una instancia de Supabase / Create a Supabase instance
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Ruta principal / Main route


@app.route('/')
def index():
    # Realiza una solicitud GET a la API externa / Make a GET request to the external API
    response = requests.get(API_URL)
    if response.status_code == 200:
        data = response.json()
    else:
        data = {
            "ups_load": 0,
            "input_voltage": 0,
            "battery_charge": 0,
        }

    return render_template('index.html', data=data)

# Ruta para obtener los datos de la API / Route to get data from the API


@app.route('/api/data')
def api_data():
    # Realiza una solicitud GET a la API externa / Make a GET request to the external API
    response = requests.get(
        'https://apiups.juangonzalez.com.ar/api/last_ups_data')
    if response.status_code == 200:
        data = response.json()
    else:
        data = {
            "ups_load": 0,
            "input_voltage": 0,
            "battery_charge": 0,
        }
    return jsonify(data)

# Ruta para obtener los datos de las últimas 24 horas / Route to get the last 24 hours data


@app.route('/api/last_24_hours')
def last_24_hours():
    # Obtener los datos de las últimas 24 horas de Supabase / Get the last 24 hours data from Supabase
    now = datetime.now()
    last_24_hours = now - timedelta(hours=24)

    response = supabase.table('ups_status').select(
        'timestamp, ups_load, input_voltage, battery_charge'
    ).gte('timestamp', last_24_hours.isoformat()).execute()

    if response.data:
        return jsonify(response.data)
    else:
        return jsonify([])


if __name__ == "__main__":
    app.run(debug=True)
