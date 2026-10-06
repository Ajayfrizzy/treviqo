import "server-only";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type Redis from "ioredis";
import { reminderService } from "@/modules/reminders/service";
import { getDb } from "@/server/db/client";
import { getRedis } from "@/server/redis/client";
import { HEARTBEAT, QUEUE, jobIds, popDue, retryDelay, validJob, type JobId } from "./queue";
export async function cleanExpiredSessions(db:PrismaClient,now:Date) {
  // Bounded, idempotent deletes; expiration is already enforced on every auth lookup.
  const ids=await db.authSession.findMany({where:{expiresAt:{lte:now}},select:{id:true},orderBy:[{expiresAt:"asc"},{id:"asc"}],take:500});
  await db.authSession.deleteMany({where:{id:{in:ids.map(row=>row.id)},expiresAt:{lte:now}}});
  return ids.length===500;
}
export function jobRunner(db:PrismaClient=getDb(),redis:Redis=getRedis(),clock=()=>new Date()) {
  async function perform(id:JobId,cursor:string|null) {
    if(id==="session_cleanup")return {cursor:null,more:await cleanExpiredSessions(db,clock())};
    const rows=await db.exitCase.findMany({where:cursor?{id:{gt:cursor}}:{},select:{id:true,userId:true},orderBy:{id:"asc"},take:20});
    for(const row of rows){try{await reminderService(db).reconcile(row.userId,row.id,clock());}catch(error){if(error instanceof Error&&"status"in error&&error.status===404)continue;throw error;}}
    return {cursor:rows.length===20?rows.at(-1)!.id:null,more:rows.length===20};
  }
  return {
    async tick() {
      const now=clock();
      await redis.ping(); // No dependency failure may be mistaken for successful background work.
      await db.backgroundJob.createMany({data:jobIds.map(id=>({id,dueAt:now})),skipDuplicates:true});
      await db.backgroundJob.updateMany({where:{state:"running",leaseUntil:{lte:now}},data:{state:"pending",leaseToken:null,leaseUntil:null,dueAt:now,errorCode:"lease_expired",attempts:{increment:1}}});
      const due=await db.backgroundJob.findMany({where:{id:{in:[...jobIds]},state:"pending",dueAt:{lte:now}},select:{id:true,dueAt:true}});
      // PostgreSQL is the durable outbox. Loss of Redis contents is repaired each tick.
      for(const job of due)await redis.zadd(QUEUE,job.dueAt.getTime(),job.id);
      const id=await popDue(redis,now.getTime());
      if(id&&validJob(id)) {
        const token=randomUUID();
        const claim=await db.backgroundJob.updateMany({where:{id,state:"pending",dueAt:{lte:now}},data:{state:"running",leaseToken:token,leaseUntil:new Date(now.getTime()+120000)}});
        if(claim.count) {
          const job=await db.backgroundJob.findUniqueOrThrow({where:{id}});
          try {
            const result=await perform(id,job.cursor);const end=clock();
            await db.backgroundJob.updateMany({where:{id,leaseToken:token,state:"running",leaseUntil:{gt:end}},data:{state:"pending",leaseToken:null,leaseUntil:null,cursor:result.cursor,dueAt:new Date(end.getTime()+(result.more?0:60000)),attempts:0,errorCode:null,...(!result.more?{lastSucceededAt:end}:{})}});
          }catch{
            await db.backgroundJob.updateMany({where:{id,leaseToken:token,state:"running"},data:{state:"pending",leaseToken:null,leaseUntil:null,dueAt:new Date(clock().getTime()+retryDelay(job.attempts)),attempts:{increment:1},errorCode:"job_failed"}});
          }
        }
      }
      await redis.set(HEARTBEAT,String(clock().getTime()),"EX",45);
    },
  };
}
