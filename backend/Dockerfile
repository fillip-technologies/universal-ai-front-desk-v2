# Standalone backend image — used directly for local/dev docker-compose
# (with --reload + a source volume mount). The production image is the
# multi-stage Dockerfile at the repo root, which bundles the built frontend.
FROM python:3.12-slim
WORKDIR /app/backend

COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
