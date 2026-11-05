import { AsyncLocalStorage } from "node:async_hooks";
/** Request-scoped IDs only: a successful response wakes committed rows. */
export const notificationWork = new AsyncLocalStorage<Set<string>>();
export function trackNotification(id: string) { notificationWork.getStore()?.add(id); }
