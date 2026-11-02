// Contract regression: custom commands must have an ACL entry, and live theme sources must be callable from both windows.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");
const handler = read("src-tauri/src/lib.rs").split("tauri::generate_handler![")[1].split("])")[0];
const registered = [...handler.matchAll(/\b\w+::(\w+)\b/g)].map((m) => m[1]);
const declared = new Set([...read("src-tauri/build.rs").split("fn main()")[0].matchAll(/"(\w+)"/g)].map((m) => m[1]));
assert.ok(registered.length > 80, "handler extraction must cover the command registry");
assert.deepEqual(registered.filter((c) => !declared.has(c)), [], "registered commands missing from the ACL manifest");
assert.deepEqual([...declared].filter((c) => !registered.includes(c)), [], "stale commands in the ACL manifest");

for (const window of ["main", "settings"]) {
  const cap = JSON.parse(read(`src-tauri/capabilities/${window}.json`));
  for (const cmd of ["system_accent", "wallpaper_color", "media_now", "system_transparency"]) {
    assert.ok(cap.permissions.includes(`allow-${cmd.replaceAll("_", "-")}`), `${window}: ${cmd} needed by useSettings live theme sources`);
  }
}
console.log(`OK IPC integration (${registered.length} registered commands, live theme ACLs in both windows)`);
