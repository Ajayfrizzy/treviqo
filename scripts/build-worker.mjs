import { execFileSync } from "node:child_process";
import { readdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
await rm('dist-worker',{recursive:true,force:true});
execFileSync(process.execPath,['node_modules/typescript/bin/tsc','--project','tsconfig.worker.json'],{stdio:'inherit'});
// tsc preserves aliases/extensionless ESM imports. Resolve only emitted project imports;
// package imports remain untouched. No runtime TS loader or new bundler is needed.
async function visit(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await visit(file);else if(file.endsWith('.js')){const text=await readFile(file,'utf8');await writeFile(file,text.replace(/((?:from\s*|import\s*)["'])(@\/[^"']+|\.[^"']+)(["'])/g,(_,prefix,specifier,suffix)=>{let resolved=specifier.startsWith('@/')?path.relative(path.dirname(file),path.join('dist-worker',specifier.slice(2))):specifier;if(!resolved.startsWith('.'))resolved='./'+resolved;return prefix+resolved+(path.extname(resolved)?'':'.js')+suffix;}));}}}
await visit('dist-worker');
