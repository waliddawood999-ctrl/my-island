// Shared contract: used by imports, saves and Rust persistence.
import raw from "./settingsSchema.json";
import type { Settings } from "./settings";
export interface Rule {
  type: string; integer?: boolean; default?: unknown; min?: number; max?: number; enum?: unknown[];
  maxLength?: number; pattern?: string; maxItems?: number; unique?: boolean;
  items?: Rule; properties?: Record<string, Rule>; required?: string[];
}
export const SETTINGS_SCHEMA = raw as Record<string, Rule>;
export const schemaDefaults = Object.fromEntries(Object.entries(SETTINGS_SCHEMA).filter(([, r]) => "default" in r).map(([k,r]) => [k,r.default])) as Partial<Settings>;
export function validValue(v: unknown, r: Rule): boolean {
  if (r.type === "array") return Array.isArray(v) && v.length <= (r.maxItems ?? 1000) && (!r.unique || new Set(v.map(x => JSON.stringify(x))).size === v.length) && (!r.items || v.every(x => validValue(x, r.items!)));
  if (r.type === "object") {
    if (!v || typeof v !== "object" || Array.isArray(v)) return false;
    const o = v as Record<string, unknown>;
    return (!r.required || r.required.every(k => Object.prototype.hasOwnProperty.call(o,k))) && (!r.properties || Object.entries(o).every(([k,x]) => Object.prototype.hasOwnProperty.call(r.properties!, k) && validValue(x,r.properties![k])));
  }
  if (typeof v !== r.type || (r.enum && !r.enum.includes(v))) return false;
  if (typeof v === "number") return Number.isFinite(v) && (!r.integer || Number.isInteger(v)) && (r.min === undefined || v >= r.min) && (r.max === undefined || v <= r.max);
  return typeof v !== "string" || (Array.from(v).length <= (r.maxLength ?? 4096) && (!r.pattern || new RegExp(r.pattern).test(v)));
}
export function filterSettings(value: unknown): Partial<Settings> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([k,v]) => Object.prototype.hasOwnProperty.call(SETTINGS_SCHEMA,k) && validValue(v,SETTINGS_SCHEMA[k]))) as Partial<Settings>;
}
