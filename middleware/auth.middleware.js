const jwt   = require("jsonwebtoken")
const { query } = require("../services/db.service")

async function authMiddleware(req, res, next) {
  console.log(">>> ADMIN MIDDLEWARE EJECUTADO para:", req.method, req.originalUrl)
  console.trace(">>> STACK TRACE")
  try {
    const authHeader = req.headers["authorization"]
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Token requerido" })
    }

    const token = authHeader.split(" ")[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    // Verificar que el tenant sigue activo
    const rows = await query(
      "SELECT id, name, username, active FROM tenants WHERE id = ?",
      [decoded.tenantId]
    )

    if (!rows.length || !rows[0].active) {
      return res.status(401).json({ success: false, message: "Tenant inactivo o no encontrado" })
    }

    req.tenant = {
      id:       rows[0].id,
      name:     rows[0].name,
      username: rows[0].username
    }

    next()
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ success: false, message: "Token expirado" })
    }
    return res.status(401).json({ success: false, message: "Token inválido" })
  }
}

module.exports = authMiddleware