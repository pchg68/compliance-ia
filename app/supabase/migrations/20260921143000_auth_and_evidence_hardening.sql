-- Harden authentication binding, cross-tenant integrity and dashboard approval metrics

-- ============================================================
-- 1. app_user auth binding: one Supabase auth user -> one app_user
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_user_auth_id_unique
  ON app_user(auth_id)
  WHERE auth_id IS NOT NULL;

-- Resolve the authenticated app user by auth_id first, then safely claim a
-- unique pending invite by e-mail when there is exactly one candidate row.
CREATE OR REPLACE FUNCTION resolve_app_user(p_auth_id uuid, p_email citext)
RETURNS TABLE (user_id uuid, org_id uuid, role text, email citext) AS $$
DECLARE
  v_matches int;
BEGIN
  IF p_auth_id IS NOT NULL THEN
    RETURN QUERY
    SELECT id, app_user.org_id, app_user.role, app_user.email
    FROM app_user
    WHERE auth_id = p_auth_id
    LIMIT 1;

    IF FOUND THEN
      RETURN;
    END IF;
  END IF;

  IF p_email IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::int
  INTO v_matches
  FROM app_user
  WHERE email = p_email;

  -- Ambiguous e-mail ownership must fail closed.
  IF v_matches <> 1 THEN
    RETURN;
  END IF;

  IF p_auth_id IS NOT NULL THEN
    UPDATE app_user
    SET auth_id = p_auth_id
    WHERE email = p_email
      AND auth_id IS NULL;
  END IF;

  RETURN QUERY
  SELECT id, app_user.org_id, app_user.role, app_user.email
  FROM app_user
  WHERE email = p_email
  LIMIT 1;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

-- ============================================================
-- 2. Cross-tenant integrity: interaction child records must match org_id
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_interaction_id_org
  ON ai_interaction(id, org_id);

ALTER TABLE risk_assessment
  DROP CONSTRAINT IF EXISTS risk_assessment_interaction_org_fk;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'risk_assessment_interaction_org_fk'
      AND conrelid = 'risk_assessment'::regclass
  ) THEN
    ALTER TABLE risk_assessment
      ADD CONSTRAINT risk_assessment_interaction_org_fk
      FOREIGN KEY (interaction_id, org_id)
      REFERENCES ai_interaction(id, org_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'checklist_response_interaction_org_fk'
      AND conrelid = 'checklist_response'::regclass
  ) THEN
    ALTER TABLE checklist_response
      ADD CONSTRAINT checklist_response_interaction_org_fk
      FOREIGN KEY (interaction_id, org_id)
      REFERENCES ai_interaction(id, org_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'citation_check_interaction_org_fk'
      AND conrelid = 'citation_check'::regclass
  ) THEN
    ALTER TABLE citation_check
      ADD CONSTRAINT citation_check_interaction_org_fk
      FOREIGN KEY (interaction_id, org_id)
      REFERENCES ai_interaction(id, org_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'proxy_request_interaction_org_fk'
      AND conrelid = 'proxy_request'::regclass
  ) THEN
    ALTER TABLE proxy_request
      ADD CONSTRAINT proxy_request_interaction_org_fk
      FOREIGN KEY (interaction_id, org_id)
      REFERENCES ai_interaction(id, org_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'alert_interaction_org_fk'
      AND conrelid = 'alert'::regclass
  ) THEN
    ALTER TABLE alert
      ADD CONSTRAINT alert_interaction_org_fk
      FOREIGN KEY (interaction_id, org_id)
      REFERENCES ai_interaction(id, org_id);
  END IF;
END $$;

-- ============================================================
-- 3. Dashboard summary: count real pending approvals, not every
--    require_approval interaction ever captured
-- ============================================================
CREATE OR REPLACE VIEW v_dashboard_summary AS
SELECT
  i.org_id,
  COUNT(*)::int AS total_interactions,
  COUNT(*) FILTER (WHERE i.decision = 'block')::int AS blocked,
  COUNT(*) FILTER (WHERE COALESCE(cr.pending_approval, false))::int AS pending_approval,
  COUNT(*) FILTER (WHERE i.decision = 'allow')::int AS allowed,
  COUNT(*) FILTER (WHERE i.decision = 'allow_with_masking')::int AS masked,
  COUNT(*) FILTER (WHERE i.risk_class = 'excessivo')::int AS risk_excessive,
  COUNT(*) FILTER (WHERE i.risk_class = 'alto')::int AS risk_high,
  COUNT(*) FILTER (WHERE i.risk_class = 'moderado')::int AS risk_moderate,
  COUNT(*) FILTER (WHERE i.risk_class = 'baixo')::int AS risk_low,
  COUNT(*) FILTER (WHERE i.checklist_passed = false)::int AS checklist_failed,
  MIN(i.created_at) AS first_at,
  MAX(i.created_at) AS last_at
FROM ai_interaction i
LEFT JOIN (
  SELECT
    org_id,
    interaction_id,
    bool_or(approval_status = 'pendente') AS pending_approval
  FROM checklist_response
  GROUP BY org_id, interaction_id
) cr
  ON cr.org_id = i.org_id
 AND cr.interaction_id = i.id
GROUP BY i.org_id;
