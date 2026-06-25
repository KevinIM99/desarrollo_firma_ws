const express  = require("express")
const router   = express.Router()
const { v4: uuid } = require("uuid")
const { query }    = require("../services/db.service")
const { generateToken } = require("../services/id4face.service")
const authMiddleware    = require("../middleware/auth.middleware")
const { upsertLog }    = require("../services/log.service")

// ─── POST /start-verification ─────────────────────────────────────────────────
router.post("/start-verification", authMiddleware, async (req, res) => {
  console.log(">>> verification.routes.js CARGADO")
  try {
    const { cedula, dactilar } = req.body
    const tenant = req.tenant

    if (!cedula || !dactilar) {
      return res.status(400).json({ success: false, message: "cedula y dactilar son requeridos" })
    }

    // Obtener datos completos del tenant (credenciales Eclipsoft)
    const rows = await query("SELECT * FROM tenants WHERE id = ?", [tenant.id])
    if (!rows.length) return res.status(404).json({ success: false, message: "Tenant no encontrado" })
    const tenantData = rows[0]

    const token     = await generateToken(tenantData)
    const sessionId = uuid()

    // Guardar sesión en MySQL
    await query(
      "INSERT INTO sessions (tenant_id, session_uuid, cedula, dactilar, status) VALUES (?, ?, ?, ?, 'PENDING')",
      [tenant.id, sessionId, cedula, dactilar]
    )

    // Log inicial
    await upsertLog(tenant.id, sessionId, {
      signer_cedula: cedula,
      step:          "START",
      ip_address:    req.ip
    })

    // Guardar en memoria para el componente web
    req.app.locals.sessions = req.app.locals.sessions || {}
    req.app.locals.sessions[sessionId] = {
      cedula,
      dactilar,
      token,
      tenantId:   tenant.id,
      tenantData,
      createdAt:  new Date()
    }

    const verificationUrl = `${process.env.SELF_URL}/verify/${sessionId}`

    return res.json({ success: true, sessionId, url: verificationUrl })
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
})

// ─── GET /verify/:sessionId — Página HTML biométrica ─────────────────────────
router.get("/verify/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params
    const sessions = req.app.locals.sessions || {}
    const session  = sessions[sessionId]

    if (!session) return res.status(404).send("Sesión no encontrada o expirada")

    const LOGO_BASE64 = process.env.LOGO_BASE64 || ""

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Validación Biométrica</title>
  <script src="https://id4face.eclipsoft.com/dist/id4face@2.4.0.js" defer></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: #f5f5f5; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .container { max-width: 500px; width: 100%; background: white; padding: 32px 24px; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.1); text-align: center; }
    h2 { color: #111827; margin-bottom: 8px; font-size: 1.4rem; }
    #status { color: #6b7280; font-size: 0.9rem; margin-bottom: 24px; }
    eclipsoft-id4face { display: block; }
  </style>
</head>
<body>
  <div class="container">
    ${LOGO_BASE64 ? `<img src="data:image/png;base64,${LOGO_BASE64}" style="width:60px;margin-bottom:16px;" alt="Logo"/>` : ""}
    <h2>Validación Biométrica</h2>
    <p id="status">Inicializando...</p>
    <eclipsoft-id4face dismissable oval limits></eclipsoft-id4face>
  </div>
  <script>
    const WHATSAPP_RETURN_URL = "https://wa.me/${process.env.WHATSAPP_NUMBER}"
    const LOGO_BASE64 = "${LOGO_BASE64}"

    window.addEventListener("load", async () => {
      const id4face = document.querySelector("eclipsoft-id4face")
      const status  = document.getElementById("status")

      id4face.token = "${session.token}"

      const config = {
        camera: "front", minMatch: "98", blink: true,
        env: "${session.tenantData?.eclipsoft_env || process.env.ID4FACE_ENV || "prod"}",
        faceRecognition: true,
        callbackUrl: "${process.env.SELF_URL}/callback",
        checkId: { id: "${session.cedula}", dactilar: "${session.dactilar}" }
      }

      try {
        status.textContent = "Inicializando biometría..."
        await id4face.load(config)
        status.textContent = "Por favor mire a la cámara"
        try { await id4face.start() } catch (e) { console.warn("start() directo falló:", e) }
        id4face.addEventListener("ready", () => {
          status.textContent = "Por favor mire a la cámara"
          try { id4face.start() } catch (e) { console.error(e) }
        })
      } catch (error) {
        console.error(error)
        status.textContent = "Error iniciando biometría: " + error.message
      }

      id4face.addEventListener("result", async (event) => {
        status.textContent = "Procesando resultado..."
        try {
          const response = await fetch("${process.env.SELF_URL}/callback", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-callback-token": "${process.env.CALLBACK_TOKEN}" },
            body: JSON.stringify({ sessionId: "${sessionId}", result: event.detail })
          })
          if (response.ok) {
            document.querySelector("eclipsoft-id4face").style.display = "none"
            const logoHtml = LOGO_BASE64 ? '<img src="data:image/png;base64,' + LOGO_BASE64 + '" style="width:60px;margin-bottom:16px;" alt="Logo"/>' : ""
            document.querySelector(".container").innerHTML =
              logoHtml +
              '<div style="font-size:3.5rem;margin-bottom:12px">✅</div>' +
              '<h2 style="color:#f59e0b;margin-bottom:12px">¡Validación exitosa!</h2>' +
              '<p style="color:#6b7280;margin-bottom:24px;font-size:0.95rem">Tu identidad ha sido verificada correctamente.</p>' +
              '<p style="color:#9ca3af;font-size:0.85rem;margin-bottom:20px">Regresando a WhatsApp en unos segundos...</p>' +
              '<a href="' + WHATSAPP_RETURN_URL + '" style="display:inline-block;background:#f59e0b;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Volver a WhatsApp</a>'
            setTimeout(() => { window.location.href = WHATSAPP_RETURN_URL }, 3000)
          } else {
            status.textContent = "Error procesando resultado."
          }
        } catch (err) {
          console.error(err)
          status.textContent = "Error enviando resultado."
        }
      })

      id4face.addEventListener("failed", (event) => {
        status.textContent = "❌ Validación fallida: " + (event.detail?.message || "intente de nuevo")
      })
    })
  </script>
</body>
</html>`

    res.send(html)
  } catch (error) {
    return res.status(500).send("Error interno: " + error.message)
  }
})

module.exports = router