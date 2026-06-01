const axios = require("axios")
const FormData = require("form-data")

// ─────────────────────────────────────────────────────────────────────────────
// AUTENTICAR en el servicio de onboarding
// POST [BASE_URL]/api/authenticate
// Retorna: id_token (Bearer JWT, vigencia 20 min)
// ─────────────────────────────────────────────────────────────────────────────
async function authenticateOnboarding(baseUrl) {
  const url = (baseUrl || process.env.REQUEST_INFORMATION_BASE_URL || "")
    .replace(/\/+$/, "") + "/api/authenticate"

  console.log("ONBOARDING AUTH URL:", url)

  const response = await axios.post(
    url,
    {
      username: process.env.ONBOARDING_USERNAME,
      password: process.env.ONBOARDING_PASSWORD
    },
    {
      headers: { "Content-Type": "application/json" }
    }
  )

  const token = response.data?.id_token
  if (!token) throw new Error("No se obtuvo id_token del servicio de onboarding.")

  console.log("Token onboarding obtenido ✓")
  return token
}

// ─────────────────────────────────────────────────────────────────────────────
// CREAR SOLICITUD
// POST [BASE_URL]/api/request-information
// Retorna: { status, requestId, url, detail }
// ─────────────────────────────────────────────────────────────────────────────
async function submitRequestInformation(pdfBuffer, bearerToken, options = {}) {
  const requestBaseUrl = (
    options.baseUrl ||
    process.env.REQUEST_INFORMATION_BASE_URL ||
    ""
  ).replace(/\/+$/, "")

  if (!requestBaseUrl) throw new Error("REQUEST_INFORMATION_BASE_URL no está configurada.")
  if (!pdfBuffer)      throw new Error("PDF requerido para enviar request-information.")
  if (!bearerToken)    throw new Error("Bearer token requerido.")

  const requestUrl = requestBaseUrl + "/api/request-information"
  console.log("REQUEST-INFORMATION URL:", requestUrl)

  const form = new FormData()

  // Campos obligatorios del firmante
  form.append("nui",         options.nui)
  form.append("givenName",   options.givenName)
  form.append("secondName",  options.secondName)
  form.append("surname1",    options.surname1)
  form.append("surname2",    options.surname2)
  form.append("province",    options.province)
  form.append("city",        options.city)
  form.append("country",     options.country    || "EC")
  form.append("address",     options.address    || "")
  form.append("email",       options.email      || "")
  form.append("phoneNumber", options.phoneNumber || "")
  form.append("reason",      options.reason     || "Firma de contrato")

  // Opcionales
  if (options.typeSign)   form.append("typeSign",   options.typeSign)   // "acreditada" | "simple"
  if (options.nuiManager) form.append("nuiManager", options.nuiManager)
  if (options.clientCode) form.append("clientCode", options.clientCode)

  // Archivo principal 
  form.append("file", pdfBuffer, {
    filename: options.filename || "Certificado_Chat_Session_doc.pdf",
    contentType: "application/pdf"
  })

  // Evidencia biométrica 
  form.append("evidence-biometric", options.evidenceBuffer || pdfBuffer, {
    filename: options.evidenceFilename || "evidencia_biometrica.pdf",
    contentType: "application/pdf"
  })
  
  const response = await axios.post(requestUrl, form, {
    headers: {
      ...form.getHeaders(),
      Authorization: `Bearer ${bearerToken}`
    }
  })

  console.log("request-information response:", JSON.stringify(response.data))
  return response.data
}

// ─────────────────────────────────────────────────────────────────────────────
// EJECUTAR FIRMA
// POST [BASE_URL]/api/complete-sign
// Retorna: { result: true, detail: "Firma en proceso" }
// ─────────────────────────────────────────────────────────────────────────────
async function completeSign(requestId, bearerToken, options = {}) {
  const requestBaseUrl = (
    options.baseUrl ||
    process.env.REQUEST_INFORMATION_BASE_URL ||
    ""
  ).replace(/\/+$/, "")

  if (!requestBaseUrl) throw new Error("REQUEST_INFORMATION_BASE_URL no está configurada.")

  const completeSignUrl = requestBaseUrl + "/api/complete-sign"
  console.log("COMPLETE-SIGN URL:", completeSignUrl)

  const response = await axios.post(completeSignUrl, null, {
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      Cookie: `onb_request=${requestId}`,
      "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
      "X-Forwarded-For": options.clientIp || "127.0.0.1"
    }
  })

  console.log("complete-sign response:", JSON.stringify(response.data))
  return response.data
}

module.exports = {
  authenticateOnboarding,
  submitRequestInformation,
  completeSign
}
