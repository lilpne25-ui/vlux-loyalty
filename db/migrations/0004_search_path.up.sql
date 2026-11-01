-- Fija search_path de las funciones (recomendación del linter de seguridad de Supabase, 0011):
-- evita que una sesión con otro search_path las haga resolver objetos distintos.
ALTER FUNCTION set_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION forbid_mutation() SET search_path = pg_catalog, public;
ALTER FUNCTION current_business_id() SET search_path = pg_catalog, public;
