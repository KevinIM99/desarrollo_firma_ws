-- ─────────────────────────────────────────────────────────────────────────────
-- BIMETRIA PLATFORM — SCHEMA
-- ─────────────────────────────────────────────────────────────────────────────

CREATE DATABASE IF NOT EXISTS bimetria CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE bimetria;

-- ── Tenants (clientes de la plataforma) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id                        INT AUTO_INCREMENT PRIMARY KEY,
  name                      VARCHAR(255)  NOT NULL,
  username                  VARCHAR(100)  NOT NULL UNIQUE,
  password_hash             VARCHAR(255)  NOT NULL,

  -- Credenciales Eclipsoft propias del cliente
  eclipsoft_user            VARCHAR(100)  NOT NULL,
  eclipsoft_pass            VARCHAR(255)  NOT NULL,
  eclipsoft_id4face_url     VARCHAR(255)  NOT NULL DEFAULT 'https://id4face.eclipsoft.com',
  eclipsoft_oneshot_url     VARCHAR(255)  NOT NULL DEFAULT 'https://oneshot.id4ec.com',
  eclipsoft_pdf_builder_url VARCHAR(255)  NOT NULL DEFAULT 'https://services.eclipsoft.com/pdf-builder',
  eclipsoft_extra_doc_url   VARCHAR(255)  NOT NULL DEFAULT 'https://services.id4.ec',
  eclipsoft_env             VARCHAR(10)   NOT NULL DEFAULT 'prod',
  logo_base64               MEDIUMTEXT    NULL DEFAULT NULL,

  active                    TINYINT(1)    NOT NULL DEFAULT 1,
  created_at                DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ── Documentos PDF por tenant ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_documents (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id   INT           NOT NULL,
  filename    VARCHAR(255)  NOT NULL,
  file_data   LONGBLOB      NOT NULL,
  uploaded_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ── Sesiones biométricas ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id    INT          NOT NULL,
  session_uuid VARCHAR(36)  NOT NULL UNIQUE,
  cedula       VARCHAR(20)  NOT NULL,
  dactilar     VARCHAR(20)  NOT NULL,
  status       ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ── Logs por sesión ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS logs (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id        INT           NOT NULL,
  session_uuid     VARCHAR(36)   NOT NULL,

  -- Datos del firmante
  signer_name      VARCHAR(255)  NULL,
  signer_cedula    VARCHAR(20)   NULL,
  signer_email     VARCHAR(255)  NULL,

  -- Resultado biométrico
  biometric_result VARCHAR(20)   NULL,
  similarity       DECIMAL(5,2)  NULL,

  -- Resultado firma
  signed_doc_url   TEXT          NULL,
  sign_uuid        VARCHAR(100)  NULL,

  -- Control de errores
  step             VARCHAR(100)  NULL,
  error_message    TEXT          NULL,

  -- Metadata
  ip_address       VARCHAR(45)   NULL,
  duration_ms      INT           NULL,

  created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ── Índices para consultas frecuentes ────────────────────────────────────────
CREATE INDEX idx_logs_tenant     ON logs(tenant_id);
CREATE INDEX idx_logs_session    ON logs(session_uuid);
CREATE INDEX idx_logs_cedula     ON logs(signer_cedula);
CREATE INDEX idx_sessions_tenant ON sessions(tenant_id);
CREATE INDEX idx_sessions_uuid   ON sessions(session_uuid);

ALTER TABLE tenants
  ADD COLUMN logo_base64 MEDIUMTEXT NULL DEFAULT NULL
  AFTER eclipsoft_env;