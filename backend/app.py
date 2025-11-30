from flask import Flask, request, jsonify
from flask_cors import CORS
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
import os, jwt, datetime, time

app = Flask(__name__)
CORS(app)

SECRET_KEY = os.getenv("SECRET_KEY", "eaxysecret")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///local.db")

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
    data = request.json or {}
    u = (data.get("username") or "").strip()
    p = (data.get("pin") or "").strip()

    # Comparación robusta (insensible a mayúsculas en usuario)
    query = """
        SELECT id, role, tienda
        FROM users
        WHERE LOWER(username) = LOWER(:u) AND pin = :p
        LIMIT 1
    """

    with engine.connect() as conn:
        row = conn.execute(text(query), {"u": u, "p": p}).fetchone()

    if not row:
        return jsonify({"ok": False, "msg": "Credenciales incorrectas"}), 401

    token = jwt.encode({
        "id": row.id,
        "role": row.role,
        "tienda": row.tienda,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=12)
    }, SECRET_KEY, algorithm="HS256")

    return jsonify({"ok": True, "token": token, "role": row.role, "tienda": row.tienda})


@app.post("/api/operaciones")
def crear_operacion():
    auth = request.headers.get("Authorization","").replace("Bearer ","")
    try:
        user = jwt.decode(auth, SECRET_KEY, algorithms=["HS256"])
    except:
        return jsonify({"error":"No autorizado"}),401

    data = request.json or {}
    tipo = data.get("tipo")
    cliente = data.get("cliente","")
    importe = data.get("importe")
    moneda = data.get("moneda","EUR")
    tienda = user.get("tienda","Barcelona")

    if not tipo or importe is None:
        return jsonify({"error":"Datos incompletos"}),400

    with engine.connect() as conn:
        conn.execute(text("""
            INSERT INTO operaciones (tipo, cliente, importe, moneda, tienda)
            VALUES (:t,:c,:i,:m,:ti)
        """), {"t": tipo, "c": cliente, "i": importe, "m": moneda, "ti": tienda})
        conn.commit()

    return jsonify({"ok": True})


@app.get("/api/historial")
def historial():
    auth = request.headers.get("Authorization","").replace("Bearer ","")
    try:
        user = jwt.decode(auth, SECRET_KEY, algorithms=["HS256"])
    except:
        return jsonify({"error":"No autorizado"}),401

    tienda = user.get("tienda","Barcelona")
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT id, tipo, cliente, importe, moneda, tienda, fecha
            FROM operaciones
            WHERE tienda = :t
            ORDER BY fecha DESC
        """), {"t": tienda}).mappings().all()

    # convertir RowMappings a dicts serializables
    ops = [dict(r) for r in rows]
    # formatear fechas a string ISO si vienen como datetime
    for o in ops:
        if isinstance(o.get("fecha"), (datetime.datetime,)):
            o["fecha"] = o["fecha"].isoformat()
    return jsonify({"operaciones": ops})


@app.get("/api/caja")
def caja():
    auth = request.headers.get("Authorization","").replace("Bearer ","")
    try:
        user = jwt.decode(auth, SECRET_KEY, algorithms=["HS256"])
    except:
        return jsonify({"error":"No autorizado"}),401

    tienda = user.get("tienda","Barcelona")
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT tipo, importe
            FROM operaciones
            WHERE tienda = :t
        """), {"t": tienda}).fetchall()

    total = 0.0
    for op in rows:
        t = op[0]
        imp = float(op[1] or 0)
        if t in ("cash","entrada"):
            total += imp
        elif t in ("salida",):
            total -= imp
    return jsonify({"total": round(total,2)})


@app.get("/api/daily")
def daily():
    auth = request.headers.get("Authorization","").replace("Bearer ","")
    try:
        user = jwt.decode(auth, SECRET_KEY, algorithms=["HS256"])
    except:
        return jsonify({"error":"No autorizado"}),401

    tienda = user.get("tienda","Barcelona")
    fecha = request.args.get("fecha")  # formato YYYY-MM-DD
    query = """
        SELECT id, tipo, cliente, importe, moneda, fecha
        FROM operaciones
        WHERE tienda = :t
        """ + (" AND DATE(fecha) = :f" if fecha else "") + " ORDER BY fecha DESC"

    with engine.connect() as conn:
        rows = conn.execute(text(query), {"t": tienda, "f": fecha} if fecha else {"t": tienda}).mappings().all()

    ops = [dict(r) for r in rows]
    for o in ops:
        if isinstance(o.get("fecha"), (datetime.datetime,)):
            o["fecha"] = o["fecha"].isoformat()
    return jsonify({"daily": ops})


@app.get("/api/backup")
def backup():
    auth = request.headers.get("Authorization","").replace("Bearer ","")
    try:
        user = jwt.decode(auth, SECRET_KEY, algorithms=["HS256"])
    except:
        return jsonify({"error":"No autorizado"}),401

    tienda = user.get("tienda","Barcelona")
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT * FROM operaciones WHERE tienda = :t"), {"t": tienda}).mappings().all()
    return jsonify({"tienda": tienda, "backup": [dict(r) for r in rows]})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
