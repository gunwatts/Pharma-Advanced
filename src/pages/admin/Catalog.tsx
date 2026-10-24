import { useState } from "react";
import { KIND_LABELS, loadCategories, toOptions } from "../../api/lookups";
import type { Category, FieldDefinition, Relationship, StatusDefinition } from "../../api/types";
import { ResourceManager } from "../../components/ResourceManager";
import { Badge, Button, Callout, Modal } from "../../components/ui";
import { useLoad } from "../../hooks/useLoad";

const FIELD_TYPES = [{ value: "text", label: "Text" }, { value: "date", label: "Date" }, { value: "number", label: "Number" }, { value: "choice", label: "Choice (list)" }, { value: "email", label: "Email" }];

function CategoryDetail({ category, onClose }: { category: Category; onClose: () => void }) {
  return (
    <Modal title={`${category.name}: fields & statuses`} onClose={onClose} width={1000}>
      <Callout tone="warning">Renaming, retyping or removing a field that is used by mappings, rules, templates or dashboards will show the affected items and ask for confirmation.</Callout>
      <div className="stack">
        <ResourceManager<FieldDefinition>
          title="Fields" endpoint="/fields/" query={{ category: category.id }}
          defaults={{ category: category.id, key: "", label: "", field_type: "text", required: false, choices: [], max_length: null, pattern: "", sort_order: 100, active: true }}
          columns={[{ key: "label", label: "Label" }, { key: "key", label: "Key" }, { key: "field_type", label: "Type" },
            { key: "required", label: "Required", render: (f) => (f.required ? "Yes" : "No") },
            { key: "active", label: "Status", render: (f) => <Badge tone={f.active ? "good" : "neutral"}>{f.active ? "active" : "inactive"}</Badge> }]}
          fields={[
            { key: "label", label: "Label", type: "text", required: true },
            { key: "key", label: "Key", type: "text", required: true, help: "lowercase_with_underscores; used in mappings and rules." },
            { key: "field_type", label: "Type", type: "select", options: FIELD_TYPES, required: true },
            { key: "required", label: "Required (empty values are flagged for review)", type: "checkbox" },
            { key: "choices", label: "Allowed values", type: "chips", hidden: (d) => d.field_type !== "choice" },
            { key: "max_length", label: "Maximum length", type: "number", hidden: (d) => d.field_type !== "text" },
            { key: "pattern", label: "Format (regular expression, optional)", type: "text", hidden: (d) => d.field_type !== "text", help: "e.g. CC-\\d{4}-\\d{3}" },
            { key: "sort_order", label: "Order", type: "number" },
            { key: "active", label: "Active", type: "checkbox" },
          ]}
          itemLabel={(f) => f.label}
        />
        <ResourceManager<StatusDefinition>
          title="Statuses" endpoint="/statuses/" query={{ category: category.id }}
          description="Records whose status is marked 'closed' are not stored and are removed after a successful sync. Unknown statuses are flagged."
          defaults={{ category: category.id, value: "", label: "", is_closed: false, aliases: [] }}
          columns={[{ key: "value", label: "Value" }, { key: "aliases", label: "Aliases", render: (s) => s.aliases.join(", ") },
            { key: "is_closed", label: "Closed?", render: (s) => (s.is_closed ? <Badge tone="neutral">closed</Badge> : <Badge tone="info">open</Badge>) }]}
          fields={[{ key: "value", label: "Status value", type: "text", required: true }, { key: "label", label: "Display label", type: "text" },
            { key: "aliases", label: "Aliases (other spellings in Excel)", type: "chips" }, { key: "is_closed", label: "Closed / completed status", type: "checkbox" }]}
          itemLabel={(s) => s.value}
        />
      </div>
    </Modal>
  );
}

export function CategoriesSection() {
  const [detail, setDetail] = useState<Category | null>(null);
  const [version, setVersion] = useState(0);
  const categories = useLoad(loadCategories, [version]);
  return (
    <div className="stack">
      <ResourceManager<Category>
        title="Record categories" endpoint="/categories/" deps={[version]} onSaved={() => setVersion((v) => v + 1)}
        description="Add or deactivate categories without code changes. Kind decides the email section (QMS, Audit, Action items)."
        defaults={{ key: "", name: "", kind: "qms", description: "", title_field: "", display_fields: [], sort_order: 100, active: true }}
        columns={[{ key: "name", label: "Name" }, { key: "kind", label: "Kind", render: (c) => KIND_LABELS[c.kind] }, { key: "fields", label: "Fields", render: (c) => c.fields_detail.length },
          { key: "record_count", label: "Current records" },
          { key: "active", label: "Status", render: (c) => <Badge tone={c.active ? "good" : "neutral"}>{c.active ? "active" : "inactive"}</Badge> }]}
        fields={[
          { key: "name", label: "Name", type: "text", required: true },
          { key: "key", label: "Key", type: "text", required: true, createOnly: true, help: "lowercase_with_underscores, cannot be changed later." },
          { key: "kind", label: "Kind", type: "select", options: Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label })), required: true },
          { key: "description", label: "Description", type: "text" },
          { key: "title_field", label: "Title field", type: "text", help: "Field key used as the record title (e.g. title).", hidden: (d) => !d.id },
          { key: "display_fields", label: "Columns shown in emails/tables", type: "chips", help: "Field keys, e.g. title, status, owner.", hidden: (d) => !d.id },
          { key: "sort_order", label: "Order", type: "number" },
          { key: "active", label: "Active", type: "checkbox" },
        ]}
        rowActions={(c) => <Button onClick={() => setDetail(c)}>Fields & statuses</Button>}
      />
      <ResourceManager<Relationship>
        title="Parent / child relationships" endpoint="/relationships/" deps={[version]}
        description="Explicit links (never text matching): the child's link field holds the parent's record ID. Each department email includes the parent for context but only that department's child items."
        defaults={{ parent_category: null, child_category: null, link_field: "", active: true }}
        columns={[{ key: "parent_name", label: "Parent" }, { key: "child_name", label: "Child" }, { key: "link_field", label: "Link field (on child)" },
          { key: "active", label: "Status", render: (r) => <Badge tone={r.active ? "good" : "neutral"}>{r.active ? "active" : "inactive"}</Badge> }]}
        fields={[
          { key: "parent_category", label: "Parent category", type: "select", options: toOptions(categories.data), required: true, numeric: true },
          { key: "child_category", label: "Child category", type: "select", options: toOptions(categories.data), required: true, numeric: true },
          { key: "link_field", label: "Link field on child", type: "text", required: true, help: "Field key of the child category containing the parent's ID, e.g. audit_ref." },
          { key: "active", label: "Active", type: "checkbox" },
        ]}
        itemLabel={(r) => `${r.parent_name} → ${r.child_name}`}
      />
      {detail && <CategoryDetail category={detail} onClose={() => { setDetail(null); setVersion((v) => v + 1); }} />}
    </div>
  );
}
