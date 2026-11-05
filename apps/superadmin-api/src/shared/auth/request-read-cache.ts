import {AsyncLocalStorage} from "node:async_hooks";

const storage=new AsyncLocalStorage<WeakMap<object,Map<string,Promise<unknown>>> | null>();
/** Only GET/HEAD requests share repeated authorization reads. Mutations and
 * background work always read fresh; no cache survives an HTTP request. */
export function withRequestReads<T>(method:string,run:()=>T):T {
  return storage.run(method==="GET" || method==="HEAD"?new WeakMap():null,run);
}
export function readOnce<T>(database:object,key:string,read:()=>Promise<T>):Promise<T> {
  const store=storage.getStore();
  if(!store)return read();
  let entries=store.get(database);
  if(!entries){entries=new Map();store.set(database,entries);}
  const existing=entries.get(key);if(existing)return existing as Promise<T>;
  const pending=Promise.resolve().then(read);
  entries.set(key,pending);
  void pending.catch(()=>{if(entries!.get(key)===pending)entries!.delete(key);});
  return pending;
}
