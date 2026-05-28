const axios = require("axios")
const FormData = require("form-data")
const { generateToken } = require("./id4face.service")

const EXTRA_DOCUMENT_PATH = "/api/extra-document"

async function fetchExtraDocumentByCedula(cedula, options = {}) {
  if (!cedula) {
    throw new Error("La cédula es requerida para obtener el extradocumento.")
  }

  const BASE_URL = (
    process.env.EXTRA_DOCUMENT_BASE_URL ||
    process.env.BASE_URL ||
    ""
  ).trim()

  if (!BASE_URL) {
    throw new Error("EXTRA_DOCUMENT_BASE_URL no está configurada.")
  }

  // 1. Declarar todo primero
  const token = await generateToken()
  const form = new FormData()
  const url = BASE_URL.replace(/\/+$/, "") + EXTRA_DOCUMENT_PATH

  form.append("id", cedula)

  // 2. Luego los logs (ya con url y form disponibles)
  console.log("===== EXTRA DOCUMENT DEBUG =====")
  console.log("URL:", url)
  console.log("TOKEN generado:", token ? token.substring(0, 20) + "..." : "VACÍO")

  try {
    const response = await axios({
      method: "get",
      url,
      headers: {
        ...form.getHeaders(),
        "Authorization": `Bearer ${token}`,  // ← este faltaba
        ...(options.headers || {})
      },
      data: form,
      responseType: "arraybuffer"
    })

    console.log("extradocument status:", response.status)
    console.log("extradocument size (bytes):", response.data?.length)

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