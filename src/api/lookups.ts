import { listAll } from "./client";
import type { Category, Department, Option, RecipientGroup, SenderProfile, Unit } from "./types";

export const loadUnits = () => listAll<Unit>("/units/");
export const loadDepartments = () => listAll<Department>("/departments/");
export const loadCategories = () => listAll<Category>("/categories/");
export const loadGroups = () => listAll<RecipientGroup>("/recipient-groups/");
export const loadSenders = () => listAll<SenderProfile>("/senders/");

export const toOptions = <T extends { id: number; name: string }>(items: T[] | undefined): Option[] =>
  (items ?? []).map((i) => ({ value: i.id, label: i.name }));

export const KIND_LABELS: Record<string, string> = { qms: "QMS record", audit: "Audit", action_item: "Action item" };
export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Field options for a category, including system fields usable in rules/widgets. */
export function fieldOptions(category: Category | undefined, opts: { system?: boolean; onlyType?: string } = {}): Option[] {
  const fields = (category?.fields_detail ?? []).filter((f) => f.active && (!opts.onlyType || f.field_type === opts.onlyType));
  const out: Option[] = fields.map((f) => ({ value: f.key, label: `${f.label} (${f.key})` }));
  if (opts.system) out.unshift({ value: "status", label: "Status" }, { value: "unit", label: "Unit" }, { value: "department", label: "Department" }, { value: "source_id", label: "Record ID" });
  return out;
}
