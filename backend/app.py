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
