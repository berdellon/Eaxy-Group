from flask import Flask, request, jsonify
from flask_cors import CORS
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
import os, jwt, datetime, time

app = Flask(__name__)
CORS(app)

SECRET_KEY = os.getenv("SECRET_KEY", "eaxysecret")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///local.db")

# Fix Render prefix
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://")

print("DB usada:", DATABASE_URL)

engine = create_engine(DATABASE_URL, echo=False, pool_pre_ping=True)


# -------------------------------
#   CREACIÓN DE TABLAS
# -------------------------------
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
                estado TEXT,
                tienda TEXT,
                fecha TIMESTAMP DEFAULT NOW()
            );
        """))

        conn.commit()


def insert_initial_users():
    with engine.connect() as conn:
        c = conn.execute(text("SELECT COUNT(*) FROM users")).scalar()
        if c == 0:
            conn.execute(text("""
                INSERT INTO users (username, pin, role, tienda) VALUES
                ('Dani','1319','admin','Barcelona'),
                ('Camilo','3852','admin','Barcelona'),
                ('Madrid','1234','user','Madrid');
            """))
            conn.commit()


# Espera DB en Render
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


# -------------------------------
#   AUTENTICACIÓN
# -------------------------------
@app.post("/api/login")
def login():
    data = request.json
    username = data.get("username")
    pin = data.get("pin")

    query = """
        SELECT id, role, tienda
        FROM users
        WHERE username = :u AND pin = :p
    """

    with engine.connect() as conn:
        result = conn.execute(text(query), {"u": username, "p": pin}).fetchone()

    if not result:
        return jsonify({"ok": False, "msg": "Credenciales incorrectas"}), 401

    token = jwt.encode({
        "id": result.id,
        "role": result.role,
        "tienda": result.tienda,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=24)
    }, SECRET_KEY, algorithm="HS256")

    return jsonify({"ok": True, "token": token})


def auth(req):
    """ Decodifica el token y devuelve los datos """
    token = req.headers.get("Authorization", "").replace("Bearer ", "")

    if not token:
        return None

    try:
        data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        return data
    except:
        return None


# -------------------------------
#   API: CREAR OPERACIÓN
# -------------------------------
@app.post("/api/operaciones")
def crear_operacion():
    user = auth(request)
    if not user:
        return jsonify({"ok": False, "msg": "Token inválido"}), 401

    data = request.json

    query = """
        INSERT INTO operaciones (tipo, cliente, importe, moneda, estado, tienda)
        VALUES (:tipo, :cliente, :importe, :moneda, :estado, :tienda)
        RETURNING id
    """

    with engine.connect() as conn:
        res = conn.execute(text(query), {
            "tipo": data["tipo"],
            "cliente": data["cliente"],
            "importe": data["importe"],
            "moneda": data["moneda"],
            "estado": data.get("estado", "finalizada"),
            "tienda": user["tienda"]
        })

        new_id = res.fetchone()[0]
        conn.commit()

    return jsonify({"ok": True, "id": new_id})


# -------------------------------
#   API: LISTAR OPERACIONES DEL DÍA
# -------------------------------
@app.get("/api/daily")
def daily():
    user = auth(request)
    if not user:
        return jsonify({"ok": False}), 401

    query = """
        SELECT *
        FROM operaciones
        WHERE tienda = :t
        AND DATE(fecha) = CURRENT_DATE
        ORDER BY fecha DESC
    """

    with engine.connect() as conn:
        rows = conn.execute(text(query), {"t": user["tienda"]}).mappings().all()

    return jsonify({"ok": True, "daily": list(rows)})


# -------------------------------
#   API: CAJA FUERTE
# -------------------------------
@app.get("/api/caja")
def caja():
    user = auth(request)
    if not user:
        return jsonify({"ok": False}), 401

    query = """
        SELECT 
            SUM(CASE WHEN tipo='entrada' OR tipo='cash' THEN importe ELSE 0 END) -
            SUM(CASE WHEN tipo='salida' THEN importe ELSE 0 END) 
        AS caja
        FROM operaciones
        WHERE tienda = :t
    """

    with engine.connect() as conn:
        total = conn.execute(text(query), {"t": user["tienda"]}).scalar()

    return jsonify({"ok": True, "total": float(total or 0)})


# -------------------------------
#   API: HISTORIAL
# -------------------------------
@app.get("/api/historial")
def historial():
    user = auth(request)
    if not user:
        return jsonify({"ok": False}), 401

    query = """
        SELECT *
        FROM operaciones
        WHERE tienda = :t
        ORDER BY fecha DESC
    """

    with engine.connect() as conn:
        rows = conn.execute(text(query), {"t": user["tienda"]}).mappings().all()

    return jsonify({"ok": True, "operaciones": list(rows)})


# -------------------------------
#   RUN
# -------------------------------
@app.get("/api/health")
def health():
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
