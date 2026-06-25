const express  = require("express")
const router   = express.Router()
const bcrypt   = require("bcrypt")
const multer   = require("multer")
const { query } = require("../services/db.service")
const adminMiddleware = require("../middleware/admin.middleware")

const upload = multer({ storage: multer.memoryStorage() })

// NOTA: adminMiddleware se aplica individualmente a cada ruta (no con router.use())
// para evitar que intercepte requests de otros routers montados después en server.js
// (ej. /start-verification de verification.routes.js)

// ── POST /admin/tenants — Crear cliente ───────────────────────────────────────
router.post("/admin/tenants", adminMiddleware, async (req, res) => {
  try {
    const {
      name, username, password,
      eclipsoft_user, eclipsoft_pass,
      eclipsoft_id4face_url, eclipsoft_oneshot_url,
      eclipsoft_pdf_builder_url, eclipsoft_extra_doc_url,
      eclipsoft_env
    } = req.body

    if (!name || !username || !password || !eclipsoft_user || !eclipsoft_pass) {
      return res.status(400).json({ success: false, message: "Faltan campos requeridos: name, username, password, eclipsoft_user, eclipsoft_pass" })
    }

    const password_hash = await bcrypt.hash(password, 10)

    const result = await query(
      `INSERT INTO tenants 
        (name, username, password_hash, eclipsoft_user, eclipsoft_pass,
         eclipsoft_id4face_url, eclipsoft_oneshot_url, eclipsoft_pdf_builder_url,
         eclipsoft_extra_doc_url, eclipsoft_env)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, username, password_hash, eclipsoft_user, eclipsoft_pass,
        eclipsoft_id4face_url     || "https://id4face.eclipsoft.com",
        eclipsoft_oneshot_url     || "https://oneshot.id4ec.com",
        eclipsoft_pdf_builder_url || "https://services.eclipsoft.com/pdf-builder",
        eclipsoft_extra_doc_url   || "https://services.id4.ec",
        eclipsoft_env             || "prod"
      ]
    )

    return res.status(201).json({
      success:  true,
      message:  "Tenant creado correctamente",
      tenantId: result.insertId
    })
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ success: false, message: "El username ya existe" })
    }
    console.error("Error creando tenant:", error.message)
    return res.status(500).json({ success: false, message: error.message })
  }
})

// ── GET /admin/tenants — Listar clientes ──────────────────────────────────────
router.get("/admin/tenants", adminMiddleware, async (req, res) => {
  try {
    const tenants = await query(
      `SELECT id, name, username, eclipsoft_user, eclipsoft_env,
              active, created_at
       FROM tenants ORDER BY created_at DESC`
    )
    return res.json({ success: true, tenants })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message })
  }
})

// ── GET /admin/tenants/:id — Ver cliente ──────────────────────────────────────
router.get("/admin/tenants/:id", adminMiddleware, async (req, res) => {
  try {
    const rows = await query(
      `SELECT id, name, username, eclipsoft_user, eclipsoft_env,
              eclipsoft_id4face_url, eclipsoft_oneshot_url,
              eclipsoft_pdf_builder_url, eclipsoft_extra_doc_url,
              active, created_at
       FROM tenants WHERE id = ?`,
      [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ success: false, message: "Tenant no encontrado" })
    return res.json({ success: true, tenant: rows[0] })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message })
  }
})

// ── PUT /admin/tenants/:id — Actualizar / activar / desactivar ────────────────
router.put("/admin/tenants/:id", adminMiddleware, async (req, res) => {
  try {
    const {
      name, password, eclipsoft_user, eclipsoft_pass,
      eclipsoft_id4face_url, eclipsoft_oneshot_url,
      eclipsoft_pdf_builder_url, eclipsoft_extra_doc_url,
      eclipsoft_env, active
    } = req.body

    let password_hash = undefined
    if (password) password_hash = await bcrypt.hash(password, 10)

    await query(
      `UPDATE tenants SET
        name                      = COALESCE(?, name),
        password_hash             = COALESCE(?, password_hash),
        eclipsoft_user            = COALESCE(?, eclipsoft_user),
        eclipsoft_pass            = COALESCE(?, eclipsoft_pass),
        eclipsoft_id4face_url     = COALESCE(?, eclipsoft_id4face_url),
        eclipsoft_oneshot_url     = COALESCE(?, eclipsoft_oneshot_url),
        eclipsoft_pdf_builder_url = COALESCE(?, eclipsoft_pdf_builder_url),
        eclipsoft_extra_doc_url   = COALESCE(?, eclipsoft_extra_doc_url),
        eclipsoft_env             = COALESCE(?, eclipsoft_env),
        active                    = COALESCE(?, active)
       WHERE id = ?`,
      [
        name || null, password_hash || null,
        eclipsoft_user || null, eclipsoft_pass || null,
        eclipsoft_id4face_url || null, eclipsoft_oneshot_url || null,
        eclipsoft_pdf_builder_url || null, eclipsoft_extra_doc_url || null,
        eclipsoft_env || null,
        active !== undefined ? active : null,
        req.params.id
      ]
    )

    return res.json({ success: true, message: "Tenant actualizado" })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message })
  }
})

// ── POST /admin/tenants/:id/document — Subir PDF del tenant ──────────────────
router.post("/admin/tenants/:id/document", adminMiddleware, upload.single("document"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Archivo PDF requerido (campo: document)" })
    }

    if (req.file.mimetype !== "application/pdf") {
      return res.status(400).json({ success: false, message: "Solo se aceptan archivos PDF" })
    }

    const tenantId = req.params.id

    // Verificar que el tenant existe
    const rows = await query("SELECT id FROM tenants WHERE id = ?", [tenantId])
    if (!rows.length) return res.status(404).json({ success: false, message: "Tenant no encontrado" })

    // Eliminar documento anterior si existe
    await query("DELETE FROM tenant_documents WHERE tenant_id = ?", [tenantId])

    // Guardar nuevo documento
    await query(
      "INSERT INTO tenant_documents (tenant_id, filename, file_data) VALUES (?, ?, ?)",
      [tenantId, req.file.originalname, req.file.buffer]
    )

    return res.json({
      success:  true,
      message:  "Documento subido correctamente",
      filename: req.file.originalname,
      size:     req.file.size
    })
  } catch (error) {
    console.error("Error subiendo documento:", error.message)
    return res.status(500).json({ success: false, message: error.message })
  }
})

// ── GET /admin/tenants/:id/logs — Ver logs del tenant ────────────────────────
router.get("/admin/tenants/:id/logs", adminMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query
    const offset = (parseInt(page) - 1) * parseInt(limit)

    const logs = await query(
      `SELECT * FROM logs WHERE tenant_id = ?
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [req.params.id, parseInt(limit), offset]
    )

    const total = await query(
      "SELECT COUNT(*) as count FROM logs WHERE tenant_id = ?",
      [req.params.id]
    )

    return res.json({
      success: true,
      logs,
      pagination: {
        page:  parseInt(page),
        limit: parseInt(limit),
        total: total[0].count
      }
    })
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message })
  }
})

module.exports = router