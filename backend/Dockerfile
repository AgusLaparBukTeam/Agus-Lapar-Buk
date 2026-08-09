FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN groupadd --system gateguard \
    && useradd --system --gid gateguard --home-dir /nonexistent gateguard

COPY backend/requirements.txt /app/requirements.txt
RUN pip install --requirement /app/requirements.txt

COPY --chown=gateguard:gateguard backend/app /app/app
COPY --chown=gateguard:gateguard backend/alembic /app/alembic
COPY --chown=gateguard:gateguard backend/alembic.ini /app/alembic.ini
COPY --chown=gateguard:gateguard backend/scripts /app/scripts

USER gateguard
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
