# backend/app.py
import os, json, time, datetime
from pathlib import Path
from flask import Flask, jsonify, request, send_from_directory, send_file
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func
from sqlalchemy.exc import OperationalError
from dotenv import load_dotenv

# Cargar variables de entorno (.env si existe)
load_dotenv()

# --- CONFIGURACIÓN DE FLASK Y RUTAS FRONTEND ---
BASE_DIR = Path(__file__).resolve().parent.parent  # ruta raíz del proyecto
app = Flask(
    __name__,
    static_folder=str(BASE_DIR / "frontend" / "static"),
    template_folder=str(BASE_DIR / "frontend")
)
CORS(app)

# --- CONFIGURACIÓN DE LA BASE DE DATOS ---
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///local.db")

# Asegurar SSL (Render requiere ?sslmode=require)
if DATABASE_URL.startswith("postgres://") and "sslmode" not in DATABASE_URL:
    DATABASE_URL += "?sslmode=require"

app.config["SQLALCHEMY_DATABASE_URI"] = DATABASE_URL
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "devkey")

db = SQLAlchemy(app)

# --- MODELOS ---
class Usuario(db.Model):
    __tablename__ = "usuarios"
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String, nullable=False)
    pin = db.Column(db.String, nullable=True)
    rol = db.Column(db.String, nullable=True)

class Operacion(db.Model):
    __tablename__ = "operaciones"
    id = db.Column(db.Integer, primary_key=True)
    tipo = db.Column(db.String, nullable=False)
    cliente = db.Column(db.String, nullable=True)
    importe = db.Column(db.Float, nullable=False, default=0.0)
    moneda = db.Column(db.String, nullable=True, default="EUR")
    estado = db.Column(db.String, nullable=True, default="pendiente")
    descripcion = db.Column(db.String, nullable=True)
    fecha = db.Column(db.DateTime, default=func.now())
    usuario = db.Column(db.String, nullable=True)

class CajaFuerte(db.Model):
    __tablename__ = "caja_fuerte"
    id = db.Column(db.Integer, primary_key=True)
    tipo = db.Column(db.String, nullable=True)
    importe = db.Column(db.Float, nullable=False, default=0.0)
    nota = db.Column(db.String, nullable=True)
    fecha = db.Column(db.DateTime, default=func.now())
    referencia_op = db.Column(db.Integer, nullable=True)

# --- FUNCIÓN PARA CONECTAR Y CREAR TABLAS CON REINTENTOS ---
def init_db_with_retries(attempts=8, delay=5):
    for attempt in range(1, attempts + 1):
        try:
            with app.app_context():
                db.create_all()
            print(f"✅ Conectado a DB y tablas creadas (intento {attempt})")
            return True
        except OperationalError as e:
            print(f"⚠️ Intento {attempt}: no se pudo conectar a la DB ({e}). Reintentando en {delay}s...")
            time.sleep(delay)
    print("❌ No se pudo conectar a la base de datos tras varios intentos.")
    return False

init_db_with_retries()

# --- RUTAS API ---
@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "time": datetime.datetime.utcnow().isoformat()})

@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(force=True)
    user = Usuario.query.filter_by(nombre=data.get("nombre"), pin=data.get("pin")).first()
    if user:
        return jsonify({"status": "ok", "user": {"id": user.id, "nombre": user.nombre, "rol": user.rol}})
    return jsonify({"error": "invalid credentials"}), 401

@app.route("/api/operaciones", methods=["GET"])
def listar_operaciones():
    operaciones = Operacion.query.order_by(Operacion.fecha.desc()).all()
    return jsonify([
        {
            "id": o.id, "tipo": o.tipo, "cliente": o.cliente, "importe": o.importe,
            "moneda": o.moneda, "estado": o.estado, "descripcion": o.descripcion,
            "fecha": o.fecha.isoformat(), "usuario": o.usuario
        }
        for o in operaciones
    ])

@app.route("/api/operaciones", methods=["POST"])
def crear_operacion():
    try:
        data = request.get_json(force=True)
        op = Operacion(
            tipo=data.get("tipo", ""),
            cliente=data.get("cliente"),
            importe=float(data.get("importe", 0) or 0),
            moneda=data.get("moneda", "EUR"),
            estado=data.get("estado", "pendiente"),
            descripcion=data.get("descripcion"),
            usuario=data.get("usuario")
        )
        db.session.add(op)
        db.session.commit()
        return jsonify({"status": "ok", "operacion": {"id": op.id}}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@app.route("/api/backup", methods=["GET"])
def exportar_backup():
    try:
        usuarios = Usuario.query.all()
        operaciones = Operacion.query.all()
        caja = CajaFuerte.query.all()
        data = {
            "usuarios": [{"id": u.id, "nombre": u.nombre, "rol": u.rol} for u in usuarios],
            "operaciones": [
                {
                    "id": o.id, "tipo": o.tipo, "cliente": o.cliente, "importe": o.importe,
                    "moneda": o.moneda, "estado": o.estado, "descripcion": o.descripcion,
                    "fecha": o.fecha.isoformat(), "usuario": o.usuario
                }
                for o in operaciones
            ],
            "caja_fuerte": [
                {
                    "id": c.id, "tipo": c.tipo, "importe": c.importe,
                    "nota": c.nota, "fecha": c.fecha.isoformat(), "referencia_op": c.referencia_op
                }
                for c in caja
            ]
        }
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- SERVIR FRONTEND (React/Vue/HTML estático) ---
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    static_dir = app.static_folder
    full_path = Path(static_dir) / path
    if path and full_path.exists():
        return send_from_directory(static_dir, path)
    return send_file(Path(app.template_folder) / "index.html")

# --- EJECUCIÓN LOCAL ---
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5000)))
