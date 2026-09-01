exports.up = (pgm) => {
  pgm.sql(`
  -- Revoke privileges from 'public' role
  REVOKE CREATE ON SCHEMA public FROM PUBLIC;
  REVOKE ALL ON DATABASE yields FROM PUBLIC;
  
  -- Read-only role
  CREATE ROLE readonly;
  GRANT CONNECT ON DATABASE yields TO readonly;
  GRANT USAGE ON SCHEMA public TO readonly;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO readonly;
  
  -- Read/write role
  CREATE ROLE readwrite;
  GRANT CONNECT ON DATABASE yields TO readwrite;
  GRANT USAGE ON SCHEMA public TO readwrite;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO readwrite;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO readwrite;
  GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO readwrite;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO readwrite;
  `);
};
