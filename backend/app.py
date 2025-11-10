from flask import Flask, request, jsonify, send_file, current_app
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func
from dotenv import load_dotenv
import os, io, json, zipfile, datetime

load_dotenv()
app = Flask(__name__)
CORS(app)

# Configuration
DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///local.db')
app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'devkey')

db = SQLAlchemy(app)

# Models
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

# Initialize DB (create tables)
# Crear tablas al iniciar (Flask 3.1+)
with app.app_context():
    db.create_all()


# Simple health check
@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status':'ok','time': datetime.datetime.utcnow().isoformat()})

# Login endpoint example (very basic, for demo)
@app.route('/api/login', methods=['POST'])
def login():
    body = request.get_json(force=True)
    nombre = body.get('nombre')
    pin = body.get('pin')
    user = Usuario.query.filter_by(nombre=nombre, pin=pin).first()
    if user:
        return jsonify({'status':'ok','user':{'id':user.id,'nombre':user.nombre,'rol':user.rol}})
    else:
        return jsonify({'error':'invalid credentials'}), 401

# Get operaciones
@app.route('/api/operaciones', methods=['GET'])
def list_operaciones():
    ops = Operacion.query.order_by(Operacion.fecha.desc()).all()
    out = []
    for o in ops:
        out.append({
            'id': o.id, 'tipo': o.tipo, 'cliente': o.cliente, 'importe': o.importe,
            'moneda': o.moneda, 'estado': o.estado, 'descripcion': o.descripcion,
            'fecha': o.fecha.isoformat(), 'usuario': o.usuario
        })
    return jsonify(out)

# Create operacion
@app.route('/api/operaciones', methods=['POST'])
def crear_operacion():
    try:
        body = request.get_json(force=True)
        op = Operacion(
            tipo = body.get('tipo',''),
            cliente = body.get('cliente'),
            importe = float(body.get('importe',0) or 0),
            moneda = body.get('moneda','EUR'),
            estado = body.get('estado','pendiente'),
            descripcion = body.get('descripcion'),
            usuario = body.get('usuario')
        )
        db.session.add(op)
        db.session.commit()
        return jsonify({'status':'ok','operacion':{'id':op.id}}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error':str(e)}), 500

# Update operacion
@app.route('/api/operaciones/<int:oid>', methods=['PUT'])
def actualizar_operacion(oid):
    try:
        body = request.get_json(force=True)
        op = Operacion.query.get(oid)
        if not op:
            return jsonify({'error':'not found'}), 404
        for k,v in body.items():
            if hasattr(op, k):
                setattr(op, k, v)
        db.session.commit()
        return jsonify({'status':'ok'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error':str(e)}), 500

# Backup endpoint: export all data as JSON (and as zip)
@app.route('/api/backup', methods=['GET'])
def export_backup():
    try:
        usuarios = Usuario.query.all()
        ops = Operacion.query.all()
        caja = CajaFuerte.query.all()
        data = {
            'usuarios':[{'id':u.id,'nombre':u.nombre,'rol':u.rol} for u in usuarios],
            'operaciones':[{'id':o.id,'tipo':o.tipo,'cliente':o.cliente,'importe':o.importe,'moneda':o.moneda,'estado':o.estado,'descripcion':o.descripcion,'fecha':o.fecha.isoformat(),'usuario':o.usuario} for o in ops],
            'caja_fuerte':[{'id':c.id,'tipo':c.tipo,'importe':c.importe,'nota':c.nota,'fecha':c.fecha.isoformat(),'referencia_op':c.referencia_op} for c in caja]
        }
        # return JSON directly
        return jsonify(data)
    except Exception as e:
        return jsonify({'error':str(e)}), 500

if __name__ == '__main__':
    # Run development server
    app.run(host='0.0.0.0', port=5000, debug=True)
