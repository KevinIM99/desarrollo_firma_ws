const express = require("express")
const router = express.Router()
const sessions = require("../utils/sessions")
const { evaluateBiometric } = require("../utils/biometricDecision.service")
const { fetchExtraDocumentByCedula } = require("../services/extraDocument.service")

const CALLBACK_TOKEN = process.env.CALLBACK_TOKEN

// ─── Recibir resultado biométrico del componente id4face ─────────────────
router.post("/callback", async (req, res) => {
  try {
    //const tokenHeader = req.get("x-callback-token")

    //if (!CALLBACK_TOKEN || tokenHeader !== CALLBACK_TOKEN) {
      //return res.status(401).json({ success: false, message: "No autorizado" })
    //}

    const { sessionId, result } = req.body
    const session = sessions[sessionId]

    if (!session) {
      return res.status(404).json({ success: false, message: "Sesión no encontrada" })
    }

    // Guardar resultado y evaluación
    session.result = result
    session.evaluation = evaluateBiometric(result)
    session.finishedAt = new Date()

    console.log(`Callback recibido — sessionId: ${sessionId} — decision: ${session.evaluation.decision}`)

    // Si está aprobado, obtener extradocument automáticamente
    if (session.evaluation.decision === "APPROVED") {
      try {
        console.log("Obteniendo extraDocument para cédula:", session.cedula)
        const extraDocumentBuffer = await fetchExtraDocumentByCedula(session.cedula)
        session.extraDocument = {
          id: session.cedula,
          buffer: extraDocumentBuffer,
          fetchedAt: new Date()
        }
        console.log("extraDocument obtenido ✓ size:", extraDocumentBuffer.length, "bytes")
      } catch (error) {
        console.error("Error obteniendo extraDocument:", error.message)
        session.extraDocument = {
          id: session.cedula,
          error: error.message
        }
      }
    }

    return res.json({ success: true })
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
})

module.exports = router
