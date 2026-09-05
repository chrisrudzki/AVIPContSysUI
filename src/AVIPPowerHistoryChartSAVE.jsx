import * as XLSX from 'xlsx';
import * as echarts from 'echarts';

import { useEffect, useRef, useState } from 'react';
import { fetchAllReadings, fetchRangedReadings } from './utils/DataBaseQuery.jsx';

// const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
// const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

// // Fetches every row from AVIP_Table, ordered by created_at.
// async function fetchAllReadings() {
//   const res = await fetch(
//     `${SUPABASE_URL}/rest/v1/AVIP_Table?select=*&order=created_at.asc&limit=1000000`,
//     { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
//   );
//   if (!res.ok) throw new Error(`Supabase fetch failed: ${res.status}`);
//   return res.json();
// }



// Reshapes Supabase rows into { seriesData: { [metricKey]: [[timestamp_ms, value], ...] } }
// one bar per row, no bucketing, timestamp kept as an actual Date-parseable value
// so the x-axis can be type: 'time' instead of a category axis of label strings.
function rowsToBarData(rows, metrics) {
  const seriesData = {};

  // Only sum metrics that aren't "totalPower" itself, to avoid double-counting
  const summableMetrics = metrics.filter((m) => m.key !== 'totalPower');

  metrics.forEach((metric) => {
    if (metric.key === 'totalPower') {
      // Computed field: sum of all other metrics for this row
      seriesData[metric.key] = rows.map((row) => {
        const timestamp = new Date(row.created_at).getTime();
        const dataPoint = row.data_point ?? {};
        const total = summableMetrics.reduce(
          (sum, m) => sum + (dataPoint[m.key] ?? 0),
          0
        );
        return [timestamp, total];
      });
    } else {
      seriesData[metric.key] = rows.map((row) => [
        new Date(row.created_at).getTime(),
        (row.data_point ?? {})[metric.key] ?? 0
      ]);
    }
  });

  return { seriesData };
}

export default function AvipPowerBarChart({ metrics, drawRange, deleteRange }) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const [seriesOn, setSeriesOn] = useState(metrics.map(() => true));
  const [zoomEnabled, setZoomEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const dataRef = useRef({ seriesData: {} });
  const zoomRef = useRef(null);

  function buildSeries() {
    const { seriesData } = dataRef.current;
    return metrics.map((metric) => ({
      name: metric.name,
      type: 'bar',
      data: seriesData[metric.key] ?? [],
      itemStyle: { color: metric.color }
    }));
  }


  // Fetches only rows whose created_at falls within [start, end], inclusive.
// start/end are expected to be date strings like "2026-07-05" (the shape
// DateRangePicker produces via <input type="date">). Supabase's REST API
// (PostgREST) supports gte./lte. filters directly as query params.
// async function fetchRangedReadings(start, end) {
//     // A bare date like "2026-07-05" is midnight UTC, which would exclude
//     // everything on the end date after 00:00. Push end to the end of that
//     // day so the range is inclusive of the whole end date.
//     // const startIso = new Date(`${start}T00:00:00.000Z`).toISOString();
//     // const endIso = new Date(`${end}T23:59:59.999Z`).toISOString();

//     // WORKING HERE 

//     const startIso = new Date(`${start}:00.000Z`).toISOString();
//     const endIso = new Date(`${end}:59.999Z`).toISOString();

//     console.log("start: ", startIso);
//     console.log("end: ", endIso);

//     const params = new URLSearchParams({
//       select: '*',
//       order: 'created_at.asc',
//       limit: '1000000',
//       'created_at': `gte.${startIso}`,
//      });
//     // URLSearchParams can't hold two values under the same key, so add
//     // the second created_at filter manually.
//     const url = `${SUPABASE_URL}/rest/v1/AVIP_Table?${params.toString()}&created_at=lte.${endIso}`;

//     const res = await fetch(url, {
//       headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
//     });
//     if (!res.ok) throw new Error(`Supabase fetch failed: ${res.status}`);

//     console.log("ALL ROWS");
//     // const data = await res.json();
//     // console.log(data);

//     return res.json();
//   }

  async function fetchAndRender() {
    setLoading(true);
    setError(null);
    try {
      // let rows = await fetchAllReadings();

      let rows;
      if (drawRange.allTime == false){
        console.log("start: ", drawRange.start, " end: ", drawRange.end);
        rows = await fetchRangedReadings(drawRange.start, drawRange.end);
        console.log("got ranged rows");
      }else{
        // console.log("here2");
        rows = await fetchAllReadings();
      }
      
      dataRef.current = rowsToBarData(rows, metrics);

      if (chartInstance.current) {
        chartInstance.current.setOption({
          series: buildSeries()
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // init chart once
  useEffect(() => {
    const chart = echarts.init(chartRef.current);
    chartInstance.current = chart;

    chart.setOption({
      useUTC: true,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { show: false },
      toolbox: {
        feature: {
          dataZoom: { yAxisIndex: 'none' },
          restore: {},
          saveAsImage: {}
        }
      },
      grid: { top: 40, left: 50, right: 30, bottom: 80 },
      xAxis: { type: 'time' },
      yAxis: { type: 'value' },
      dataZoom: [
        { type: 'inside', start: 0, end: 100 },
        { start: 0, end: 100 }
      ],
      series: []
    });

    chart.on('datazoom', () => {
      const opt = chart.getOption();
      const dz = opt.dataZoom && opt.dataZoom[0];
      if (dz && dz.startValue != null && dz.endValue != null) {
        zoomRef.current = { startValue: dz.startValue, endValue: dz.endValue };
      }
    });

    const resize = () => chart.resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      chart.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // fetch once on mount
  useEffect(() => {
    fetchAndRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleZoom() {
    const next = !zoomEnabled;
    setZoomEnabled(next);
    zoomRef.current = null;

    if (!chartInstance.current) return;

    if (next) {
      chartInstance.current.setOption({
        dataZoom: [
          { type: 'inside', start: 0, end: 100, zoomOnMouseWheel: true, moveOnMouseWheel: true, moveOnMouseMove: true },
          { show: true, start: 0, end: 100 }
        ]
      });
    } else {
      chartInstance.current.setOption({
        dataZoom: [
          { type: 'inside', start: 0, end: 100, zoomOnMouseWheel: false, moveOnMouseWheel: false, moveOnMouseMove: false },
          { show: false, start: 0, end: 100 }
        ]
      });
    }
  }

  function toggleSeries(index) {
    const next = [...seriesOn];
    next[index] = !next[index];
    setSeriesOn(next);
    chartInstance.current.dispatchAction({
      type: next[index] ? 'legendSelect' : 'legendUnSelect',
      name: metrics[index].name
    });
  }


  return (
    <div>
      <button onClick={fetchAndRender}>Refresh Chart</button>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 8, alignItems: 'center' }}>
        {metrics.map((metric, i) => (
          <label key={metric.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={seriesOn[i]}
              onChange={() => toggleSeries(i)}
              style={{ accentColor: metric.color, cursor: 'pointer' }}
            />
            <span style={{ width: 10, height: 10, borderRadius: 2, background: metric.color, display: 'inline-block' }} />
            {metric.name}
          </label>
        ))}

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={zoomEnabled}
            onChange={toggleZoom}
            style={{ cursor: 'pointer' }}
          />
          Zoom
        </label>
      </div>

      {loading && <p style={{ fontSize: 13 }}>Loading history…</p>}
      {error && <p style={{ fontSize: 13, color: 'red' }}>Failed to load: {error}</p>}
        
        {/* style={{position:"relative"}} */}
      <div style={{ position: "absolute" }} className="box">
        <div ref={chartRef} style={{ width: '100%', height: 395 }} />
      </div>


      

    </div>
  );
}