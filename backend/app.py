
# backend/app.py
import os, time, datetime, json
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError

app = Flask(__name__)
CORS(app)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///local.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://")

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
            estado TEXT DEFAULT 'pendiente',
            usuario TEXT,
            oficina TEXT,
            fecha TIMESTAMP DEFAULT NOW()
        );
        """))
        conn.commit()

def seed_users():
    with engine.connect() as conn:
        r = conn.execute(text("SELECT COUNT(*) FROM users")).scalar()
        if r == 0:
            conn.execute(text("""
                INSERT INTO users (username, pin, role, tienda) VALUES
                ('Dani','1319','admin','Barcelona'),
                ('Camilo','3852','admin','Barcelona'),
                ('Madrid','1234','user','Madrid')
            """))
            conn.commit()

# try connect with retries
ready=False
for i in range(8):
    try:
        with engine.connect() as c:
            c.execute(text("SELECT 1"))
        ready=True
        break
    except OperationalError as e:
        print("DB not ready, retrying...", e)
        time.sleep(2)

if not ready:
    print("ERROR: DB not available")
else:
    create_tables()
    seed_users()
    print("DB ready")

# -------------------------------------------------
# Helper: row -> dict
def row_to_dict(row):
    if not row:
        return None
    return dict(row.items())

# -------------------------------------------------
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"ok": True})

# LOGIN: returns user info or 401
@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(force=True, silent=True) or {}
    username = data.get("username")
    pin = data.get("pin")
    if not username or not pin:
        return jsonify({"error":"missing username or pin"}), 400
    with engine.connect() as conn:
        r = conn.execute(text("SELECT id, username, role, tienda FROM users WHERE username=:u AND pin=:p"),
                         {"u":username, "p":pin}).fetchone()
    if not r:
        return jsonify({"ok": False, "message":"invalid credentials"}), 401
    user = row_to_dict(r)
    return jsonify({"ok": True, "user": user})

# CREATE operation
@app.route("/api/operaciones", methods=["POST"])
def create_operacion():
    data = request.get_json(force=True, silent=True) or {}
    tipo = data.get("tipo")
    cliente = data.get("cliente")
    importe = data.get("importe") or 0
    moneda = data.get("moneda") or "EUR"
    usuario = data.get("usuario") or "anon"
    oficina = data.get("oficina") or "Barcelona"
    estado = data.get("estado") or "pendiente"

    if not tipo:
        return jsonify({"error":"missing tipo"}), 400
    with engine.connect() as conn:
        res = conn.execute(text("""
            INSERT INTO operaciones (tipo, cliente, importe, moneda, estado, usuario, oficina)
            VALUES (:tipo, :cliente, :importe, :moneda, :estado, :usuario, :oficina)
            RETURNING id, fecha
        """), {"tipo":tipo, "cliente":cliente, "importe":importe, "moneda":moneda, "estado":estado, "usuario":usuario, "oficina":oficina})
        row = res.fetchone()
        conn.commit()
    out = {"success": True, "id": row.id, "fecha": row.fecha.isoformat()}
    return jsonify(out), 201

# LIST operations (by oficina optional or all)
@app.route("/api/operaciones", methods=["GET"])
def list_operaciones():
    oficina = request.args.get("oficina")
    try:
        if oficina:
            q = conn = engine.connect().execute(text("SELECT * FROM operaciones WHERE oficina=:o ORDER BY fecha DESC"), {"o":oficina})
        else:
            q = conn = engine.connect().execute(text("SELECT * FROM operaciones ORDER BY fecha DESC"))
        rows = [dict(r.items()) for r in q.fetchall()]
        # format fecha to iso
        for r in rows:
            if r.get("fecha"):
                r["fecha"] = r["fecha"].isoformat()
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# GET daily operations for date (optional fecha param YYYY-MM-DD)
@app.route("/api/operaciones/daily", methods=["GET"])
def daily_ops():
    fecha = request.args.get("fecha")
    if fecha:
        try:
            start = datetime.datetime.fromisoformat(fecha)
            end = start + datetime.timedelta(days=1)
            q = engine.connect().execute(text("SELECT * FROM operaciones WHERE fecha >= :s AND fecha < :e ORDER BY fecha DESC"), {"s":start, "e":end})
        except Exception as e:
            return jsonify({"error":"invalid fecha"}), 400
    else:
        # today in server timezone
        today = datetime.date.today()
        start = datetime.datetime.combine(today, datetime.time.min)
        end = start + datetime.timedelta(days=1)
        q = engine.connect().execute(text("SELECT * FROM operaciones WHERE fecha >= :s AND fecha < :e ORDER BY fecha DESC"), {"s":start, "e":end})
    rows = [dict(r.items()) for r in q.fetchall()]
    for r in rows:
        if r.get("fecha"):
            r["fecha"]=r["fecha"].isoformat()
    return jsonify(rows)

# UPDATE operation (edit fields or change estado)
@app.route("/api/operaciones/<int:opid>", methods=["PUT"])
def update_operacion(opid):
    data = request.get_json(force=True, silent=True) or {}
    # allowed fields
    fields = {}
    for f in ("tipo","cliente","importe","moneda","estado","usuario","oficina"):
        if f in data:
            fields[f]=data[f]
    if not fields:
        return jsonify({"error":"no fields to update"}), 400
    set_sql = ", ".join([f"{k}=:{k}" for k in fields.keys()])
    fields["id"]=opid
    try:
        with engine.connect() as conn:
            conn.execute(text(f"UPDATE operaciones SET {set_sql} WHERE id=:id"), fields)
            conn.commit()
        return jsonify({"success":True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# DELETE operation
@app.route("/api/operaciones/<int:opid>", methods=["DELETE"])
def delete_operacion(opid):
    try:
        with engine.connect() as conn:
            conn.execute(text("DELETE FROM operaciones WHERE id=:id"), {"id":opid})
            conn.commit()
        return jsonify({"success":True})
    except Exception as e:
        return jsonify({"error":str(e)}), 500

# BACKUP export (JSON)
@app.route("/api/backup", methods=["GET"])
def export_backup():
    try:
        q1 = engine.connect().execute(text("SELECT * FROM users"))
        q2 = engine.connect().execute(text("SELECT * FROM operaciones"))
        users = [dict(r.items()) for r in q1.fetchall()]
        ops = [dict(r.items()) for r in q2.fetchall()]
        for r in ops:
            if r.get("fecha"): r["fecha"]=r["fecha"].isoformat()
        data = {"users": users, "operaciones": ops}
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# simple health route for Render
@app.route("/", methods=["GET"])
def root_index():
    return jsonify({"status":"ok","message":"Eaxy backend"}), 200

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5000)))



