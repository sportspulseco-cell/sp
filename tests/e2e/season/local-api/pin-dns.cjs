// The ISP hijacks *.supabase.co: resolve those names to the pinned address (as tests/e2e/season/lib.mjs does).
const dns = require("node:dns");
const PIN = process.env.E2E_SUPABASE_IP || "172.64.149.246";
const real = dns.lookup;
dns.lookup = function (hostname, options, cb) {
  if (typeof options === "function") { cb = options; options = {}; }
  if (typeof hostname === "string" && /\.supabase\.co$/i.test(hostname)) {
    const all = options && options.all;
    return process.nextTick(() => (all ? cb(null, [{ address: PIN, family: 4 }]) : cb(null, PIN, 4)));
  }
  return real.call(dns, hostname, options, cb);
};
if (dns.promises) {
  const realP = dns.promises.lookup;
  dns.promises.lookup = async function (hostname, options) {
    if (typeof hostname === "string" && /\.supabase\.co$/i.test(hostname)) {
      return options && options.all ? [{ address: PIN, family: 4 }] : { address: PIN, family: 4 };
    }
    return realP.call(dns.promises, hostname, options);
  };
}
