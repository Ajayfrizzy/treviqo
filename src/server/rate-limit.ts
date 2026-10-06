import "server-only";
import { createHash } from "node:crypto";
import { getRedis } from "@/server/redis/client";
export const limits={upload:[20,600],signed_access:[60,600],write:[120,60],read:[120,60]} as const;
export class WorkflowLimit extends Error { constructor(public retryAfter:number){super("Too many requests. Please wait before trying again.");} }
export async function limitWorkflow(userId:string,scope:keyof typeof limits) {
  const [maximum,seconds]=limits[scope];
  const key=`treviqo:limit:${scope}:${createHash("sha256").update(userId).digest("hex")}`;
  const result=await getRedis().eval(`local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return {n,redis.call('TTL',KEYS[1])}`,1,key,seconds) as number[];
  if(Number(result[0])>maximum)throw new WorkflowLimit(Math.max(1,Number(result[1])));
}
export function limitResponse(error:unknown) {return error instanceof WorkflowLimit?Response.json({error:error.message},{status:429,headers:{"Cache-Control":"private, no-store","Retry-After":String(error.retryAfter)}}):null;}
