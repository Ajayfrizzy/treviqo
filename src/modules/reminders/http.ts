import "server-only";
import { getCurrentUser } from "@/modules/auth/session";
import { sameOrigin, readSmallBody } from "@/modules/auth/request";
import { limitWorkflow, limitResponse } from "@/server/rate-limit";
import { workerHealthy } from "@/server/jobs/health";
import { DocumentError } from "@/modules/documents/validation";
import { ZodError } from "zod";
import { reminderService } from "./service";
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});
export async function reminderRequest(request:Request) {
  try {
    const user=await getCurrentUser();if(!user)throw new DocumentError("Sign in to view reminders.",401);
    const service=reminderService();
    if(request.method==="GET") await limitWorkflow(user.id,"read");
    if(request.method!=="GET") {
      if(!sameOrigin(request))throw new DocumentError("Request rejected.",403);
      await limitWorkflow(user.id,"write");
      if(request.headers.get("content-type")?.split(";")[0]!=="application/json")throw new DocumentError("Send JSON.",415);
      let input;try{input=JSON.parse(await readSmallBody(request,4096));}catch{throw new DocumentError("Invalid or oversized request.");}
      await service.command(user.id,input);
    }
    return json({reminders:await service.list(user.id),updatesAvailable:await workerHealthy().catch(()=>false)});
  }catch(error){const limited=limitResponse(error);if(limited)return limited;if(error instanceof DocumentError)return json({error:error.message},error.status);if(error instanceof ZodError)return json({error:"Check the reminder action and refresh before retrying."},422);return json({error:"Reminders could not load or save. Please retry."},503);}
}
