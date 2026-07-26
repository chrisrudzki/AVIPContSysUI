import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

// Fetches every row from AVIP_Table, ordered by created_at.
async function fetchAllReadings() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/AVIP_Table?select=*&order=created_at.asc&limit=1000000`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  if (!res.ok) throw new Error(`Supabase fetch failed: ${res.status}`);
  return res.json();
}

// Reshapes Supabase rows into { categories: [...], seriesData: { [metricKey]: [values] } }
// pulling each value out of the `data_point` jsonb column — one bar per row, no bucketing.
function rowsToBarData(rows, metrics) {
  const categories = rows.map((row) =>
    new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );

  const seriesData = {};
  metrics.forEach((metric) => {
    seriesData[metric.key] = rows.map((row) => (row.data_point ?? {})[metric.key] ?? 0);
  });

  return { categories, seriesData };
}

export default function AvipPowerBarChart({ metrics }) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const [seriesOn, setSeriesOn] = useState(metrics.map(() => true));
  const [zoomEnabled, setZoomEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const dataRef = useRef({ categories: [], seriesData: {} });
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

  async function fetchAndRender() {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchAllReadings();
      dataRef.current = rowsToBarData(rows, metrics);

      if (chartInstance.current) {
        chartInstance.current.setOption({
          xAxis: { data: dataRef.current.categories },
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
      xAxis: { type: 'category', data: [] },
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
      <button onClick={fetchAndRender}>Refresh Data</button>

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

      <div className="box">
        <div ref={chartRef} style={{ width: '100%', height: 395 }} />
      </div>
    </div>
  );
}