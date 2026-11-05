/** Legacy publisher delegates to the API so permissions, conflict validation and
 * notification behavior have one authority. Never update games directly here. */
import { handlePreflight, corsHeaders } from "../_shared/cors.ts";
Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  const headers = { ...corsHeaders, "Content-Type": "application/json" };
  if (req.method !== "POST") return new Response(JSON.stringify({error:"method_not_allowed"}), {status:405,headers});
  const api = Deno.env.get("SPORTSPULSE_API_URL");
  if (!api) return new Response(JSON.stringify({error:"publisher_unavailable",message:"Publish from the league admin app. The legacy publisher has no API configured."}), {status:503,headers});
  try {
    const upstream = await fetch(`${api.replace(/\/$/, "")}/games/publish-schedule`, {
      method:"POST", headers:{"Content-Type":"application/json",Authorization:req.headers.get("Authorization") ?? ""}, body: await req.text(),
    });
    return new Response(await upstream.text(), {status:upstream.status,headers});
  } catch {
    return new Response(JSON.stringify({error:"publisher_unavailable"}), {status:503,headers});
  }
});
