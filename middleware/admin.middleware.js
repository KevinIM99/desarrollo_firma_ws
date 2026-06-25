function adminMiddleware(req, res, next) {
  console.log(">>> ADMIN MIDDLEWARE EJECUTADO para:", req.method, req.originalUrl)
  console.trace(">>> STACK TRACE")
  const authHeader = req.headers["authorization"]
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Token admin requerido" })
  }

  const token = authHeader.split(" ")[1]
  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({ success: false, message: "Token admin inválido" })
  }

  next()
}

module.exports = adminMiddleware