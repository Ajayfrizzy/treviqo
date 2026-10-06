import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
const db = new PrismaClient(); const emails: string[] = []; const origin = "http://127.0.0.1:3100";
async function account(page: Page) {
  const email = `intelligence-${randomUUID()}@example.test`; emails.push(email); const password = "Synthetic intelligence test passphrase";
  await page.goto("/register"); await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Password", { exact: true }).fill(password); await page.getByRole("button", { name: "Create account", exact: true }).click(); await expect(page.getByRole("status")).toContainText("Your account is ready");
  await page.goto("/sign-in"); await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Password", { exact: true }).fill(password); await page.getByRole("button", { name: "Sign in securely" }).click(); await expect(page).toHaveURL("/");
}
test.afterAll(async () => { const users = await db.user.findMany({ where: { email: { in: emails } }, select: { id: true } }); const ids = users.map(user => user.id); await db.auditEvent.deleteMany({ where: { userId: { in: ids } } }); await db.employmentDocument.deleteMany({ where: { userId: { in: ids } } }); await db.user.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect(); });
async function setup(page: Page) {
  await account(page);
  const created=await page.request.post('/api/employments',{headers:{origin},data:{employerName:'Harbour Workshop Ltd',roleTitle:'Worker',startDate:'2024-01-01'}});const job=(await created.json()).employment.id;
  const exit=await page.request.post('/api/exits',{headers:{origin},data:{employmentId:job,answers:{exitType:'resignation',lastWorkingDate:'2026-10-31',pension:'yes'}}});return {job,id:(await exit.json()).exitCase.id as string};
}
async function evidence(page: Page,job: string,type: string) {
  const uploaded=await page.request.post(`/api/documents?employmentId=${job}&documentType=${type}`,{headers:{origin,'content-type':'application/pdf','x-file-name':`${type}.pdf`},data:readFileSync(`tests/fixtures/intelligence/${type}.pdf`)});expect(uploaded.status()).toBe(201);const doc=(await uploaded.json()).document.id;
  const response=await page.request.post(`/api/documents/${doc}/extractions`,{headers:{origin},data:{mode:'ai'}});expect(response.status()).toBe(200);const run=(await response.json()).extraction;
  for(const field of run.fields as {id:string;version:number;key:string;proposedValue:string|null}[]) {
    if(field.key==='document_type')continue;
    const correction=field.key==='entries_complete'?'yes':field.key==='pay_period'?'2026-10':null;
    if(!field.proposedValue&&!correction)continue;
    expect((await page.request.patch(`/api/documents/${doc}/extractions`,{headers:{origin},data:{fieldId:field.id,version:field.version,action:correction?'correct':'confirm',...(correction?{value:correction}:{})}})).status()).toBe(200);
  }
  return {doc,run};
}
for(const width of [320,375,430])test(`settlement and pension review at ${width}px`,async({page})=>{
  test.setTimeout(90000);await page.setViewportSize({width,height:850});const {job,id}=await setup(page);
  const payslip=await evidence(page,job,'payslip');const settlement=await evidence(page,job,'final_settlement');const pension=await evidence(page,job,'pension_statement');
  await page.goto(`/exit/${id}/finance`);await expect(page.getByText('No comparison items yet.',{exact:false})).toBeVisible();
  await page.getByLabel('Item label',{exact:true}).fill('October salary');await page.getByLabel('Final-settlement document',{exact:true}).selectOption(settlement.doc);
  const gross=payslip.run.fields.find((f:{key:string})=>f.key==='gross_pay');const actual=settlement.run.fields.find((f:{key:string})=>f.key==='final_salary');
  await page.getByLabel('Reviewed amount to compare against').selectOption(gross.id);await page.getByLabel('Reviewed settlement amount',{exact:true}).selectOption(actual.id);
  if(width===320){await page.route(`**/api/exits/${id}/finance`,route=>route.fulfill({status:503,json:{error:'Temporary failure. Retry.'}}));await page.getByRole('button',{name:'Save comparison',exact:true}).click();await expect(page.getByRole('main').getByRole('alert')).toContainText('Temporary failure');await expect(page.getByLabel('Item label',{exact:true})).toHaveValue('October salary');await page.unroute(`**/api/exits/${id}/finance`);}
  await page.getByRole('button',{name:'Save comparison',exact:true}).click();await expect(page.getByRole('article',{name:'October salary'})).toContainText('Amounts consistent');
  await page.getByRole('button',{name:'Edit item',exact:true}).click();await page.getByLabel('Settlement period (YYYY-MM)',{exact:true}).fill('2026-09');await page.getByRole('button',{name:'Save comparison',exact:true}).click();await expect(page.getByRole('article',{name:'October salary'})).toContainText('Needs clarification');
  await page.getByRole('button',{name:'Start pension check'}).click();await expect(page.getByText('Waiting for statement',{exact:true})).toBeVisible();await page.getByLabel('Reviewed pension statement attempt').selectOption(pension.run.id);
  await page.getByRole('button',{name:'Save pension review'}).click();await expect(page.getByRole('button',{name:'I checked the statement — confirm match'})).toBeVisible();await page.getByRole('button',{name:'I checked the statement — confirm match'}).click();await expect(page.getByText('Confirmed by you',{exact:true})).toBeVisible();await page.reload();await expect(page.getByText('Confirmed by you',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.getByRole('heading',{name:'Pension exit verification'}).scrollIntoViewIfNeeded();await page.screenshot({path:`test-results/finance-${width}.png`});
  const changed=pension.run.fields.find((f:{key:string})=>f.key==='contribution_1_employee_amount');expect((await page.request.patch(`/api/documents/${pension.doc}/extractions`,{headers:{origin},data:{fieldId:changed.id,version:1,action:'correct',value:'NGN 21000'}})).status()).toBe(200);await page.getByRole('button',{name:'Refresh evidence'}).click();await expect(page.getByText('Evidence or exit/employment details changed after your confirmation.',{exact:false})).toBeVisible();
});
test('finance ownership, authentication, Origin and body boundaries',async({page,browser,request})=>{const {id}=await setup(page);const url=`/api/exits/${id}/finance`;expect((await request.get(url)).status()).toBe(401);expect((await request.post(url,{data:{action:'pension_start'}})).status()).toBe(401);expect((await page.request.post(url,{headers:{origin:'https://other.test'},data:{action:'pension_start'}})).status()).toBe(403);expect((await page.request.post(url,{headers:{origin},data:{action:'pension_start',userId:'injected'}})).status()).toBe(422);expect((await page.request.post(url,{headers:{origin},data:{action:'pension_start',extra:'x'.repeat(9000)}})).status()).toBe(400);const other=await browser.newContext({baseURL:origin});try{const p=await other.newPage();await account(p);expect((await other.request.get(url)).status()).toBe(404);expect((await other.request.post(url,{headers:{origin},data:{action:'pension_start'}})).status()).toBe(404);await p.goto(`/exit/${id}/finance`);await expect(p.getByRole('heading',{name:'Exit case not found'})).toBeVisible();}finally{await other.close();}});
