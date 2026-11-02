// CI-only instrumentation: log setup progress in the temporary checkout. Never used for shipping builds.
const fs = require('node:fs');
const file = 'src-tauri/src/lib.rs';
let source = fs.readFileSync(file, 'utf8');
const start = source.indexOf('.setup(move |app| {');
const end = source.indexOf('.invoke_handler(', start);
if (start < 0 || end < 0) throw new Error('setup boundaries not found');
let setup = source.slice(start, end);
setup = setup.replace('.setup(move |app| {', '.setup(move |app| {\n            eprintln!("[startup] setup entered");');
setup = setup.replace(/^(\s+)([a-z_]+::[a-z_]+)\(/gm, (_, indent, name) => `${indent}eprintln!("[startup] ${name}");\n${indent}${name}(`);
setup = setup.replace('            Ok(())', '            eprintln!("[startup] setup complete");\n            Ok(())');
fs.writeFileSync(file, source.slice(0, start) + setup + source.slice(end));
console.log('Added setup-stage diagnostics to the CI checkout only');
