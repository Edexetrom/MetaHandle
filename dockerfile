FROM python:3.11-slim

# Evita que Python genere archivos .pyc y permite ver logs en tiempo real
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

WORKDIR /app

# Instalamos dependencias del sistema necesarias
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiamos el resto del código del backend
COPY . .

# Variables de entorno y exposición de puerto
ENV PORT=8000
EXPOSE $PORT

# Usamos uvicorn atado explícitamente a 0.0.0.0 para que escuche hacia el exterior del contenedor
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port $PORT --proxy-headers"]