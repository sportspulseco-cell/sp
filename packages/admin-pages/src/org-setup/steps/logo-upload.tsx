"use client";
import { useState } from "react";
import { Input } from "@sportspulse/ui";

export type UploadLogo = (body:{contentType:string;dataBase64:string})=>Promise<string>;
export function LogoUpload({value,onChange,upload,onBusy}: {
  value:string|null;onChange:(url:string|null)=>void;upload?:UploadLogo;onBusy?:(busy:boolean)=>void;
}) {
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  async function select(file:File|undefined) {
    if(!file)return;
    setError("");
    if(!["image/png","image/jpeg","image/webp"].includes(file.type) || !file.size || file.size>2*1024*1024){setError("Choose a PNG, JPG or WebP image up to 2 MB.");return;}
    if(!upload){setError("Image upload is unavailable. Try again after refreshing.");return;}
    setBusy(true);onBusy?.(true);
    try {
      const dataBase64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]!);reader.onerror=()=>reject(new Error("Could not read that image. Try another file."));reader.readAsDataURL(file);});
      onChange(await upload({contentType:file.type,dataBase64}));
    }catch(e){setError(e instanceof Error?e.message:"Upload failed. Choose the image to retry.");}
    finally{setBusy(false);onBusy?.(false);}
  }
  return <div className="space-y-3">
    <Input aria-label="Upload league logo" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{void select(e.target.files?.[0]);e.target.value="";}}/>
    {busy ? <p role="status" className="text-sm text-fg-muted">Uploading logo...</p>:null}
    {error ? <p role="alert" className="text-sm text-fg">{error}</p>:null}
    {value ? <div className="flex items-center gap-3"><img src={value} alt="League logo preview" className="h-16 w-16 rounded-md border border-border object-contain"/><button type="button" disabled={busy} className="text-sm underline" onClick={()=>onChange(null)}>Remove logo</button></div>:null}
    <details><summary className="cursor-pointer text-xs text-fg-muted">Use an existing image link</summary><Input aria-label="League logo URL" type="url" value={value ?? ""} disabled={busy} onChange={e=>onChange(e.target.value || null)} placeholder="https://"/></details>
  </div>;
}
