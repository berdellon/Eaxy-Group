import os
import time
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

# ------------------------------------------------------
# Configuración Inicial
# ------------------------------------------------------
app = Flask(__name__)
CORS(app)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///local.db")

# Normalización postgres:// → postgresql://
if DATABASE_URL.startswith("postgres://") and "sslmode" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://") + "?sslmode=require"

app.config["SQLALCHEMY_DATABASE_URI"] = DATABASE_URL
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)

# ------------------------------------------------------
# MODELOS
# ------------------------------------------------------
class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True)
    password = db.Column(db.String(80))
    is_admin = db.Column(db.Boolean, default=False)
    oficina = db.Column(db.String(40), default="Barcelona")  # BCN o MAD

class Operacion(db.Model):
    __tablename__ = "operaciones"
    id = db.Column(db.Integer, primary_key=True)
    tipo = db.Column(db.String(50))
    cantidad = db.Column(db.Float)
    estado = db.Column(db.String(50), default="pendiente")
    usuario = db.Column(db.String(80))
    oficina = db.Column(db.String(40))
    fecha = db.Column(db.DateTime, default=datetime.utcnow)

# ------------------------------------------------------
# CREACIÓN AUTOMÁTICA DE TABLAS + RETRY SI BD TARDA
# ------------------------------------------------------
def conectar_bd_con_reintentos(reintentos=10, espera=5):
    for intento in range(1, reintentos + 1):
        try:
            with app.app_context():
                db.create_all()
            print(f"✅ Base de datos conectada (intento {intento})")
            return True
        except Exception as e:
            print(f"⚠️ Intento {intento}: BD no disponible → {e}")
            time.sleep(espera)
    print("❌ No se pudo conectar a la BD después de varios intentos.")
    return False

conectar_bd_con_reintentos()

# ------------------------------------------------------
# ENDPOINTS
# ------------------------------------------------------

@app.route("/")
def root():
    return jsonify({"status": "ok", "message": "Eaxy Group Backend Running"}), 200

@app.route("/login", methods=["POST"])
def login():
    data = request.json
    user = User.query.filter_by(username=data.get("username")).first()

    if not user or user.password != data.get("password"):
        return jsonify({"error": "Usuario o contraseña incorrectos"}), 401

    return jsonify({
        "id": user.id,
        "username": user.username,
        "is_admin": user.is_admin,
        "oficina": user.oficina
    })

@app.route("/operaciones", methods=["POST"])
def crear_operacion():
    data = request.json
    nueva = Operacion(
        tipo=data["tipo"],
        cantidad=data["cantidad"],
        usuario=data["usuario"],
        oficina=data["oficina"]
    )
    db.session.add(nueva)
    db.session.commit()
    return jsonify({"success": True, "id": nueva.id})

@app.route("/operaciones/<oficina>", methods=["GET"])
def listar_operaciones(oficina):
    ops = Operacion.query.filter_by(oficina=oficina).order_by(Operacion.fecha.desc()).all()
    lista = [{
        "id": o.id,
        "tipo": o.tipo,
        "cantidad": o.cantidad,
        "estado": o.estado,
        "usuario": o.usuario,
        "fecha": o.fecha.isoformat()
    } for o in ops]
    return jsonify(lista)

@app.route("/operacion/estado", methods=["PUT"])
def cambiar_estado():
    data = request.json
    op = Operacion.query.get(data["id"])
    if not op:
        return jsonify({"error": "No existe"}), 404

    op.estado = data["estado"]
    db.session.commit()
    return jsonify({"success": True})

# ------------------------------------------------------
# MAIN LOCAL
# ------------------------------------------------------
if __name__ == "__main__":
    app.run(debug=True, port=5000)
