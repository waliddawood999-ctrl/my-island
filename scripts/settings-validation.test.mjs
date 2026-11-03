import { build } from "esbuild";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
const out=join(mkdtempSync(join(tmpdir(),"settings-contract-")),"a.mjs");
await build({entryPoints:["src/appearance.ts"],bundle:true,format:"esm",outfile:out,logLevel:"silent"});
const a=await import(pathToFileURL(out));
const exported=JSON.parse(a.exportSettings({...a.FULL_DEFAULTS,loaded:true,fx:{},environment:{},unknown:1}));
assert(!("loaded" in exported.settings) && !("fx" in exported.settings) && !("environment" in exported.settings));
const read=v=>a.parseImport(JSON.stringify({app:"myisland",settings:v}),{});
assert.deepEqual(read({motionSpeed:999,pillWidth:-1,themeMode:"invalid",monitor:0.5}),{});
assert.deepEqual(read({motionSpeed:1.2,pillWidth:220,themeMode:"system"}),{motionSpeed:1.2,pillWidth:220,themeMode:"system"});
assert.deepEqual(read({workspaces:["bad"],themeTune:{pillScale:999}}),{});
assert.deepEqual(read({themeTune:{press:"strong",tokens:{"--accent":"#ffffff"}}}),{themeTune:{press:"strong",tokens:{"--accent":"#ffffff"}}});
assert.deepEqual(read({workspaces:[{id:"w1",name:"Work",items:["C:\\test.exe"]}]}),{workspaces:[{id:"w1",name:"Work",items:["C:\\test.exe"]}]});
assert.deepEqual(read({themeCustom:null,myThemes:null,countdowns:[{id:"x",name:"A",date:123}]}),{});
assert.deepEqual(read({hotkeyToggle:"Alt+X",browserTabMode:true}),{});
assert.equal(a.parseImport("invalid",{}),null);
assert.deepEqual(a.parseImport(a.exportSettings(a.FULL_DEFAULTS),{}),a.FULL_DEFAULTS);
const keys=Object.values(a.SECTION_KEYS).flat();assert.equal(new Set(keys).size,keys.length);
assert(keys.every(k=>a.resetPatch([k])[k]!==undefined));
console.log("OK settings contract: round trip, runtime-field exclusion, ranges, enums, optional keys, nested objects, reset coverage");

const manifest=readFileSync("src-tauri/build.rs","utf8");
for (const command of ["system_transparency","system_accent","wallpaper_color","media_now"]) {
  assert(manifest.includes(`"${command}"`), `Missing manifest command ${command}`);
  for (const window of ["main","settings","overlay","editor"]) {
    const cap=JSON.parse(readFileSync(`src-tauri/capabilities/${window}.json`,"utf8"));
    assert(cap.permissions.includes(`allow-${command.replaceAll("_","-")}`), `Missing ${command} permission for ${window}`);
  }
}
console.log("OK appearance IPC manifest and four-window permissions");

const tuned={themeTune:{iconScale:1.1,press:"strong",highContrast:true}};
assert.deepEqual(a.sectionResetPatch("motion",tuned).themeTune,{iconScale:1.1});
assert.deepEqual(a.sectionResetPatch("appearance",tuned).themeTune,{press:"strong",highContrast:true});
assert.deepEqual(a.resetPatch(Object.values(a.SECTION_KEYS).flat()).themeTune,{});
console.log("OK section resets preserve tuning owned by the other section");
