ALTER TABLE users
  ADD COLUMN username VARCHAR(30) NULL,
  ADD UNIQUE KEY uq_users_username (username);
