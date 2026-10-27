// Feed de calendario (ICS) con las obras de TPL, para suscribirse desde Google Calendar.
// Público y solo lectura: muestra lo mismo que la pestaña Obras de las apps.
const URL_DB = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "sb_publishable_xUj53gV1c6xo6Y6t52R-Vw_hTS-P29s";
const ESTADOS: Record<string, string> = { senada: "Señada", curso: "En curso", terminada: "Terminada" };

type Obra = { id: string; fecha: string; dias: number; hora: string | null; hora_fin: string | null; cliente: string; tel: string | null;
  dir: string | null; cuadrilla: string | null; estado: string; pres_num: string | null; notas: string | null; cargo: string | null; updated_at: string };

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// Líneas de más de 75 bytes se parten (RFC 5545)
function fold(line: string) {
  const out: string[] = []; let cur = "", len = 0;
  for (const ch of line) { const b = new TextEncoder().encode(ch).length; if (len + b > 74) { out.push(cur); cur = " "; len = 1; } cur += ch; len += b; }
  return [...out, cur].join("\r\n");
}
// Días de trabajo: desde la fecha de inicio, salteando domingos (igual que en las apps)
function dias(o: Obra) {
  const d = new Date(o.fecha + "T00:00:00Z"), out = [new Date(d)], n = Math.min(60, Math.max(1, o.dias || 1));
  while (out.length < n) { d.setUTCDate(d.getUTCDate() + 1); if (d.getUTCDay() !== 0) out.push(new Date(d)); }
  return out;
}
// Argentina no tiene horario de verano: hora local = UTC-3
function utc(dia: Date, hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const t = new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate(), h + 3, m));
  return `${ymd(t)}T${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}00Z`;
}

Deno.serve(async () => {
  const r = await fetch(`${URL_DB}/rest/v1/obras?select=*&fecha=gte.${new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10)}&order=fecha`,
    { headers: { apikey: KEY } });
  const obras: Obra[] = r.ok ? await r.json() : [];
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TPL//Obras//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Obras TPL", "X-WR-TIMEZONE:America/Argentina/Buenos_Aires", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"];
  for (const o of obras) {
    const ds = dias(o);
    const det = [`Estado: ${ESTADOS[o.estado] ?? o.estado}`, o.cuadrilla && `Cuadrilla: ${o.cuadrilla}`, o.tel && `Tel: ${o.tel}`,
      o.pres_num && `Presupuesto N° ${o.pres_num}`, o.notas, o.cargo && `Cargó: ${o.cargo}`].filter(Boolean).join("\n");
    ds.forEach((d, i) => {
      L.push("BEGIN:VEVENT", `UID:${o.id}-${ymd(d)}@tpl-obras`, `DTSTAMP:${stamp}`);
      if (o.hora) {
        const ini = o.hora.slice(0, 5), fin = (o.hora_fin ?? "").slice(0, 5) || `${pad(Math.min(23, Number(ini.slice(0, 2)) + 2))}:${ini.slice(3)}`;
        L.push(`DTSTART:${utc(d, ini)}`, `DTEND:${utc(d, fin)}`);
      } else {
        const n = new Date(d); n.setUTCDate(n.getUTCDate() + 1);
        L.push(`DTSTART;VALUE=DATE:${ymd(d)}`, `DTEND;VALUE=DATE:${ymd(n)}`);
      }
      L.push(fold(`SUMMARY:${esc(`${o.estado === "terminada" ? "✓ " : ""}${o.cliente}${o.cuadrilla ? " · " + o.cuadrilla : ""}${ds.length > 1 ? ` (día ${i + 1}/${ds.length})` : ""}`)}`));
      if (o.dir) L.push(fold(`LOCATION:${esc(o.dir)}`));
      if (det) L.push(fold(`DESCRIPTION:${esc(det)}`));
      L.push("END:VEVENT");
    });
  }
  L.push("END:VCALENDAR");
  return new Response(L.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="obras-tpl.ics"', "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" },
  });
});
