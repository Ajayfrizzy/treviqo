import { setTimeout } from "node:timers/promises";
import { jobRunner } from "@/server/jobs/runner";
import { getDb } from "@/server/db/client";
import { getRedis } from "@/server/redis/client";
const shutdown=new AbortController();
for(const signal of ["SIGTERM","SIGINT"])process.on(signal,()=>shutdown.abort());
async function main(){
  do {
    try {await jobRunner().tick();}catch{console.error("Worker dependencies unavailable; retrying.");if(process.argv.includes("--once"))process.exitCode=1;}
    if(process.argv.includes("--once"))break;
    try {await setTimeout(10000,undefined,{signal:shutdown.signal});}catch{break;}
  }while(!shutdown.signal.aborted);
}
try {await main();} finally {await getDb().$disconnect();getRedis().disconnect();}
