import * as echarts from 'echarts';

import { useEffect, useRef, useState } from 'react';
import { fetchAllReadings, fetchRangedReadings } from './utils/DataBaseQuery.jsx';

// Puts Database rows into the format { [metricKey]: [[timestamp_ms, value], ...] }
function rowsToBarData(rows, metrics) {
  const seriesData = {};

  // sums all varibles that are not totalPower
  const summableMetrics = metrics.filter((m) => m.key !== 'totalPower');

  const rowsWithTotal = rows.map((row) => {
    const dataPoint = row.data_point ?? {};
    const total = summableMetrics.reduce(
      (sum, m) => sum + (dataPoint[m.key] ?? 0),
      0
    );
    return { row, dataPoint, total };
  });

  const filteredRows = rowsWithTotal.filter(({ total }) => total !== 0);

  // put all varibles into the seriesData object for the chart to use
  metrics.forEach((metric) => {
    if (metric.key === 'totalPower') {
      seriesData[metric.key] = filteredRows.map(({ row, total }) => [
        new Date(row.created_at).getTime(),
        total
      ]);
    } else {
      seriesData[metric.key] = filteredRows.map(({ row, dataPoint }) => [
        new Date(row.created_at).getTime(),
        dataPoint[metric.key] ?? 0
      ]);
    }
  });

  return { seriesData };
}

// Displays all Control System power data from the database in a bar chart
export default function AvipPowerBarChart({ metrics, drawRange, deleteRange }) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const [seriesOn, setSeriesOn] = useState(metrics.map(() => true));
  const [zoomEnabled, setZoomEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const dataRef = useRef({ seriesData: {} });
  const zoomRef = useRef(null);

  // update chart drawing
  function buildSeries() {
    const { seriesData } = dataRef.current;
    return metrics.map((metric) => ({
      name: metric.name,
      type: 'bar',
      data: seriesData[metric.key] ?? [],
      itemStyle: { color: metric.color }
    }));
  }

  // check for new chart parameters in user input for update
  async function fetchAndRender() {
    setLoading(true);
    setError(null);

    try {
      let rows;
      if (drawRange.allTime == false){
        console.log("start: ", drawRange.start, " end: ", drawRange.end);
        rows = await fetchRangedReadings(drawRange.start, drawRange.end);
        console.log("got ranged rows");
      }else{
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

  // initalize chart for the first time
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
    
  }, []);

  // draw chart for first time
  useEffect(() => {
    fetchAndRender();
    
  }, []);


  //toggle zoom on and off for the chart
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
  
  // toggle a specific series on or off in the chart 
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

      <div style={{ position: "absolute" }} className="box">
        <div ref={chartRef} style={{ width: '100%', height: 395 }} />
      </div>
    </div>
  );
}
