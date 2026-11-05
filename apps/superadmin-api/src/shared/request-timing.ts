import {randomUUID} from "node:crypto";
import {performance} from "node:perf_hooks";
import {Logger,type CallHandler,type ExecutionContext,type NestInterceptor} from "@nestjs/common";
import type {Request,Response,NextFunction} from "express";
import {tap} from "rxjs/operators";

const log=new Logger("RequestTiming");
export function requestTiming(req:Request,res:Response,next:NextFunction) {
 const start=performance.now();const requestId=randomUUID();
 res.locals.requestStartedAt=start;res.setHeader("X-Request-Id",requestId);
 res.on("finish",()=>{
  const durationMs=Math.round(performance.now()-start);
  if(durationMs>=1000 || res.statusCode>=500)log.warn(JSON.stringify({requestId,method:req.method,route:req.route?.path ?? "unmatched",status:res.statusCode,durationMs}));
 });
 next();
}
export class RequestTimingInterceptor implements NestInterceptor {
 intercept(context:ExecutionContext,next:CallHandler) {
  const res=context.switchToHttp().getResponse<Response>();
  const mark=()=>{if(!res.headersSent && typeof res.locals.requestStartedAt==="number")res.setHeader("Server-Timing",`app;dur=${(performance.now()-res.locals.requestStartedAt).toFixed(1)}`);};
  return next.handle().pipe(tap({next:mark,error:mark}));
 }
}
