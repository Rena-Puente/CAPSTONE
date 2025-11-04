create or replace FUNCTION fn_hash_pw_salted(
  p_plain IN VARCHAR2,
  p_salt  IN VARCHAR2,
  p_iters IN NUMBER
) RETURN VARCHAR2 AS
  v_in VARCHAR2(32767);
  v_out VARCHAR2(64);
BEGIN
  v_in := p_plain || ':' || p_salt;
  v_out := fn_hash_pw(v_in); -- primera
  FOR i IN 2 .. p_iters LOOP
    v_out := fn_hash_pw(v_out || ':' || p_salt);
  END LOOP;
  RETURN v_out; -- 64 hex
END;
