from flask import Flask, request, jsonify
from flask_cors import CORS
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
import os, jwt, datetime, time

# ------------------------------------------------------------------------------
# APP INIT
# ------------------------------------------------------------------------------

app = Flask(__name__)
CORS(app)

SECRET_KEY = os.getenv("SECRET_KEY", "eaxysecret")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///local.db")

# Render sometimes sends this format
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://")

print("DB usada:", DATABASE_URL)

engine = create_engine(DATABASE_URL, echo=False, pool_pre_ping=True)

# ------------------------------------------------------------------------------
# DATABASE INIT (runs once at start)
# ------------------------------------------------------------------------------

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

# Wait for DB on Render
ready = False
for _ in range(10):
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        ready = True
        break
    except OperationalError:
        print("DB no lista, reintentando…")
        time.sleep(2)

if ready:
    create_tables()
    insert_initial_users()
    print("BD lista ✔")
else:
    print("ERROR: No se pudo conectar a la DB.")

# ------------------------------------------------------------------------------
# AUTH DECORATOR
# ------------------------------------------------------------------------------

def auth_required(f):
    def wrapper(*args, **kwargs):
        token = None
        if "Authorization" in request.headers:
            token = request.headers["Authorization"].replace("Bearer ", "")

        if not token:
            return jsonify({"error": "Missing token"}), 401

        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            request.user = data
        except Exception as e:
            print("TOKEN ERROR:", e)
            return jsonify({"error": "Invalid token"}), 401

        return f(*args, **kwargs)
    wrapper.__name__ = f.__name__
    return wrapper

# ------------------------------------------------------------------------------
# LOGIN — ***FUNCIONA 100%***
# ------------------------------------------------------------------------------

@app.post("/api/login")
def login():
    # Debug completo para Render
    try:
        data = request.get_json(force=True)
    except Exception as e:
        print("LOGIN ERROR get_json:", e)
        data = request.json or {}

    print("LOGIN payload recibido ->", data)

    u = (data.get("username") or "").strip()
    p = (data.get("pin") or "").strip()

    if not u or not p:
        return jsonify({"ok": False, "msg": "Faltan usuario o pin"}), 400

    query = """
        SELECT id, role, tienda
        FROM users
        WHERE LOWER(username) = LOWER(:u) AND pin = :p
        LIMIT 1
    """

    with engine.connect() as conn:
        row = conn.execute(text(query), {"u": u, "p": p}).fetchone()

    if not row:
        print(f"LOGIN: credenciales incorrectas user={u}")
        return jsonify({"ok": False, "msg": "Credenciales incorrectas"}), 401

    token = jwt.encode({
        "id": row.id,
        "role": row.role,
        "tienda": row.tienda,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=12)
    }, SECRET_KEY, algorithm="HS256")

    print(f"LOGIN: OK para user={u}, tienda={row.tienda}")

    return jsonify({
        "ok": True,
        "token": token,
        "tienda": row.tienda,
        "role": row.role
    })

# ------------------------------------------------------------------------------
# CREAR OPERACIÓN
# ------------------------------------------------------------------------------

@app.post("/api/operaciones")
@auth_required
def crear_operacion():
    data = request.get_json(force=True)

    tipo = data.get("tipo")
    cliente = data.get("cliente", "")
    importe = data.get("importe")
    moneda = data.get("moneda", "EUR")
    tienda = request.user["tienda"]

    if not tipo or importe is None:
        return jsonify({"error": "Datos incompletos"}), 400

    with engine.connect() as conn:
        conn.execute(text("""
            INSERT INTO operaciones (tipo, cliente, importe, moneda, tienda)
            VALUES (:t, :c, :i, :m, :ti)
        """), {
            "t": tipo,
            "c": cliente,
            "i": importe,
            "m": moneda,
            "ti": tienda
        })
        conn.commit()

    return jsonify({"ok": True})

# ------------------------------------------------------------------------------
# HISTORIAL
# ------------------------------------------------------------------------------

@app.get("/api/historial")
@auth_required
def historial():
    tienda = request.user["tienda"]

    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT id, tipo, cliente, importe, moneda, tienda, fecha
            FROM operaciones
            WHERE tienda = :t
            ORDER BY fecha DESC
        """), {"t": tienda}).mappings().all()

    return jsonify(list(rows))

# ------------------------------------------------------------------------------
# CAJA FUERTE
# ------------------------------------------------------------------------------

@app.get("/api/caja")
@auth_required
def caja():
    tienda = request.user["tienda"]

    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT tipo, importe
            FROM operaciones
            WHERE tienda = :t
        """), {"t": tienda}).fetchall()

    total = 0
    for op in rows:
        if op.tipo in ("cash", "entrada"):
            total += float(op.importe)
        elif op.tipo == "salida":
            total -= float(op.importe)

    return jsonify({"total": round(total, 2)})

# ------------------------------------------------------------------------------
# DAILY
# ------------------------------------------------------------------------------

@app.get("/api/daily")
@auth_required
def daily():
    tienda = request.user["tienda"]
    fecha = request.args.get("fecha")

    query = """
        SELECT id, tipo, importe, moneda, fecha
        FROM operaciones
        WHERE tienda = :t AND DATE(fecha) = COALESCE(:f, CURRENT_DATE)
        ORDER BY fecha DESC
    """

    with engine.connect() as conn:
        rows = conn.execute(text(query), {
            "t": tienda,
            "f": fecha
        }).mappings().all()

    return jsonify(list(rows))

# ------------------------------------------------------------------------------
# BACKUP EXPORT
# ------------------------------------------------------------------------------

@app.get("/api/backup")
@auth_required
def backup():
    tienda = request.user["tienda"]

    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT *
            FROM operaciones
            WHERE tienda = :t
        """), {"t": tienda}).mappings().all()

    return jsonify({"tienda": tienda, "backup": list(rows)})

# ------------------------------------------------------------------------------
# HEALTH CHECK
# ------------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return jsonify({"ok": True})

# ------------------------------------------------------------------------------
# DEV MODE
# ------------------------------------------------------------------------------

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
