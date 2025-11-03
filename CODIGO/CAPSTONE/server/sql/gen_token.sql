create or replace FUNCTION gen_token(p_len IN PLS_INTEGER DEFAULT 64)
RETURN VARCHAR2
IS
BEGIN
  -- alfanumérico; cambia a 'a' si quieres solo letras, 'p' si quieres printable
  RETURN DBMS_RANDOM.STRING('x', p_len);
END;
