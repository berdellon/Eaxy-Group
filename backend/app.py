from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func
from sqlalchemy.exc import OperationalError
from dotenv import load_dotenv
import os, json, datetime, time

# Cargar variables de entorno
load_dotenv()

app = Flask(__name__)
CORS(app)

# Configuración de base de datos
DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///local.db')
app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'devkey')

db = SQLAlchemy(app)

# Modelos
class Usuario(db.Model):
    __tablename__ = 'usuarios'
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String, nullable=False)
    pin = db.Column(db.String, nullable=True)
    rol = db.Column(db.String, nullable=True)

class Operacion(db.Model):
    __tablename__ = 'operaciones'
    id = db.Column(db.Integer, primary_key=True)
    tipo = db.Column(db.String, nullable=False)
    cliente = db.Column(db.String, nullable=True)
    importe = db.Column(db.Float, nullable=False, default=0.0)
    moneda = db.Column(db.String, nullable=True, default='EUR')
    estado = db.Column(db.String, nullable=True, default='pendiente')
    descripcion = db.Column(db.String, nullable=True)
    fecha = db.Column(db.DateTime, default=func.now())
    usuario = db.Column(db.String, nullable=True)

class CajaFuerte(db.Model):
    __tablename__ = 'caja_fuerte'
    id = db.Column(db.Integer, primary_key=True)
    tipo = db.Column(db.String, nullable=True)
    importe = db.Column(db.Float, nullable=False, default=0.0)
    nota = db.Column(db.String, nullable=True)
    fecha = db.Column(db.DateTime, default=func.now())
    referencia_op = db.Column(db.Integer, nullable=True)

# Intentar conectar con la base de datos (reintentos automáticos)
for intento in range(5):
    try:
        with app.app_context():
            db.create_all()
        print("✅ Conectado a la base de datos y tablas creadas correctamente.")
        break
    except OperationalError as e:
        print(f"⚠️ Intento {intento + 1}: No se pudo conectar a la base de datos. Reintentando en 5s...")
        time.sleep(5)
else:
    print("❌ No se pudo conectar a la base de datos después de varios intentos.")

# Rutas
@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'time': datetime.datetime.utcnow().isoformat()})

@app.route('/api/login', methods=['POST'])
def login():
    body = request.get_json(force=True)
    user = Usuario.query.filter_by(nombre=body.get('nombre'), pin=body.get('pin')).first()
    if user:
        return jsonify({'status': 'ok', 'user': {'id': user.id, 'nombre': user.nombre, 'rol': user.rol}})
    return jsonify({'error': 'Credenciales inválidas'}), 401

@app.route('/api/operaciones', methods=['GET'])
def list_operaciones():
    ops = Operacion.query.order_by(Operacion.fecha.desc()).all()
    return jsonify([
        {
            'id': o.id, 'tipo': o.tipo, 'cliente': o.cliente, 'importe': o.importe,
            'moneda': o.moneda, 'estado': o.estado, 'descripcion': o.descripcion,
            'fecha': o.fecha.isoformat(), 'usuario': o.usuario
        } for o in ops
    ])

@app.route('/api/operaciones', methods=['POST'])
def crear_operacion():
    try:
        body = request.get_json(force=True)
        op = Operacion(
            tipo=body.get('tipo', ''),
            cliente=body.get('cliente'),
            importe=float(body.get('importe', 0) or 0),
            moneda=body.get('moneda', 'EUR'),
            estado=body.get('estado', 'pendiente'),
            descripcion=body.get('descripcion'),
            usuario=body.get('usuario')
        )
        db.session.add(op)
        db.session.commit()
        return jsonify({'status': 'ok', 'operacion': {'id': op.id}}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/operaciones/<int:oid>', methods=['PUT'])
def actualizar_operacion(oid):
    try:
        op = Operacion.query.get(oid)
        if not op:
            return jsonify({'error': 'Operación no encontrada'}), 404
        body = request.get_json(force=True)
        for k, v in body.items():
            if hasattr(op, k):
                setattr(op, k, v)
        db.session.commit()
        return jsonify({'status': 'ok'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/backup', methods=['GET'])
def export_backup():
    try:
        usuarios = Usuario.query.all()
        ops = Operacion.query.all()
        caja = CajaFuerte.query.all()
        data = {
            'usuarios': [{'id': u.id, 'nombre': u.nombre, 'rol': u.rol} for u in usuarios],
            'operaciones': [
                {'id': o.id, 'tipo': o.tipo, 'cliente': o.cliente, 'importe': o.importe,
                 'moneda': o.moneda, 'estado': o.estado, 'descripcion': o.descripcion,
                 'fecha': o.fecha.isoformat(), 'usuario': o.usuario}
                for o in ops
            ],
            'caja_fuerte': [
                {'id': c.id, 'tipo': c.tipo, 'importe': c.importe, 'nota': c.nota,
                 'fecha': c.fecha.isoformat(), 'referencia_op': c.referencia_op}
                for c in caja
            ]
        }
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
