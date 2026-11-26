ALTER TABLE users
  ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0;

UPDATE users
SET email_verified = 1;

CREATE TABLE pending_user_registrations (
  registration_id CHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  username VARCHAR(30) NOT NULL,
  email VARCHAR(150) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  otp_hash BINARY(64) NOT NULL,
  otp_salt BINARY(16) NOT NULL,
  otp_expires_at DATETIME NOT NULL,
  resend_after DATETIME NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (registration_id),
  UNIQUE KEY uq_pending_registration_email (email),
  UNIQUE KEY uq_pending_registration_username (username),
  KEY idx_pending_registration_expiry (otp_expires_at)
);
