-- RPC: update_property_flag
--
-- Allows inspectors to update has_car_park or has_lift on a property they manage.
-- Runs with SECURITY DEFINER so it bypasses the admin-only UPDATE RLS policy,
-- but validates flag name (against injection) and checks property access first.
-- Only 'has_car_park' and 'has_lift' are writable — no other columns.

CREATE OR REPLACE FUNCTION public.update_property_flag(
  p_property_id UUID,
  p_flag        TEXT,
  p_value       BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role     TEXT;
  v_manager_name  TEXT;
  v_prop_manager  TEXT;
BEGIN
  -- Whitelist: only these two flags are writable via this function
  IF p_flag NOT IN ('has_car_park', 'has_lift') THEN
    RAISE EXCEPTION 'Invalid flag: %', p_flag;
  END IF;

  -- Resolve caller identity
  SELECT role, full_name
    INTO v_user_role, v_manager_name
    FROM public.users
   WHERE id = auth.uid();

  IF v_user_role IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Resolve property's manager
  SELECT manager_name
    INTO v_prop_manager
    FROM public.properties
   WHERE id = p_property_id;

  IF v_prop_manager IS NULL THEN
    RAISE EXCEPTION 'Property not found';
  END IF;

  -- Access check: admins always, inspectors only for their own managed property
  IF v_user_role <> 'admin' AND v_manager_name <> v_prop_manager THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF p_flag = 'has_car_park' THEN
    UPDATE public.properties SET has_car_park = p_value WHERE id = p_property_id;
  ELSIF p_flag = 'has_lift' THEN
    UPDATE public.properties SET has_lift = p_value WHERE id = p_property_id;
  END IF;
END;
$$;

-- Grant execute to authenticated users (RLS check is inside the function)
GRANT EXECUTE ON FUNCTION public.update_property_flag(UUID, TEXT, BOOLEAN) TO authenticated;
