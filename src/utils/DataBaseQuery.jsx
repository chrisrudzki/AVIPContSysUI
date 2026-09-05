const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

// Fetches every row from AVIP_Table, ordered by created_at.
export async function fetchAllReadings() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/Cont_Sys_Table?select=*&order=created_at.asc&limit=1000000`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  if (!res.ok) throw new Error(`Supabase fetch failed: ${res.status}`);

  // console.log("WORKED HERE!", await res.json());


  return res.json();
}

export async function fetchRangedReadings(start, end) {
    // A bare date like "2026-07-05" is midnight UTC, which would exclude
    // everything on the end date after 00:00. Push end to the end of that
    // day so the range is inclusive of the whole end date.
    // const startIso = new Date(`${start}T00:00:00.000Z`).toISOString();
    // const endIso = new Date(`${end}T23:59:59.999Z`).toISOString();

    // WORKING HERE 

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
    // URLSearchParams can't hold two values under the same key, so add
    // the second created_at filter manually.
    const url = `${SUPABASE_URL}/rest/v1/Cont_Sys_Table?${params.toString()}&created_at=lte.${endIso}`;

    const res = await fetch(url, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) throw new Error(`Supabase fetch failed: ${res.status}`);

    console.log("ALL ROWSS");
    // const data = await res.json();
    console.log("just worked!!");


    return res.json();
  }