import { employmentPageUser } from "@/modules/employments/page-user";
import { reminderService } from "@/modules/reminders/service";
import { workerHealthy } from "@/server/jobs/health";
import { Reminders } from "@/components/reminders";
export default async function ReminderPage(){const user=await employmentPageUser();return <Reminders initial={{reminders:await reminderService().list(user.id),updatesAvailable:await workerHealthy().catch(()=>false)}}/>;}
