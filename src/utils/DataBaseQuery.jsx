const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

// Gets every row from Supabase databases table Cont_Sys_Table, in cronological order
export async function fetchAllReadings() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/Cont_Sys_Table?select=*&order=created_at.asc&limit=1000000`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  if (!res.ok) throw new Error(`Supabase fetch failed: ${res.status}`);

  return res.json();
}

// Gets every row from Supabase databases table Cont_Sys_Table, in cronological order, within a given time range
export async function fetchRangedReadings(start, end) {

    const startIso = new Date(`${start}:00.000Z`).toISOString();
    const endIso = new Date(`${end}:59.999Z`).toISOString();

    console.log("start: ", startIso);
    console.log("end: ", endIso);

    const params = new URLSearchParams({
      select: '*',
      order: 'created_at.asc',
      limit: '1000000',
      'created_at': `gte.${startIso}`,
     });
  
    const url = `${SUPABASE_URL}/rest/v1/Cont_Sys_Table?${params.toString()}&created_at=lte.${endIso}`;

    const res = await fetch(url, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) throw new Error(`Supabase fetch failed: ${res.status}`);

    return res.json();
  }