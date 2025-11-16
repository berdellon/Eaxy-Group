from flask import Flask, request, jsonify
from flask_cors import CORS
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
import os, jwt, datetime, time

app = Flask(__name__)
CORS(app)

SECRET_KEY = os.getenv("SECRET_KEY", "eaxysecret")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///local.db")

# Corrección para Render
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://")

print("DB usada:", DATABASE_URL)

engine = create_engine(DATABASE_URL, echo=False, pool_pre_ping=True)


def create_tables():
    with engine.connect() as conn:
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE,
            pin TEXT,
            role TEXT,
            tienda TEXT
        );
        """))

        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS operaciones (
            id SERIAL PRIMARY KEY,
            tipo TEXT,
            cliente TEXT,
            importe NUMERIC,
            moneda TEXT,
            tienda TEXT,
            fecha TIMESTAMP DEFAULT NOW()
        );
        """))

        conn.commit()


def insert_initial_users():
    with engine.connect() as conn:
        count = conn.execute(text("SELECT COUNT(*) FROM users")).scalar()
        if count == 0:
            conn.execute(text("""
                INSERT INTO users (username, pin, role, tienda) VALUES
                ('Dani','1319','admin','Barcelona'),
                ('Camilo','3852','admin','Barcelona'),
                ('Madrid','1234','user','Madrid');
            """))
            conn.commit()


# Esperar DB Render
ready = False
for i in range(10):
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        ready = True
        break
    except OperationalError:
        print("DB no lista, reintentando…")
        time.sleep(2)

if not ready:
    print("ERROR: No se pudo conectar a la DB.")
else:
    create_tables()
    insert_initial_users()
    print("BD lista ✔")


@app.get("/api/health")
def health():
    return jsonify({"ok": True})


@app.post("/api/login")
def login():
    data = request.json
    u = data.get("username")
    p = data.get("pin")

    # 🔥 AQUÍ ESTABA EL ERROR — AHORA YA ESTÁ TODO EN UNA SOLA LÍNEA
    query = """
        SELECT id, role, tienda
        FROM users
        WHERE username = :u AND pin = :p
    """

    with engine.connect() as conn:
        result = conn.execute(text(query), {"u": u, "p": p}).fetchone()

    if not result:
        return jsonify({"ok": False}), 401

    token = jwt.encode({
        "id": result.id,
        "role": result.role,
        "tienda": result.tienda,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=12)
    }, SECRET_KEY, algorithm="HS256")

    return jsonify({"ok": True, "token": token})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
