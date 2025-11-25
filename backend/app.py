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

# -------------------------------------------------------------------------------------
# DB INIT
# -------------------------------------------------------------------------------------

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

if ready:
    create_tables()
    insert_initial_users()
    print("BD lista ✔")
else:
    print("ERROR: No se pudo conectar a la DB.")


# -------------------------------------------------------------------------------------
# HELPERS
# -------------------------------------------------------------------------------------

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
        except:
            return jsonify({"error": "Invalid token"}), 401

        return f(*args, **kwargs)
    wrapper.__name__ = f.__name__
    return wrapper


# -------------------------------------------------------------------------------------
# LOGIN
# -------------------------------------------------------------------------------------

@app.post("/api/login")
def login():
    data = request.json
    u = data.get("username")
    p = data.get("pin")

    query = """
        SELECT id, role, tienda
        FROM users
        WHERE username = :u AND pin = :p
    """

    with engine.connect() as conn:
        result = conn.execute(text(query), {"u": u, "p": p}).fetchone()

    if not result:
        return jsonify({"ok": False, "msg": "Credenciales incorrectas"}), 401

    token = jwt.encode({
        "id": result.id,
        "role": result.role,
        "tienda": result.tienda,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=12)
    }, SECRET_KEY, algorithm="HS256")

    return jsonify({
        "ok": True,
        "token": token,
        "tienda": result.tienda,
        "role": result.role
    })


# -------------------------------------------------------------------------------------
# CREAR OPERACIÓN
# -------------------------------------------------------------------------------------

@app.post("/api/operaciones")
@auth_required
def crear_operacion():
    data = request.json

    tipo = data.get("tipo")
    cliente = data.get("cliente", "")
    importe = data.get("importe")
    moneda = data.get("moneda", "EUR")

    if not tipo or importe is None:
        return jsonify({"error": "Datos incompletos"}), 400

    tienda = request.user["tienda"]

    try:
        with engine.begin() as conn:   # <-- begin() fuerza commit automático
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

        return jsonify({"ok": True})

    except Exception as e:
        print("ERROR INSERT:", str(e))
        return jsonify({"ok": False, "error": str(e)}), 500



# -------------------------------------------------------------------------------------
# HISTORIAL
# -------------------------------------------------------------------------------------

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

    operaciones = [dict(row) for row in rows]   # ← FIX JSON

    return jsonify({"operaciones": operaciones})



# -------------------------------------------------------------------------------------
# CAJA FUERTE
# -------------------------------------------------------------------------------------

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
        if op.tipo in ("salida",):
            total -= float(op.importe)

    return jsonify({"total": round(total, 2)})


# -------------------------------------------------------------------------------------
# DAILY
# -------------------------------------------------------------------------------------

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
        rows = conn.execute(text(query), {"t": tienda, "f": fecha}).mappings().all()

    daily = [dict(row) for row in rows]   # ← FIX JSON

    return jsonify({"daily": daily})



# -------------------------------------------------------------------------------------
# BACKUP EXPORT
# -------------------------------------------------------------------------------------

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


# -------------------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return jsonify({"ok": True})


# -------------------------------------------------------------------------------------
# START
# -------------------------------------------------------------------------------------

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)

