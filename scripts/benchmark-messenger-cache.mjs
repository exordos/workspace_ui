/**
 * Synthetic cache-only benchmark. Never opens the app or a user's IndexedDB.
 * node scripts/benchmark-messenger-cache.mjs [--ref <git-ref>] [--serve <port>]
 * The optional server exposes window.runBenchmark() for native-browser runs.
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as childProcess from "node:child_process";
import * as util from "node:util";
import * as url from "node:url";
import * as http from "node:http";
import * as crypto from "node:crypto";
import * as ts from "typescript";

const execFile = util.promisify(childProcess.execFile);
const repo = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const ref = args.includes("--ref") ? args[args.indexOf("--ref") + 1] : null;
const port = args.includes("--serve") ? Number(args[args.indexOf("--serve") + 1]) : null;
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "workspace-cache-bench-"));
const files = ["workspace-messenger-cache-db", "workspace-messenger-cache-db-upgrade.lib"];
const sourceHash = crypto.createHash("sha256");
for (const name of files) {
  const relative = `packages/web/src/shared/lib/${name}.ts`;
  let source = ref
    ? (await execFile("git", ["show", `${ref}:${relative}`], { cwd: repo })).stdout
    : await fs.readFile(path.join(repo, relative), "utf8");
  sourceHash.update(source);
  source = source
    .replace('"./logger"', '"./logger.mjs"')
    .replace(
      '"./workspace-messenger-cache-db-upgrade.lib"',
      '"./workspace-messenger-cache-db-upgrade.lib.mjs"',
    );
  await fs.writeFile(
    path.join(directory, `${name}.mjs`),
    ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    }).outputText,
  );
}
await fs.writeFile(
  path.join(directory, "logger.mjs"),
  "export function createLogger() { return {warn(...args) { throw new Error(JSON.stringify(args)); }}; }",
);
const sourceRef = ref ?? "working-tree";
const harness = `
import * as cache from './workspace-messenger-cache-db.mjs';
const conversations = ['stream:stream-test', 'topic:stream-test:topic-test'];
const request = (request) => new Promise((resolve,reject) => {request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
function message(i, historical=false) {
  return {uuid: (historical?'old-':'new-')+String(i).padStart(6,'0'), conversationId:conversations[1],streamUuid:'stream-test',topicUuid:'topic-test',payload:{kind:'markdown',content:'Synthetic benchmark payload'},read:false,createdAt:new Date(Date.UTC(2026,historical?8:9,20,0,0,i)).toISOString()};
}
async function seed(owner,count) {
  const date='2026-10-20T00:00:00.000Z';
  await cache.writeMessengerCatalogCache(owner,{streams:[{uuid:'stream-test',updatedAt:date}],topics:[{uuid:'topic-test',streamUuid:'stream-test',updatedAt:date}],conversations:conversations.map((id,i)=>({id,streamUuid:'stream-test',...(i?{topicUuid:'topic-test'}:{}),updatedAt:date}))});
  const messages=Array.from({length:count},(_,i)=>message(i));
  for (const id of conversations) await cache.writeConversationMessagePage(owner,id,{messages});
}
function instrument() {
  const counts={transactions:0,bucketRows:0,messageGets:0,cursorPuts:0};
  const tx=IDBDatabase.prototype.transaction;
  const all=IDBIndex.prototype.getAll;
  const get=IDBObjectStore.prototype.get;
  const put=IDBObjectStore.prototype.put;
  IDBDatabase.prototype.transaction=function(...args) {counts.transactions++;return tx.apply(this,args);};
  IDBIndex.prototype.getAll=function(...args) {const r=all.apply(this,args);if(this.objectStore.name==='messageBuckets')r.addEventListener('success',()=>{counts.bucketRows+=r.result.length;});return r;};
  IDBObjectStore.prototype.get=function(...args) {if(this.name==='messages')counts.messageGets++;return get.apply(this,args);};
  IDBObjectStore.prototype.put=function(...args) {if(this.name==='realtimeCursor')counts.cursorPuts++;return put.apply(this,args);};
  return {counts,restore() {IDBDatabase.prototype.transaction=tx;IDBIndex.prototype.getAll=all;IDBObjectStore.prototype.get=get;IDBObjectStore.prototype.put=put;}};
}
async function created(owner,messages,batch) {
  if(batch && cache.writeRealtimeMessages) {await cache.writeRealtimeMessages(owner,messages,100);return;}
  for(let i=0;i<messages.length;i++) {
    const message=messages[i];
    if(cache.writeRealtimeMessages) await cache.writeRealtimeMessages(owner,[message]);
    else await Promise.all(conversations.map(async(id)=>{await cache.writeConversationMessagePage(owner,id,{messages:[message]});await cache.applyMessengerMessagePointerCache(owner,message);}));
    await cache.writeRealtimeCursor(owner,i+1);
  }
}
export async function runBenchmark(repeats=5) {
  const results=[];
  for (const name of ['fresh-catch-up','historical-catch-up','fresh-live','historical-live','read-boundary','cold-catch-up','single-live']) {
    const samples=[];
    let operations, final;
    for(let iteration=0;iteration<=repeats;iteration++) {
      await cache.deleteWorkspaceMessengerCacheDatabase();
      const historical=name.startsWith('historical');
      const warm=historical||name==='read-boundary'||name==='single-live'?500:name==='cold-catch-up'?0:400;
      const size=name==='single-live'?1:100;
      const expected=Math.min(500,warm+size);
      const owner='synthetic-owner';
      await seed(owner,warm);
      const measured=iteration===0?instrument():null;
      const start=performance.now();
      if(name==='read-boundary') {
        for(let i=400;i<500;i++){const m=message(i);await cache.advanceMessengerReadBoundaryCache({ownerKey:owner,streamUuid:'stream-test',topicUuid:'topic-test',createdAt:m.createdAt,messageUuid:m.uuid,epochVersion:i});}
      } else await created(owner,Array.from({length:size},(_,i)=>message(warm+i,historical)),name.endsWith('catch-up'));
      const duration=performance.now()-start;
      if(measured) {operations=structuredClone(measured.counts);measured.restore();}
      else samples.push(duration);
      const db=await cache.openWorkspaceMessengerCacheDb();
      const bodies=await request(db.transaction('messages').objectStore('messages').index('byOwner').count(owner));
      const windows=await Promise.all(conversations.map(id=>cache.readConversationMessageWindow(owner,id)));
      const cursor=(await cache.readMessengerCatalogCache(owner)).realtimeCursor;
      final={bodies,windowSizes:windows.map(w=>w.messages.length),cursor:cursor?.epochVersion??null};
      if(cache.writeRealtimeMessages && bodies!==expected)throw new Error('Unexpected body count: '+bodies);
      if(windows.some(w=>w.messages.length!==expected))throw new Error('Unexpected cached window size');
      if(name!=='read-boundary' && cursor?.epochVersion!==size)throw new Error('Unexpected cursor');
    }
    const sorted=[...samples].sort((a,b)=>a-b);
    results.push({name,operations,final,samplesMs:samples,medianMs:sorted[Math.floor(sorted.length/2)],minMs:sorted[0],maxMs:sorted.at(-1)});
  }
  await cache.deleteWorkspaceMessengerCacheDatabase();
  return {sourceRef:${JSON.stringify(sourceRef)},sourceSha256:${JSON.stringify(sourceHash.digest("hex"))},runtime:globalThis.navigator?.userAgent??'node',repeats,results};
}
`;
await fs.writeFile(path.join(directory, "harness.mjs"), harness);
if (port != null) {
  await fs.writeFile(
    path.join(directory, "index.html"),
    '<!doctype html><title>Synthetic messenger cache benchmark</title><h1>Synthetic messenger cache benchmark</h1><p>Isolated test origin. No user data.</p><script type="module">import {runBenchmark} from "./harness.mjs"; window.runBenchmark=runBenchmark;</script>',
  );
  http
    .createServer(async (request, response) => {
      const name = request.url === "/" ? "index.html" : path.basename(request.url.split("?")[0]);
      try {
        response.setHeader("Content-Type", name.endsWith("mjs") ? "text/javascript" : "text/html");
        response.end(await fs.readFile(path.join(directory, name)));
      } catch {
        response.writeHead(404).end();
      }
    })
    .listen(port, "127.0.0.1", () =>
      console.log(`Benchmark ${sourceRef}: http://127.0.0.1:${port}`),
    );
} else {
  await import("fake-indexeddb/auto");
  try {
    const { runBenchmark } = await import(url.pathToFileURL(path.join(directory, "harness.mjs")));
    console.log(JSON.stringify(await runBenchmark(), null, 2));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}
