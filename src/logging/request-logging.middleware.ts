import type {Request,Response,NextFunction} from "express";
import {randomUUID} from "node:crypto";
import {logger} from "./logger.service.js";

export function requestLogging(req:Request,res:Response,next:NextFunction){
 const requestId=randomUUID();
 const started=performance.now();
 res.setHeader("X-Request-Id",requestId);

 res.on("finish",()=>{
  const durationMs=Number((performance.now()-started).toFixed(2));
  const level=res.statusCode>=500?"error":res.statusCode>=400?"warn":"info";
  logger.event(
   "http.request",
   `${req.method} ${req.path} ${res.statusCode}`,
   level,
   {
    component:"http",
    operation:req.method
   },
   {
    requestId,
    method:req.method,
    path:req.path,
    statusCode:res.statusCode,
    durationMs,
    ip:req.ip
   }
  );
 });

 next();
}
