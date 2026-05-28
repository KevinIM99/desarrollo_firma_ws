const axios = require("axios")
const FormData = require("form-data")

const EXTRA_DOCUMENT_PATH = "/api/extra-document"

/**
 * Obtiene el documento de evidencia biométrica (PDF) desde ID4FACE
 * usando la cédula del usuario una vez aprobada la biometría.
 *
 * Método: GET con form-data (según documentación ID4FACE)
 */
async function fetchExtraDocumentByCedula(cedula, options = {}) {
  if (!cedula) {
    throw new Error("La cédula es requerida para obtener el extradocumento.")
  }

  // Leer en cada llamada para evitar problemas de inicialización
  const BASE_URL = (
    process.env.EXTRA_DOCUMENT_BASE_URL || process.env.BASE_URL || "").trim()

  console.log("===== EXTRA DOCUMENT DEBUG =====")
  console.log("EXTRA_DOCUMENT_BASE_URL:", process.env.EXTRA_DOCUMENT_BASE_URL)
  console.log("BASE_URL efectiva:", BASE_URL)
  console.log("Cédula:", cedula)

  if (!BASE_URL) {
    throw new Error("EXTRA_DOCUMENT_BASE_URL no está configurada.")
  }

  const token = await generateToken()

  const form = new FormData()
  form.append("id", cedula)

  const url = BASE_URL.replace(/\/+$/, "") + EXTRA_DOCUMENT_PATH
  console.log("URL extradocument:", url)

  try {
    const response = await axios({
      method: "get",
      url,
      headers: {
        ...form.getHeaders(),
        ...(options.headers || {})
      },
      data: form,
      responseType: "arraybuffer"
    })

    console.log("extradocument status:", response.status)
    console.log("extradocument size (bytes):", response.data?.length)
    console.log("extradocument content-type:", response.headers?.["content-type"])

    return Buffer.from(response.data)
  } catch (error) {
    console.error("===== EXTRA DOCUMENT ERROR =====")
    console.error("MESSAGE:", error.message)
    if (error.response) {
      console.error("STATUS:", error.response.status)
      console.error("DATA:", error.response.data?.toString?.())
    }
    throw error
  }
}

module.exports = { fetchExtraDocumentByCedula }
