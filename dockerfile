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

COPY . .

# Puerto donde corre FastAPI (por defecto 8000, pero configurable)
ENV PORT=8000
EXPOSE $PORT

# Usamos uvicorn para manejar las peticiones asíncronas
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port $PORT --proxy-headers"]