import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import handler from '../api/instagram-webhook.js';
process.env.INSTAGRAM_VERIFY_TOKEN = 'test-verification';
process.env.INSTAGRAM_APP_SECRET = 'test-app-secret';
process.env.INSTAGRAM_ACCOUNT_ID = 'test-account';
process.env.INSTAGRAM_ACCESS_TOKEN = 'test-access-token';
process.env.CRM_INGEST_URL = 'https://crm.example/instagram';
process.env.CRM_WEBHOOK_SECRET = 'test-crm-secret';
const endpoint = 'https://example.com/api/instagram-webhook';
const signed = (body) => new Request(endpoint, {method:'POST', headers:{'x-hub-signature-256':'sha256='+createHmac('sha256','test-app-secret').update(body).digest('hex')},body});
test('verification returns exact challenge only with correct token', async()=>{
 const good=await handler.fetch(new Request(endpoint+'?hub.mode=subscribe&hub.verify_token=test-verification&hub.challenge=1234'));
 assert.equal(good.status,200);assert.equal(await good.text(),'1234');
 assert.equal((await handler.fetch(new Request(endpoint+'?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1234'))).status,403);
});
test('rejects unsigned and tampered payloads',async()=>{
 assert.equal((await handler.fetch(new Request(endpoint,{method:'POST',body:'{}'}))).status,401);
 const r=signed('{}');assert.equal((await handler.fetch(new Request(endpoint,{method:'POST',headers:r.headers,body:'{"tampered":true}'}))).status,401);
});
test('accepts authenticated notification without logging private content',async()=>{
 const logs=[];const original=console.info;const originalFetch=global.fetch;const forwards=[];
 console.info=(value)=>logs.push(value);
 global.fetch=async(url,options={})=>{
  if(String(url).startsWith('https://graph.instagram.com/')) return new Response(JSON.stringify({username:'empresa_teste',name:'Empresa Teste'}),{status:200});
  forwards.push({url:String(url),options});return new Response('{}',{status:200});
 };
 try{
  const response=await handler.fetch(signed(JSON.stringify({object:'instagram',entry:[{id:'test-account',messaging:[{sender:{id:'private-sender'},recipient:{id:'test-account'},timestamp:123,message:{mid:'mid.1',text:'private-text'}}]},{id:'another-account',messaging:[{}]}]})));
  assert.equal(response.status,200);
  assert.deepEqual(JSON.parse(logs[0]),{event:'instagram_webhook_received',messages:1,changes:0});
  assert.ok(!logs.join('').includes('private-'));
  assert.equal(forwards.length,1);
  const sent=JSON.parse(forwards[0].options.body);assert.equal(sent.messages[0].username,'empresa_teste');assert.equal(sent.messages[0].text,'private-text');
  assert.equal(forwards[0].options.headers['x-instagram-webhook-secret'],'test-crm-secret');
 }finally{console.info=original;global.fetch=originalFetch;}
});
test('rejects signed malformed JSON and wrong event schema',async()=>{
 assert.equal((await handler.fetch(signed('{'))).status,400);
 assert.equal((await handler.fetch(signed('null'))).status,400);
});
test('rejects payloads larger than the configured limit',async()=>{
 assert.equal((await handler.fetch(signed('x'.repeat(1024*1024+1)))).status,413);
});
