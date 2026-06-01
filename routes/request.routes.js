const express = require("express")
const router = express.Router()
const sessions = require("../utils/sessions")
const { fetchExtraDocumentByCedula } = require("../services/extraDocument.service")
const fs = require("fs")
const path = require("path")

const {
  authenticateOnboarding,
  submitRequestInformation,
  completeSign
} = require("../services/requestInformation.service")

// ─────────────────────────────────────────────────────────────────────────────
// 1. Resultado biométrico
// GET /result/:sessionId
// ─────────────────────────────────────────────────────────────────────────────
router.get("/result/:sessionId", (req, res) => {
  const session = sessions[req.params.sessionId]

  if (!session) {
    return res.status(404).json({ success: false, message: "Sesión no encontrada" })
  }

  return res.json({
    success: true,
    sessionId: req.params.sessionId,
    cedula: session.cedula,
    decision: session.evaluation?.decision       || null,
    similarity: session.evaluation?.similarity   || null,
    message: session.evaluation?.message         || null,
    finishedAt: session.finishedAt               || null,
    biometrics: session.result                   || null
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Estado del extraDocument
// GET /session-status/:sessionId
// ─────────────────────────────────────────────────────────────────────────────
router.get("/session-status/:sessionId", (req, res) => {
  const session = sessions[req.params.sessionId]

  if (!session) {
    return res.status(404).json({ success: false, message: "Sesión no encontrada" })
  }

  const buffer = session.extraDocument?.buffer

  return res.json({
    success: true,
    sessionId: req.params.sessionId,
    cedula: session.cedula,
    decision: session.evaluation?.decision || null,
    extraDocument: {
      exists: !!buffer,
      sizeBytes: buffer?.length || 0,
      isPDF: buffer ? buffer.slice(0, 4).toString() === "%PDF" : false,
      fetchedAt: session.extraDocument?.fetchedAt || null,
      error: session.extraDocument?.error || null
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Generar link de firma — flujo completo automático:
//    authenticate → request-information → complete-sign
// POST /onboarding-request/:sessionId
//
// Body (JSON):
//   nui, givenName, secondName, surname1, surname2,
//   province, city, country, address, email, phoneNumber,
//   reason (opcional), typeSign (opcional: "acreditada" | "simple")
// ─────────────────────────────────────────────────────────────────────────────
router.post("/onboarding-request/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params
    const session = sessions[sessionId]

    if (!session) {
      return res.status(404).json({ success: false, message: "Sesión no encontrada" })
    }

    if (!session.evaluation || session.evaluation.decision !== "APPROVED") {
      return res.status(400).json({
        success: false,
        message: "La sesión no está aprobada. Decision: " + (session.evaluation?.decision || "pendiente")
      })
    }

    // Validar campos requeridos
    const required = ["nui", "givenName", "secondName", "surname1", "surname2", "province", "city", "email", "phoneNumber"]
    for (const field of required) {
      if (!req.body[field]) {
        return res.status(400).json({ success: false, message: `Campo requerido: ${field}` })
      }
    }

    // Obtener extraDocument si no está disponible
    const contractPath = path.join(__dirname, "../assets/contrato.b64")
    if (!fs.existsSync(contractPath)) {
      return res.status(500).json({ success: false, message: "Archivo contrato.b64 no encontrado" })
    }
    const pdfBuffer = Buffer.from(fs.readFileSync(contractPath, "utf-8").trim(), "base64")
    console.log("Contrato fijo cargado, size:", pdfBuffer.length, "bytes")

    // ── Evidencia biométrica (extraDocument de la sesión)
    let evidenceBuffer = session.extraDocument?.buffer
    if (!evidenceBuffer) {
      console.log("ExtraDocument no disponible en sesión, obteniendo...")
      evidenceBuffer = await fetchExtraDocumentByCedula(session.cedula)
      session.extraDocument = { id: session.cedula, buffer: evidenceBuffer, fetchedAt: new Date() }
    }

    const baseUrl = process.env.REQUEST_INFORMATION_BASE_URL

    // PASO 1: Autenticar en onboarding
    console.log("=== PASO 1: Autenticando en onboarding ===")
    const bearerToken = await authenticateOnboarding(baseUrl)

    // PASO 2: Crear solicitud de firma
    console.log("=== PASO 2: Enviando request-information ===")
    const requestResponse = await submitRequestInformation(pdfBuffer, bearerToken, {
      baseUrl,
      nui:         req.body.nui,
      givenName:   req.body.givenName,
      secondName:  req.body.secondName,
      surname1:    req.body.surname1,
      surname2:    req.body.surname2,
      province:    req.body.province,
      city:        req.body.city,
      country:     req.body.country    || "EC",
      address:     req.body.address    || "",
      email:       req.body.email,
      phoneNumber: req.body.phoneNumber,
      reason:      req.body.reason     || "Firma de contrato",
      typeSign:    req.body.typeSign   || "acreditada",
      nuiManager:  req.body.nuiManager,
      clientCode:  req.body.clientCode,
      evidenceBuffer 
    })

    if (!requestResponse?.requestId) {
      return res.status(500).json({
        success: false,
        message: "No se obtuvo requestId del servicio de onboarding",
        detail: requestResponse
      })
    }

    session.requestId = requestResponse.requestId
    console.log("requestId obtenido:", requestResponse.requestId)

    // PASO 3: Ejecutar firma
    console.log("=== PASO 3: Ejecutando complete-sign ===")
    const signResponse = await completeSign(requestResponse.requestId, bearerToken, {
      baseUrl,
      clientIp: req.ip
    })

    return res.json({
      success: true,
      sessionId,
      requestId: requestResponse.requestId,
      onboardingUrl: requestResponse.url,
      detail: requestResponse.detail,
      sign: signResponse
    })

  } catch (error) {
    console.error("Error en onboarding-request:", error.message)
    if (error.response) {
      console.error("HTTP Status:", error.response.status)
      console.error("Response data:", JSON.stringify(error.response.data))
    }
    return res.status(500).json({
      success: false,
      message: error.message,
      detail: error.response?.data || null
    })
  }
})

module.exports = router
