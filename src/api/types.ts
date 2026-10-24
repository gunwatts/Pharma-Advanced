// Type-safe models mirroring the Django REST API.

export type Permission =
  | "admin.configure"
  | "admin.users"
  | "runs.view"
  | "runs.manage"
  | "records.view"
  | "records.export"
  | "dashboards.view"
  | "dashboards.manage"
  | "audit.view";

export interface Scope {
  unit: number | null;
  department: number | null;
  unit_name?: string | null;
  department_name?: string | null;
}

export interface Me {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string | null;
  permissions: Permission[];
  all_data_scope: boolean;
  scopes: Scope[];
  default_dashboard_id: number | null;
}

export interface LoginResponse {
  token: string;
  expires_at: string;
  user: Me;
}

export interface Unit {
  id: number;
  code: string;
  name: string;
  aliases: string[];
  active: boolean;
}
export type Department = Unit;

export interface RecipientGroup {
  id: number;
  unit: number;
  department: number;
  unit_name: string;
  department_name: string;
  to_emails: string[];
  cc_emails: string[];
  sender_profile: number | null;
  active: boolean;
  warnings: string[];
}

export type CategoryKind = "qms" | "audit" | "action_item";
export type FieldType = "text" | "date" | "number" | "choice" | "email";

export interface FieldDefinition {
  id: number;
  category: number;
  key: string;
  label: string;
  field_type: FieldType;
  required: boolean;
  choices: string[];
  max_length: number | null;
  pattern: string;
  sort_order: number;
  active: boolean;
}

export interface StatusDefinition {
  id: number;
  category: number;
  value: string;
  label: string;
  is_closed: boolean;
  aliases: string[];
}

export interface Category {
  id: number;
  key: string;
  name: string;
  kind: CategoryKind;
  description: string;
  title_field: string;
  display_fields: string[];
  sort_order: number;
  active: boolean;
  fields_detail: FieldDefinition[];
  statuses_detail: StatusDefinition[];
  record_count?: number;
}

export interface Relationship {
  id: number;
  parent_category: number;
  child_category: number;
  parent_name: string;
  child_name: string;
  link_field: string;
  active: boolean;
}

export type SourceProvider = "upload" | "server_folder" | "graph_drive";

export interface DataSource {
  id: number;
  name: string;
  provider: SourceProvider;
  config: Record<string, string>;
  description: string;
  active: boolean;
  uploaded_file_name: string;
  uploaded_at: string | null;
  last_checked_at: string | null;
  last_check_ok: boolean | null;
  last_check_message: string;
  mapping_count: number;
}

export interface SourceOptions {
  server_roots: string[];
  graph_configured: boolean;
  max_workbook_mb: number;
}

export interface BrowseEntry {
  id?: string;
  name: string;
  path?: string;
  type: "folder" | "file";
  size: number | null;
  modified: number | string | null;
}

export interface SheetPreview {
  sheets: string[];
  worksheet: string;
  headers: string[];
  rows: { row: number; values: Record<string, string> }[];
  row_count: number;
}

export interface SourceMapping {
  id: number;
  name: string;
  data_source: number;
  data_source_name?: string;
  category: number;
  category_name?: string;
  worksheet: string;
  header_row: number;
  id_column: string;
  unit_column: string;
  fixed_unit: number | null;
  fixed_unit_name?: string | null;
  department_column: string;
  status_column: string;
  column_map: Record<string, string>;
  date_formats: string[];
  max_rejected_rows: number;
  active: boolean;
  last_validated_at?: string | null;
  last_validation_ok?: boolean | null;
  last_attempt_at?: string | null;
  last_success_at?: string | null;
  last_status?: string;
  last_rows_read?: number;
  last_rows_imported?: number;
  last_rows_rejected?: number;
  last_error?: string;
}

export interface Issue {
  field?: string;
  code: string;
  message: string;
}

export interface ValidationReport {
  ok: boolean;
  headers: string[];
  structure_errors: string[];
  warnings: string[];
  unmapped_columns?: string[];
  rows_read: number;
  rows_valid?: number;
  rows_open?: number;
  rows_closed?: number;
  rows_rejected?: number;
  rows_flagged?: number;
  issue_counts?: Record<string, number>;
  rejected?: { row: number; source_id: string; message: string }[];
  flagged?: { row: number; source_id: string; issues: Issue[] }[];
  sample?: { row: number; source_id: string; unit: string; department: string; status: string; closed: boolean; data: Record<string, unknown> }[];
  rejected_threshold?: number;
}

export interface SyncRun {
  id: number;
  mapping: number;
  mapping_name: string;
  daily_run: number | null;
  triggered_by: string;
  started_at: string;
  finished_at: string | null;
  status: "success" | "incomplete" | "failed";
  rows_read: number;
  rows_imported: number;
  rows_rejected: number;
  rows_flagged: number;
  rows_closed: number;
  records_created: number;
  records_updated: number;
  records_removed_closed: number;
  records_removed_missing: number;
  message: string;
  errors: ({ type: string; message: string; row?: number; source_id?: string; code?: string })[];
}

export type SenderProviderKey = "microsoft_graph" | "gmail_api" | "smtp" | "console";

export interface SenderProfile {
  id: number;
  name: string;
  provider: SenderProviderKey;
  from_address: string;
  from_name: string;
  reply_to: string;
  settings: { host?: string; port?: number; security?: string; username?: string };
  secret_env_prefix: string;
  is_default: boolean;
  active: boolean;
  last_test_at: string | null;
  last_test_status: string;
  last_test_message: string;
  secret_status: Record<string, boolean>;
  delivers: boolean;
}

export interface Condition {
  field: string;
  op: string;
  value?: string;
}

export interface ReminderRule {
  id: number;
  name: string;
  category: number;
  category_name?: string;
  target_date_field: string;
  window_days: number;
  include_statuses: string[];
  exclude_statuses: string[];
  conditions: Condition[];
  units: number[];
  departments: number[];
  active: boolean;
}

export interface EmailTemplate {
  id: number;
  name: string;
  is_active: boolean;
  subject: string;
  intro_text: string;
  outro_text: string;
  no_pending_subject: string;
  no_pending_text: string;
  show_parent_context: boolean;
}

export interface EmailPreview {
  subject: string | null;
  html: string | null;
  text?: string;
  to?: string[];
  cc?: string[];
  note?: string;
  hold_reasons?: string[];
  action?: string;
  items?: number;
  sample?: boolean;
  no_pending?: { subject: string; html: string };
}

export interface JobSchedule {
  id: number;
  job: "daily_reminders" | "sync_sources";
  enabled: boolean;
  run_time: string;
  days_of_week: number[];
  last_run_date: string | null;
  last_started_at: string | null;
  last_finished_at: string | null;
  last_status: string;
  next_run_at: string | null;
}

export interface SystemSettings {
  business_timezone: string;
  default_window_days: number;
  send_no_pending_email: boolean;
  alert_recipients: string[];
  alert_sender_profile: number | null;
  max_send_attempts: number;
  reminders_active: boolean;
  activated_at: string | null;
  config_version: number;
}

export interface GroupSummaryRow {
  group_id: number;
  unit: string;
  department: string;
  planned: string;
  outcome: string;
  items: number;
  flagged: number;
  detail: string;
  hold_reasons: string[];
}

export interface DailyRun {
  id: number;
  run_date: string;
  kind: string;
  status: string;
  triggered_by: string;
  started_at: string;
  finished_at: string | null;
  config_version: number;
  summary: {
    groups?: GroupSummaryRow[];
    untrusted?: string[];
    warnings?: string[];
    reason?: string;
    error?: string;
    sent?: number;
    failed?: number;
    uncertain?: number;
    held?: number;
    skipped?: number;
    unrouted?: number;
    totals?: PreviewTotals;
    sync?: SyncSummary[];
  };
}

export interface SyncSummary {
  mapping_id: number;
  mapping: string;
  status: string;
  rows_read: number;
  rows_imported: number;
  rows_rejected: number;
  rows_flagged: number;
  message: string;
}

export interface Delivery {
  id: number;
  idempotency_key: string;
  run_date: string;
  kind: "reminder" | "no_pending" | "test" | "alert";
  state: "pending" | "in_progress" | "sent" | "failed" | "uncertain" | "held" | "retry_authorized";
  unit_name: string;
  department_name: string;
  daily_run: number | null;
  subject: string;
  recipients_to: string[];
  recipients_cc: string[];
  item_counts: Record<string, number>;
  provider: string;
  sender_profile_name: string;
  provider_message_id: string;
  attempts: number;
  last_attempt_at: string | null;
  sent_at: string | null;
  hold_reason: string;
  error: string;
  reconciled_by_name: string | null;
  reconcile_note: string;
}

export interface EvalItem {
  record_id: number;
  category: string;
  kind: CategoryKind;
  source_id: string;
  title: string;
  status: string;
  unit: string;
  department: string;
  target_date: string | null;
  reason: string;
  reason_label: string;
  detail: string;
  rule: string | null;
  parent: string | null;
}

export interface PreviewGroup {
  group_id: number;
  unit: string;
  department: string;
  action: "reminder" | "no_pending" | "held" | "none";
  hold_reasons: string[];
  to: string[];
  cc: string[];
  included: EvalItem[];
  excluded: EvalItem[];
  email: { subject: string; html: string | null } | null;
}

export interface PreviewTotals {
  groups: number;
  reminder: number;
  no_pending: number;
  held: number;
  included_items: number;
}

export interface DryRunPreview {
  run_date: string;
  sync: SyncSummary[];
  untrusted: string[];
  unrouted: EvalItem[];
  warnings: string[];
  groups: PreviewGroup[];
  totals: PreviewTotals;
  daily_run_id: number;
}

export interface SetupCheck {
  ok: boolean;
  message: string;
  warnings: string[];
  blocking: boolean;
}

export type SetupStep = "sender" | "source" | "organization" | "mappings" | "rules" | "template" | "test" | "activate";

export interface SetupStatus {
  steps: SetupStep[];
  checks: Record<SetupStep, SetupCheck>;
  ready_to_activate: boolean;
  active: boolean;
  activated_at: string | null;
  wizard_state: { current_step?: SetupStep };
  next_run_at: string | null;
  schedule_enabled: boolean;
  last_successful_run: DailyRun | null;
  last_run: DailyRun | null;
}

export interface RecordItem {
  id: number;
  category: number;
  category_name: string;
  category_kind: CategoryKind;
  source_id: string;
  unit: number;
  unit_name: string;
  department: number;
  department_name: string;
  status: string;
  title: string;
  data: Record<string, string | number | null>;
  issues: Issue[];
  parent_ref: string;
  parent_summary: { id: number | null; category: string; source_id: string; title: string; status: string } | null;
  last_synced_at: string;
  children?: { id: number; category: string; source_id: string; title: string; status: string; unit: string; department: string; data: Record<string, unknown> }[];
}

export type WidgetType = "kpi" | "pie" | "donut" | "bar" | "line" | "area" | "table" | "upcoming" | "overdue";

export interface Widget {
  id: number;
  dashboard: number;
  title: string;
  widget_type: WidgetType;
  category: number | null;
  filters: Condition[];
  group_by: string;
  date_field: string;
  date_bucket: "day" | "week" | "month";
  window_days: number;
  columns: string[];
  sort_by: string;
  sort_desc: boolean;
  limit: number;
  width: number;
  position: number;
}

export interface DashboardAssignment {
  id: number;
  dashboard: number;
  role: number | null;
  user: number | null;
  role_name: string | null;
  username: string | null;
}

export interface Dashboard {
  id: number;
  name: string;
  description: string;
  is_published: boolean;
  widgets: Widget[];
  assignments: DashboardAssignment[];
}

export interface SeriesPoint {
  key: string;
  label: string;
  count: number;
}

export interface TableRow {
  id: number;
  category: string;
  source_id: string;
  title: string;
  status: string;
  unit: string;
  department: string;
  has_issues: boolean;
  target_date?: string;
  days?: number;
  [key: string]: unknown;
}

export interface WidgetData {
  value?: number;
  series?: SeriesPoint[];
  rows?: TableRow[];
  total?: number;
  group_by?: string;
}

export interface WidgetResult {
  id: number;
  ok: boolean;
  data?: WidgetData;
  error?: string;
}

export interface Role {
  id: number;
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
  is_system: boolean;
  default_dashboard: number | null;
  user_count: number;
}

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  is_superuser: boolean;
  last_login: string | null;
  role: number | null;
  role_name: string | null;
  all_data_scope: boolean;
  default_dashboard: number | null;
  scopes: Scope[];
  password?: string;
}

export interface AuditEvent {
  id: number;
  created_at: string;
  actor_username: string;
  action: string;
  object_type: string;
  object_id: string;
  object_repr: string;
  changes: Record<string, unknown>;
  ip_address: string | null;
}

export interface Option {
  value: string | number;
  label: string;
}
