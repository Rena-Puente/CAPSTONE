create or replace FUNCTION fn_hash_pw(p_plain IN VARCHAR2)
  RETURN VARCHAR2 DETERMINISTIC
AS
  v_raw RAW(32);
BEGIN
  v_raw := DBMS_CRYPTO.HASH(
            UTL_RAW.CAST_TO_RAW(p_plain),
            DBMS_CRYPTO.HASH_SH256
          );
  RETURN LOWER(RAWTOHEX(v_raw)); -- 64 chars hex
END;
