-- Household invite codes: lets a household member generate a 6-character
-- code that another user redeems to join the same household.

ALTER TABLE households ADD COLUMN invite_code TEXT UNIQUE;

CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no O/0/I/1, avoids ambiguity
  code TEXT := '';
  i INT;
BEGIN
  FOR i IN 1..6 LOOP
    code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Returns the calling user's household, creating one (and an invite code)
-- on first call if they don't belong to one yet. SECURITY DEFINER so it can
-- create the household/membership rows without widening household_members
-- RLS to non-members.
CREATE OR REPLACE FUNCTION get_or_create_own_household()
RETURNS TABLE (id UUID, name TEXT, invite_code TEXT) AS $$
DECLARE
  target_household_id UUID;
BEGIN
  SELECT household_members.household_id INTO target_household_id
  FROM household_members
  WHERE household_members.user_id = auth.uid()
  LIMIT 1;

  IF target_household_id IS NULL THEN
    INSERT INTO households (name) VALUES ('המשק בית שלי')
    RETURNING households.id INTO target_household_id;

    INSERT INTO household_members (household_id, user_id, role)
    VALUES (target_household_id, auth.uid(), 'ADMIN');
  END IF;

  IF (SELECT households.invite_code FROM households WHERE households.id = target_household_id) IS NULL THEN
    UPDATE households SET invite_code = generate_invite_code() WHERE households.id = target_household_id;
  END IF;

  RETURN QUERY
  SELECT households.id, households.name, households.invite_code
  FROM households WHERE households.id = target_household_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Joins the calling user to the household identified by `code`.
CREATE OR REPLACE FUNCTION join_household_by_code(code TEXT)
RETURNS TABLE (id UUID, name TEXT) AS $$
DECLARE
  target_household_id UUID;
BEGIN
  SELECT households.id INTO target_household_id
  FROM households WHERE households.invite_code = upper(code);

  IF target_household_id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  INSERT INTO household_members (household_id, user_id, role)
  VALUES (target_household_id, auth.uid(), 'MEMBER')
  ON CONFLICT (household_id, user_id) DO NOTHING;

  RETURN QUERY
  SELECT households.id, households.name FROM households WHERE households.id = target_household_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_or_create_own_household() TO authenticated;
GRANT EXECUTE ON FUNCTION join_household_by_code(TEXT) TO authenticated;
