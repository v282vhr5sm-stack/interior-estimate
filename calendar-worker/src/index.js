// 견적 작업실(공간의 온도) 현장 일정 → 구글/아이폰 캘린더 구독 주소 (ICS)
//  GET /<토큰>.ics → 앱이 shares 표에 올려 둔 'cal_<토큰>' 일정 묶음을 캘린더 파일로
// 구글 캘린더 "URL로 추가" / 아이폰 "구독 캘린더 추가"에 이 주소를 넣으면 자동으로 따라옴
const SUPABASE_URL = 'https://wcxowlhcneuyiwyxtisq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ydS1XaRSe8qt2kskvA_Q4A_AydWqvB6';

export default {
  async fetch(req) {
    const m = new URL(req.url).pathname.match(/^\/([a-f0-9]{40})(?:\.ics)?$/i);
    if (!m) return new Response('not found', { status: 404 });
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_share`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: 'cal_' + m[1].toLowerCase() }),
    });
    if (!r.ok) return new Response('server error', { status: 502 });
    const d = await r.json();
    if (!d || d.kind !== 'ics') return new Response('not found', { status: 404 });

    const esc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
    const enc = new TextEncoder();
    const fold = line => { // 한 줄 75바이트 넘으면 접기 (캘린더 규칙)
      const out = []; let cur = '', bytes = 0;
      for (const ch of line) { const b = enc.encode(ch).length; if (bytes + b > 73) { out.push(cur); cur = ' '; bytes = 1; } cur += ch; bytes += b; }
      out.push(cur); return out.join('\r\n');
    };
    const ymd = s => String(s).slice(0, 10).replace(/-/g, '');
    const next = s => { const t = new Date(String(s).slice(0, 10) + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };
    const ok = s => /^\d{4}-\d{2}-\d{2}/.test(String(s || ''));
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//interior-estimate//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      `X-WR-CALNAME:${esc(d.company ? `${d.company} 현장 일정` : '현장 일정')}`, 'X-WR-TIMEZONE:Asia/Seoul',
      'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'];
    for (const e of d.events || []) {
      if (!ok(e.start)) continue;
      const end = ok(e.end) && e.end >= e.start ? e.end : e.start;
      const title = `[${e.site}] ${e.name}${e.kind && e.kind !== '시공' && !String(e.name).includes(e.kind) ? ` (${e.kind})` : ''}`;
      const desc = [e.addr && `주소: ${e.addr}`, e.worker && `작업자: ${e.worker}`, e.status && `상태: ${e.status}`, e.memo].filter(Boolean).join('\n');
      lines.push('BEGIN:VEVENT', `UID:${e.id}@interior-estimate`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${ymd(e.start)}`, `DTEND;VALUE=DATE:${ymd(next(end))}`, `SUMMARY:${esc(title)}`);
      if (e.addr) lines.push(`LOCATION:${esc(e.addr)}`);
      if (desc) lines.push(`DESCRIPTION:${esc(desc)}`);
      lines.push('TRANSP:TRANSPARENT', 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return new Response(lines.map(fold).join('\r\n') + '\r\n', {
      headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'max-age=300' },
    });
  },
};
