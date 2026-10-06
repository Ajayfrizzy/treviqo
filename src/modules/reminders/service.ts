import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { exitService } from "@/modules/exits/service";
import { financeService } from "@/modules/finance/service";
import { DocumentError } from "@/modules/documents/validation";
import { DAY, reminderCandidates, reminderVisible } from "./rules";
type Tx=Prisma.TransactionClient;
export const reminderCommand=z.object({id:z.string().uuid(),version:z.number().int().min(0),action:z.enum(["snooze","dismiss"])}).strict();
export function reminderService(db:PrismaClient=getDb()) {
  async function candidates(tx:Tx,userId:string,exitId:string,now:Date) {
    const exit=await exitService(db).readInTransaction(tx,userId,exitId);
    const finance=await financeService(db).readInTransaction(tx,userId,exitId);
    return {exit,items:reminderCandidates(exit,finance.pension,now)};
  }
  return {
    // Worker-only entry point. Rechecks database ownership and all source evidence in-transaction.
    async reconcile(userId:string,exitId:string,now=new Date()) {
      return db.$transaction(async tx=>{
        await tx.$queryRaw`SELECT "id" FROM "ExitCase" WHERE "id"=${exitId} AND "userId"=${userId} FOR UPDATE`;
        const {exit,items}=await candidates(tx,userId,exitId,now);
        const saved=await tx.reminder.findMany({where:{userId,exitCaseId:exitId}});
        const audit=async(id:string,action:"reminder_created"|"reminder_changed"|"reminder_resolved")=>tx.auditEvent.create({data:{userId,employmentId:exit.employmentId,exitCaseId:exitId,reminderId:id,action}});
        for(const item of items) {
          const previous=saved.find(row=>row.key===item.key);
          if(!previous){const row=await tx.reminder.create({data:{userId,exitCaseId:exitId,key:item.key,kind:item.kind,fingerprint:item.fingerprint,dueAt:item.dueAt}});await audit(row.id,"reminder_created");}
          else if(previous.fingerprint!==item.fingerprint||previous.state==="resolved") {await tx.reminder.update({where:{id:previous.id},data:{kind:item.kind,fingerprint:item.fingerprint,dueAt:item.dueAt,state:"active",snoozedUntil:null,version:{increment:1}}});await audit(previous.id,"reminder_changed");}
        }
        for(const row of saved)if(row.state!=="resolved"&&!items.some(item=>item.key===row.key)){await tx.reminder.update({where:{id:row.id},data:{state:"resolved",snoozedUntil:null,version:{increment:1}}});await audit(row.id,"reminder_resolved");}
      },{isolationLevel:"Serializable"});
    },
    async list(userId:string,now=new Date()) {
      if(!userId)throw new DocumentError("Sign in to view reminders.",401);
      return db.$transaction(async tx=>{
        // Group by owned cases so a resolved/snoozed backlog cannot conceal newer cases.
        const exits=await tx.exitCase.findMany({where:{userId},select:{id:true},orderBy:{id:"asc"}});
        const result:{id:string;version:number;kind:string;title:string;message:string;href:string;dueAt:string}[]=[];
        for(const exit of exits){const saved=await tx.reminder.findMany({where:{userId,exitCaseId:exit.id}});if(!saved.length)continue;
          const {items}=await candidates(tx,userId,exit.id,now);
          for(const row of saved){const item=items.find(item=>item.key===row.key);if(item&&reminderVisible(row,item,now))result.push({id:row.id,version:row.version,kind:item.kind,title:item.title,message:item.message,href:item.href,dueAt:item.dueAt.toISOString()});}
        }
        return result.sort((a,b)=>a.dueAt.localeCompare(b.dueAt)||a.id.localeCompare(b.id));
      },{isolationLevel:"RepeatableRead"});
    },
    async command(userId:string,raw:unknown,now=new Date()) {
      if(!userId)throw new DocumentError("Sign in to manage reminders.",401);
      const input=reminderCommand.parse(raw);
      await db.$transaction(async tx=>{
        const row=await tx.reminder.findFirst({where:{id:input.id,userId,exitCase:{userId,employment:{userId}}}});
        if(!row)throw new DocumentError("Reminder not found.",404);
        const {exit,items}=await candidates(tx,userId,row.exitCaseId,now);const current=items.find(item=>item.key===row.key);
        if(row.version!==input.version||!current||current.fingerprint!==row.fingerprint||!reminderVisible(row,current,now))throw new DocumentError("This reminder changed. Refresh before trying again.",409);
        const changed=await tx.reminder.updateMany({where:{id:row.id,userId,version:input.version},data:{state:input.action==="dismiss"?"dismissed":"snoozed",snoozedUntil:input.action==="snooze"?new Date(now.getTime()+7*DAY):null,version:{increment:1}}});
        if(!changed.count)throw new DocumentError("This reminder changed. Refresh before trying again.",409);
        await tx.auditEvent.create({data:{userId,employmentId:exit.employmentId,exitCaseId:exit.id,reminderId:row.id,action:input.action==="dismiss"?"reminder_dismissed":"reminder_snoozed"}});
      },{isolationLevel:"Serializable"});
    },
  };
}
