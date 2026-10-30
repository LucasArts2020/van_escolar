CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY, name text NOT NULL, email text UNIQUE NOT NULL,
  password_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY, name text NOT NULL, kind text NOT NULL CHECK (kind IN ('SCHOOL','TRANSPORT','FAMILY'))
);
CREATE TABLE IF NOT EXISTS memberships (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  role text NOT NULL CHECK (role IN ('GUARDIAN','DRIVER','SCHOOL')),
  coordinator boolean NOT NULL DEFAULT false, manage_team boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true, UNIQUE(user_id, organization_id, role)
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS access_tokens (
  token_hash text PRIMARY KEY, type text NOT NULL CHECK(type IN ('RESET','INVITE')),
  email text NOT NULL, organization_id uuid REFERENCES organizations(id),
  role text CHECK(role IN ('SCHOOL')), expires_at timestamptz NOT NULL,
  used_at timestamptz, created_by uuid REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY, actor_id uuid NOT NULL REFERENCES users(id),
  membership_id uuid REFERENCES memberships(id), organization_id uuid REFERENCES organizations(id),
  action text NOT NULL, target_id text NOT NULL, details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_scope ON audit_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);

-- Parte 2: acréscimos idempotentes, sem apagar a base da Parte 1.
CREATE TABLE IF NOT EXISTS students (
  id uuid PRIMARY KEY, name text NOT NULL, normalized_name text NOT NULL,
  birth_date date, owner_organization_id uuid NOT NULL REFERENCES organizations(id),
  created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS students_owner ON students(owner_organization_id,normalized_name);
CREATE TABLE IF NOT EXISTS operating_links (
  id uuid PRIMARY KEY, student_id uuid NOT NULL REFERENCES students(id),
  school_id uuid NOT NULL REFERENCES organizations(id), transport_id uuid NOT NULL REFERENCES organizations(id),
  initiated_by_organization_id uuid NOT NULL REFERENCES organizations(id),
  status text NOT NULL CHECK(status IN ('PENDING','ACTIVE','REFUSED','INACTIVE')),
  created_by uuid NOT NULL REFERENCES users(id), changed_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), changed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id,school_id,transport_id), CHECK(school_id<>transport_id),
  CHECK(initiated_by_organization_id=school_id OR initiated_by_organization_id=transport_id)
);
CREATE INDEX IF NOT EXISTS operating_links_school ON operating_links(school_id,status);
CREATE INDEX IF NOT EXISTS operating_links_transport ON operating_links(transport_id,status);
CREATE TABLE IF NOT EXISTS guardian_links (
  id uuid PRIMARY KEY, student_id uuid NOT NULL REFERENCES students(id),
  email text NOT NULL, user_id uuid REFERENCES users(id),
  status text NOT NULL CHECK(status IN ('INVITED','AWAITING_VERIFICATION','ACTIVE','INACTIVE')),
  created_by uuid NOT NULL REFERENCES users(id), verified_by uuid REFERENCES users(id),
  verification_note text, verified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id,email), CHECK(status<>'ACTIVE' OR (user_id IS NOT NULL AND verified_by IS NOT NULL AND verified_at IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS registry_invites (
  token_hash text PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('GUARDIAN','DRIVER')),
  email text NOT NULL, organization_id uuid NOT NULL REFERENCES organizations(id),
  guardian_link_id uuid REFERENCES guardian_links(id),
  created_by uuid NOT NULL REFERENCES users(id), membership_id uuid NOT NULL REFERENCES memberships(id),
  verification_note text, expires_at timestamptz NOT NULL, used_at timestamptz,
  CHECK((kind='GUARDIAN' AND guardian_link_id IS NOT NULL) OR (kind='DRIVER' AND guardian_link_id IS NULL))
);
CREATE TABLE IF NOT EXISTS vehicles (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL, plate text NOT NULL, capacity integer NOT NULL CHECK(capacity BETWEEN 1 AND 60),
  active boolean NOT NULL DEFAULT true, created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,plate)
);

-- Parte 3: rotina versionada, previsões estáveis e solicitações de alteração.
CREATE TABLE IF NOT EXISTS planning_policies (
  transport_id uuid PRIMARY KEY REFERENCES organizations(id),
  cutoff_time time NOT NULL, timezone text NOT NULL, revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  demo boolean NOT NULL DEFAULT false, changed_by uuid NOT NULL REFERENCES users(id), changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS weekly_routines (
  id uuid PRIMARY KEY, operating_link_id uuid UNIQUE NOT NULL REFERENCES operating_links(id),
  revision integer NOT NULL CHECK(revision>0), days jsonb NOT NULL,
  changed_by uuid NOT NULL REFERENCES users(id), changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS daily_plans (
  id uuid PRIMARY KEY, operating_link_id uuid NOT NULL REFERENCES operating_links(id),
  service_date date NOT NULL, direction text NOT NULL CHECK(direction IN ('OUTBOUND','RETURN')),
  scheduled boolean NOT NULL, status text NOT NULL CHECK(status IN ('NOT_EXPECTED','PENDING','CONFIRMED','NOT_USING')),
  routine_revision integer, policy_revision integer NOT NULL, timezone text NOT NULL, deadline_at timestamptz NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK(version>0), created_by uuid NOT NULL REFERENCES users(id),
  changed_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), changed_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  UNIQUE(operating_link_id,service_date,direction)
);
CREATE INDEX IF NOT EXISTS daily_plans_date ON daily_plans(service_date,operating_link_id);
CREATE TABLE IF NOT EXISTS planning_changes (
  id uuid PRIMARY KEY, plan_id uuid NOT NULL REFERENCES daily_plans(id), requested_usage boolean NOT NULL,
  previous_status text NOT NULL, reason text NOT NULL,
  status text NOT NULL CHECK(status IN ('PENDING','ACCEPTED','REFUSED','WITHDRAWN')),
  requested_by uuid NOT NULL REFERENCES users(id), requested_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid REFERENCES users(id), decided_at timestamptz, decision_note text
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_planning_change ON planning_changes(plan_id) WHERE status='PENDING';

-- Parte 4: viagem e contabilização individual. Movimentações serão integradas na Parte 5.
CREATE TABLE IF NOT EXISTS trips (
  id uuid PRIMARY KEY, transport_id uuid NOT NULL REFERENCES organizations(id),
  service_date date NOT NULL, direction text NOT NULL CHECK(direction IN ('OUTBOUND','RETURN')),
  timezone text NOT NULL, status text NOT NULL DEFAULT 'PLANNED'
    CHECK(status IN ('PLANNED','IN_PROGRESS','ROUTE_ENDED_OPEN','COMPLETED','CANCELLED')),
  driver_membership_id uuid NOT NULL REFERENCES memberships(id), driver_user_id uuid NOT NULL REFERENCES users(id),
  driver_name text NOT NULL, vehicle_id uuid NOT NULL REFERENCES vehicles(id),
  vehicle_name text NOT NULL, vehicle_plate text NOT NULL, capacity integer NOT NULL CHECK(capacity>0),
  version integer NOT NULL DEFAULT 1 CHECK(version>0), creation_hash text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
  started_by uuid REFERENCES users(id), started_at timestamptz,
  cancelled_by uuid REFERENCES users(id), cancelled_at timestamptz, cancellation_reason text
);
CREATE INDEX IF NOT EXISTS trips_transport_date ON trips(transport_id,service_date);
CREATE TABLE IF NOT EXISTS trip_passengers (
  id uuid PRIMARY KEY, trip_id uuid NOT NULL REFERENCES trips(id), plan_id uuid NOT NULL REFERENCES daily_plans(id),
  operating_link_id uuid NOT NULL REFERENCES operating_links(id), student_id uuid NOT NULL REFERENCES students(id),
  school_id uuid NOT NULL REFERENCES organizations(id), student_name text NOT NULL, school_name text NOT NULL,
  planning_status text NOT NULL, scheduled boolean NOT NULL,
  disposition text NOT NULL CHECK(disposition IN ('EXPECTED','REVIEW_REQUIRED','NOT_TRANSPORTED')),
  reason text, exceptional boolean NOT NULL DEFAULT false, active boolean NOT NULL DEFAULT true,
  added_by uuid NOT NULL REFERENCES users(id), added_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid REFERENCES users(id), changed_at timestamptz,
  boarding_informed_at timestamptz, boarding_validated_at timestamptz,
  alighting_informed_at timestamptz, delivery_validated_at timestamptz,
  UNIQUE(trip_id,plan_id),
  UNIQUE(trip_id,student_id),
  CHECK(disposition<>'NOT_TRANSPORTED' OR (boarding_informed_at IS NULL AND alighting_informed_at IS NULL)),
  CHECK(boarding_validated_at IS NULL OR boarding_informed_at IS NOT NULL),
  CHECK(delivery_validated_at IS NULL OR alighting_informed_at IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_trip_per_plan ON trip_passengers(plan_id) WHERE active;
CREATE INDEX IF NOT EXISTS trip_passengers_trip ON trip_passengers(trip_id);
CREATE TABLE IF NOT EXISTS trip_assignments (
  id uuid PRIMARY KEY, trip_id uuid NOT NULL REFERENCES trips(id),
  previous_driver_membership_id uuid REFERENCES memberships(id), driver_membership_id uuid NOT NULL REFERENCES memberships(id),
  previous_vehicle_id uuid REFERENCES vehicles(id), vehicle_id uuid NOT NULL REFERENCES vehicles(id),
  driver_name text NOT NULL, vehicle_name text NOT NULL, vehicle_plate text NOT NULL,
  reason text NOT NULL, actor_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);

-- Parte 5: registros individuais, sem confirmação em lote ou edição dos autores.
ALTER TABLE trips ADD COLUMN IF NOT EXISTS current_assignment_id uuid REFERENCES trip_assignments(id);
UPDATE trips t SET current_assignment_id=(SELECT a.id FROM trip_assignments a WHERE a.trip_id=t.id ORDER BY a.created_at DESC,a.id DESC LIMIT 1) WHERE t.current_assignment_id IS NULL;
CREATE TABLE IF NOT EXISTS movements (
  id uuid PRIMARY KEY, passenger_id uuid NOT NULL REFERENCES trip_passengers(id),
  kind text NOT NULL CHECK(kind IN ('BOARDING','ALIGHTING')),
  counterpart_role text NOT NULL CHECK(counterpart_role IN ('GUARDIAN','SCHOOL')),
  created_at timestamptz NOT NULL, UNIQUE(passenger_id,kind)
);
CREATE TABLE IF NOT EXISTS movement_confirmations (
  id uuid PRIMARY KEY, movement_id uuid NOT NULL REFERENCES movements(id),
  side text NOT NULL CHECK(side IN ('DRIVER','COUNTERPART')),
  actor_id uuid NOT NULL REFERENCES users(id), actor_name text NOT NULL,
  membership_id uuid NOT NULL REFERENCES memberships(id), role text NOT NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id), organization_name text NOT NULL,
  assignment_id uuid NOT NULL REFERENCES trip_assignments(id),
  received_at timestamptz NOT NULL,
  UNIQUE(movement_id,side), UNIQUE(movement_id,actor_id),
  CHECK((side='DRIVER' AND role='DRIVER') OR (side='COUNTERPART' AND role IN ('GUARDIAN','SCHOOL')))
);
CREATE TABLE IF NOT EXISTS movement_issues (
  id uuid PRIMARY KEY, movement_id uuid NOT NULL REFERENCES movements(id),
  kind text NOT NULL CHECK(kind='SEQUENCE_INCOMPLETE'),
  status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','IN_REVIEW','RESOLVED')),
  detected_by uuid NOT NULL REFERENCES users(id), detected_at timestamptz NOT NULL,
  details jsonb NOT NULL, UNIQUE(movement_id,kind)
);
-- Parte 6: eventos e caixa de saída duráveis, independentes da disponibilidade do Redis.
CREATE TABLE IF NOT EXISTS notification_events (
  id uuid PRIMARY KEY, confirmation_id uuid NOT NULL REFERENCES movement_confirmations(id),
  movement_id uuid NOT NULL REFERENCES movements(id), passenger_id uuid NOT NULL REFERENCES trip_passengers(id),
  kind text NOT NULL CHECK(kind IN ('MOVEMENT_CONFIRMED','SEQUENCE_INCOMPLETE')),
  state text NOT NULL CHECK(state IN ('INFORMED','VALIDATED')),
  actor_name text NOT NULL, actor_role text NOT NULL, occurred_at timestamptz NOT NULL,
  UNIQUE(confirmation_id,kind)
);
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY, event_id uuid NOT NULL REFERENCES notification_events(id),
  membership_id uuid NOT NULL REFERENCES memberships(id), user_id uuid NOT NULL REFERENCES users(id),
  purpose text NOT NULL CHECK(purpose IN ('ACTION','UPDATE')), created_at timestamptz NOT NULL,
  read_at timestamptz, dispatched_at timestamptz, push_note text,
  UNIQUE(event_id,membership_id)
);
CREATE INDEX IF NOT EXISTS notifications_inbox ON notifications(membership_id,created_at DESC);
CREATE TABLE IF NOT EXISTS push_devices (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
  session_hash text NOT NULL, installation_id uuid NOT NULL, token text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true, registered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(installation_id)
);
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id uuid PRIMARY KEY, notification_id uuid NOT NULL REFERENCES notifications(id), device_id uuid NOT NULL REFERENCES push_devices(id),
  device_registered_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','RETRY','ACCEPTED','PROVIDER_ACCEPTED','FAILED','SUPPRESSED','RECEIPT_UNKNOWN')),
  attempts integer NOT NULL DEFAULT 0, receipt_attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(), ticket_id text, accepted_at timestamptz, finished_at timestamptz,
  error_code text, UNIQUE(notification_id,device_id)
);
CREATE INDEX IF NOT EXISTS notification_delivery_due ON notification_deliveries(status,next_attempt_at);
CREATE TABLE IF NOT EXISTS notification_attempts (
  id uuid PRIMARY KEY, delivery_id uuid NOT NULL REFERENCES notification_deliveries(id),
  phase text NOT NULL CHECK(phase IN ('SEND','RECEIPT')), attempt integer NOT NULL,
  status text NOT NULL CHECK(status IN ('ACCEPTED','PROVIDER_ACCEPTED','FAILED','WAITING')),
  error_code text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(delivery_id,phase,attempt)
);
ALTER TABLE notification_deliveries ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES notification_events(id);
UPDATE notification_deliveries d SET event_id=n.event_id FROM notifications n WHERE n.id=d.notification_id AND d.event_id IS NULL;
ALTER TABLE notification_deliveries ALTER COLUMN event_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS notification_delivery_event_device ON notification_deliveries(event_id,device_id);
CREATE INDEX IF NOT EXISTS notification_event_passenger ON notification_events(passenger_id,occurred_at);
CREATE INDEX IF NOT EXISTS notification_outbox_pending ON notifications(created_at,id) WHERE dispatched_at IS NULL;

-- Parte 7: gravidade e atendimento são estados independentes.
CREATE TABLE IF NOT EXISTS alert_policies (
  transport_id uuid PRIMARY KEY REFERENCES organizations(id), reminder_minutes integer NOT NULL CHECK(reminder_minutes BETWEEN 1 AND 1440),
  attention_minutes integer NOT NULL, critical_minutes integer NOT NULL CHECK(critical_minutes<=4320),
  revision integer NOT NULL DEFAULT 1, changed_by uuid NOT NULL REFERENCES users(id), changed_at timestamptz NOT NULL DEFAULT now(),
  CHECK(reminder_minutes<attention_minutes AND attention_minutes<critical_minutes)
);
CREATE TABLE IF NOT EXISTS alert_cases (
  id uuid PRIMARY KEY, movement_id uuid NOT NULL REFERENCES movements(id),
  kind text NOT NULL CHECK(kind IN ('CONFIRMATION_PENDING','SEQUENCE_INCOMPLETE','NOT_LOCATED','RECEIPT_DISPUTED')),
  source_issue_id uuid UNIQUE REFERENCES movement_issues(id),
  status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','IN_REVIEW','RESOLVED')),
  level integer NOT NULL DEFAULT 0 CHECK(level BETWEEN 0 AND 3), origin_at timestamptz NOT NULL,
  policy_snapshot jsonb, next_due_at timestamptz, routing_status text NOT NULL DEFAULT 'NOT_REQUIRED',
  version integer NOT NULL DEFAULT 1, assigned_to uuid REFERENCES users(id),
  reported_by uuid REFERENCES users(id), creation_hash text, report_note text,
  resolved_at timestamptz, resolved_by uuid REFERENCES users(id), resolution_kind text, resolution_note text,
  CHECK((status='RESOLVED')=(resolved_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS alert_case_open ON alert_cases(movement_id,kind) WHERE status<>'RESOLVED';
CREATE INDEX IF NOT EXISTS alert_case_due ON alert_cases(next_due_at) WHERE status<>'RESOLVED';
CREATE TABLE IF NOT EXISTS alert_events (
  id uuid PRIMARY KEY, case_id uuid NOT NULL REFERENCES alert_cases(id),
  type text NOT NULL CHECK(type IN ('CREATED','LEVEL_REACHED','REPORTED','ASSUMED','CONTACT','VERIFICATION','RESOLVED')),
  actor_id uuid REFERENCES users(id), membership_id uuid REFERENCES memberships(id), actor_name text NOT NULL,
  role text NOT NULL, occurred_at timestamptz NOT NULL, details jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS alert_event_case ON alert_events(case_id,occurred_at);
ALTER TABLE notification_events ALTER COLUMN confirmation_id DROP NOT NULL;
ALTER TABLE notification_events DROP CONSTRAINT IF EXISTS notification_events_kind_check;
ALTER TABLE notification_events ADD CONSTRAINT notification_events_kind_check CHECK(kind IN ('MOVEMENT_CONFIRMED','SEQUENCE_INCOMPLETE','ALERT_LEVEL','ALERT_RESOLVED','EXCEPTIONAL_ACCOUNTING'));
ALTER TABLE notification_events ADD COLUMN IF NOT EXISTS alert_event_id uuid UNIQUE REFERENCES alert_events(id);
ALTER TABLE notification_events ADD COLUMN IF NOT EXISTS alert_id uuid REFERENCES alert_cases(id);
ALTER TABLE notification_events ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS requires_coordination boolean NOT NULL DEFAULT false;
ALTER TABLE alert_cases ADD COLUMN IF NOT EXISTS recipient_fingerprint text;
ALTER TABLE alert_events ADD COLUMN IF NOT EXISTS position integer;
WITH ranked AS (SELECT id,row_number() OVER(PARTITION BY case_id ORDER BY occurred_at,id)::int position FROM alert_events)
UPDATE alert_events e SET position=r.position FROM ranked r WHERE e.id=r.id AND e.position IS NULL;
ALTER TABLE alert_events ALTER COLUMN position SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS alert_event_order ON alert_events(case_id,position);

-- Parte 8: cada conferência é imutável; van vazia não equivale à entrega individual.
ALTER TABLE trips ADD COLUMN IF NOT EXISTS route_ended_at timestamptz;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES users(id);
CREATE TABLE IF NOT EXISTS trip_inspections (
  id uuid PRIMARY KEY, trip_id uuid NOT NULL REFERENCES trips(id),
  actor_id uuid NOT NULL REFERENCES users(id), membership_id uuid NOT NULL REFERENCES memberships(id),
  actor_name text NOT NULL, assignment_id uuid NOT NULL REFERENCES trip_assignments(id),
  inspected_at timestamptz NOT NULL, walked_interior boolean NOT NULL CHECK(walked_interior),
  checked_seats boolean NOT NULL CHECK(checked_seats), checked_hiding_places boolean NOT NULL CHECK(checked_hiding_places),
  van_empty boolean NOT NULL, note text, request_hash text NOT NULL,
  result text NOT NULL CHECK(result IN ('ROUTE_ENDED_OPEN','COMPLETED')),
  review_snapshot jsonb NOT NULL, trip_version integer NOT NULL,
  CHECK(van_empty OR (note IS NOT NULL AND length(trim(note))>=10))
);
CREATE INDEX IF NOT EXISTS trip_inspection_history ON trip_inspections(trip_id,trip_version);
ALTER TABLE alert_cases DROP CONSTRAINT IF EXISTS alert_cases_kind_check;
ALTER TABLE alert_cases ADD CONSTRAINT alert_cases_kind_check CHECK(kind IN ('CONFIRMATION_PENDING','SEQUENCE_INCOMPLETE','NOT_LOCATED','RECEIPT_DISPUTED','ROUTE_END_PENDING','CORRECTION_CONFLICT'));

-- Parte 9: correções e contabilizações excepcionais acrescentam versões, sem editar confirmações.
ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_status_check;
ALTER TABLE trips ADD CONSTRAINT trips_status_check CHECK(status IN ('PLANNED','IN_PROGRESS','ROUTE_ENDED_OPEN','COMPLETED','CANCELLED','COMPLETED_REVIEW'));
ALTER TABLE trips ADD COLUMN IF NOT EXISTS review_opened_at timestamptz;
ALTER TABLE trip_inspections DROP CONSTRAINT IF EXISTS trip_inspections_result_check;
ALTER TABLE trip_inspections ADD CONSTRAINT trip_inspections_result_check CHECK(result IN ('ROUTE_ENDED_OPEN','COMPLETED','COMPLETED_REVIEW'));
ALTER TABLE trip_passengers ADD COLUMN IF NOT EXISTS safety_revision integer NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS confirmation_corrections (
 id uuid PRIMARY KEY, confirmation_id uuid NOT NULL REFERENCES movement_confirmations(id),
 passenger_id uuid NOT NULL REFERENCES trip_passengers(id), alert_id uuid NOT NULL UNIQUE REFERENCES alert_cases(id),
 requested_by uuid NOT NULL REFERENCES users(id), membership_id uuid NOT NULL REFERENCES memberships(id),
 actor_name text NOT NULL, reason text NOT NULL, account text NOT NULL, created_at timestamptz NOT NULL,
 request_hash text NOT NULL, status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
 version integer NOT NULL DEFAULT 1, decided_by uuid REFERENCES users(id), decision_membership_id uuid REFERENCES memberships(id),
 decision_actor_name text, decided_at timestamptz, decision_reason text, contacts text, verification text,
 CHECK((status='PENDING')=(decided_at IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS correction_one_pending ON confirmation_corrections(confirmation_id) WHERE status='PENDING';
CREATE INDEX IF NOT EXISTS correction_passenger ON confirmation_corrections(passenger_id,created_at);
DROP INDEX IF EXISTS alert_case_open;
CREATE UNIQUE INDEX alert_case_open ON alert_cases(movement_id,kind) WHERE status<>'RESOLVED' AND kind<>'CORRECTION_CONFLICT';
CREATE TABLE IF NOT EXISTS exceptional_resolutions (
 id uuid PRIMARY KEY, passenger_id uuid NOT NULL REFERENCES trip_passengers(id), safety_revision integer NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id), membership_id uuid NOT NULL REFERENCES memberships(id), actor_name text NOT NULL,
 created_at timestamptz NOT NULL, reason text NOT NULL, contacts text NOT NULL, verification text NOT NULL,
 outcome text NOT NULL CHECK(outcome IN ('DELIVERED','NOT_TRANSPORTED')),
 recipient_membership_id uuid REFERENCES memberships(id), recipient_name text,
 request_hash text NOT NULL, UNIQUE(passenger_id,safety_revision),
 CHECK(outcome<>'DELIVERED' OR (recipient_membership_id IS NOT NULL AND recipient_name IS NOT NULL))
);
ALTER TABLE notification_events ADD COLUMN IF NOT EXISTS resolution_id uuid UNIQUE REFERENCES exceptional_resolutions(id);
CREATE TABLE IF NOT EXISTS alert_resolution_receipts (
 event_id uuid PRIMARY KEY REFERENCES alert_events(id), case_id uuid NOT NULL REFERENCES alert_cases(id),
 created_at timestamptz NOT NULL, missing_roles jsonb NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS alert_resolution_recipients (
 event_id uuid NOT NULL REFERENCES alert_resolution_receipts(event_id), user_id uuid NOT NULL REFERENCES users(id),
 name text NOT NULL, memberships jsonb NOT NULL, acknowledged_at timestamptz,
 acknowledged_membership_id uuid REFERENCES memberships(id), revoked_at timestamptz,
 PRIMARY KEY(event_id,user_id)
);
CREATE INDEX IF NOT EXISTS alert_resolution_pending ON alert_resolution_recipients(user_id,event_id) WHERE acknowledged_at IS NULL AND revoked_at IS NULL;
-- A revoked recipient is never silently reactivated or transferred, even if
-- access is restored before the next read of the occurrence.
CREATE OR REPLACE FUNCTION dispense_revoked_alert_receipts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE alert_resolution_recipients rr SET revoked_at=clock_timestamp()
 FROM alert_resolution_receipts ar, alert_cases a, movements v, trip_passengers p, trips t, operating_links l
 WHERE rr.event_id=ar.event_id AND a.id=ar.case_id AND v.id=a.movement_id AND p.id=v.passenger_id AND t.id=p.trip_id AND l.id=p.operating_link_id
 AND rr.acknowledged_at IS NULL AND rr.revoked_at IS NULL AND (NOT p.active OR l.status<>'ACTIVE' OR NOT EXISTS(
 SELECT 1 FROM memberships rm WHERE rm.active AND rm.user_id=rr.user_id AND rr.memberships @> jsonb_build_array(jsonb_build_object('id',rm.id::text)) AND (
 (rm.role='DRIVER' AND rm.id=t.driver_membership_id AND rm.user_id=t.driver_user_id) OR
 (rm.role='SCHOOL' AND rm.organization_id=p.school_id AND rm.coordinator) OR
 (rm.role='GUARDIAN' AND EXISTS(SELECT 1 FROM guardian_links rg WHERE rg.student_id=p.student_id AND rg.user_id=rm.user_id AND rg.status='ACTIVE')))));
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS receipt_membership_revocation ON memberships;
CREATE TRIGGER receipt_membership_revocation AFTER UPDATE OF active,coordinator ON memberships FOR EACH STATEMENT EXECUTE FUNCTION dispense_revoked_alert_receipts();
DROP TRIGGER IF EXISTS receipt_guardian_revocation ON guardian_links;
CREATE TRIGGER receipt_guardian_revocation AFTER UPDATE OF status,user_id ON guardian_links FOR EACH STATEMENT EXECUTE FUNCTION dispense_revoked_alert_receipts();
DROP TRIGGER IF EXISTS receipt_link_revocation ON operating_links;
CREATE TRIGGER receipt_link_revocation AFTER UPDATE OF status ON operating_links FOR EACH STATEMENT EXECUTE FUNCTION dispense_revoked_alert_receipts();
DROP TRIGGER IF EXISTS receipt_driver_replacement ON trips;
CREATE TRIGGER receipt_driver_replacement AFTER UPDATE OF driver_membership_id,driver_user_id ON trips FOR EACH STATEMENT EXECUTE FUNCTION dispense_revoked_alert_receipts();
DROP TRIGGER IF EXISTS receipt_passenger_revocation ON trip_passengers;
CREATE TRIGGER receipt_passenger_revocation AFTER UPDATE OF active ON trip_passengers FOR EACH STATEMENT EXECUTE FUNCTION dispense_revoked_alert_receipts();
