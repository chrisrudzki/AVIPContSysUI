import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';

const powerColor = '#e34948';
const powerName = 'Power on';

import { fetchAllReadings, fetchRangedReadings } from './utils/DataBaseQuery.jsx';

function getOnIntervals(powerData) {
  const intervals = [];
  let start = null;
  for (let i = 0; i < powerData.length; i++) {
    const [time, state] = powerData[i];
    if (state === 1 && start === null) {
      start = time;
    } else if (state === 0 && start !== null) {
      intervals.push([start, time]);
      start = null;
    }
  }
  if (start !== null && powerData.length) {
    intervals.push([start, powerData[powerData.length - 1][0]]);
  }
  return intervals;
}

// Reshapes Supabase rows into the same { [metricKey]: [[timestamp_ms, value], ...] }
// shape your live AvipChart already expects — reading values out of the
// `data_point` jsonb column, keyed the same way as your MQTT payload.
function rowsToHistory(rows, metrics) {
  const history = {};
  metrics.forEach((metric) => {
    history[metric.key] = [];
  });
  history.power = [];

  // console.log("history to here");
  // print("created at: ", rows[2].created_at)
  rows.forEach((row) => {
    // if (!/[+-]\d{2}:\d{2}$|Z$/.test(row.created_at)) {
    //   console.warn('Missing timezone offset:', row.created_at);
    // }

    console.log("created at: ", row.created_at);
    let ts = new Date(row.created_at).getTime();
    // let ts = row.created_at
    // ts = ts * 1000;
    const dp = row.data_point ?? {};

    metrics.forEach((metric) => {
      history[metric.key].push([ts, dp[metric.key] ?? null]);
    });

    history.power.push([ts, (dp.pumpPower ?? 0) > 0 ? 1 : 0]);
  });

  console.log("history! :", history);

  return history;
}

export default function AvipHistoryChart({ metrics, drawRange }) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const [seriesOn, setSeriesOn] = useState(metrics.map(() => true));
  const [powerAreaOn, setPowerAreaOn] = useState(true);
  const [zoomEnabled, setZoomEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const historyRef = useRef({}); // holds fetched data for buildSeries to read

  function buildSeries(showPowerArea) {
    const history = historyRef.current;
    const onIntervals = getOnIntervals(history.power ?? []);
    const markAreaData = onIntervals.map(([s, e]) => [{ xAxis: s }, { xAxis: e }]);

    console.log("historyRef: ", historyRef.current);

    console.log("history: ", history);

    return metrics.map((metric, i) => ({
      name: metric.name,
      type: 'line',
      large: true,                  // ← enables the WebGL-backed rendering path
      largeThreshold: 5000,         // ← only switches to "large" mode once a series exceeds this many points
      progressive: 5000,            // ← renders in chunks of this size instead of all at once
      progressiveThreshold: 10000,  // ← only uses progressive rendering above this point count
      smooth: false,                // 
      symbol: 'none',
      lineStyle: { width: 2, color: metric.color },
      itemStyle: { color: metric.color },
      data: history[metric.key] ?? [],
      markArea: (i === 0 && showPowerArea) ? {
        silent: true,
        itemStyle: { color: powerColor, opacity: 0.08 },
        label: { show: false },
        data: markAreaData
      } : { data: [] }
    }));
  }

  async function refreshData() {
  setLoading(true);
  setError(null);
  try {
    // console.log("here 0");

    let rows;
    if (drawRange.allTime == false){
      console.log("start: ", drawRange.start, " end: ", drawRange.end);
      rows = await fetchRangedReadings(drawRange.start, drawRange.end);
      console.log("got ranged rows");
    }else{
      // console.log("here2");
      rows = await fetchAllReadings();
    }


    console.log("in here ", rows);

    historyRef.current = rowsToHistory(rows, metrics);
    chartInstance.current.setOption({ series: buildSeries(powerAreaOn) });

  } catch (err) {
    // console.log("hero")
    setError(err.message);
  } finally {
    setLoading(false);
  }

}

// in the JSX, alongside your other toggles:
{/* <button onClick={refreshData}>Refresh Data</button> */}

  // init chart once
  useEffect(() => {
    const chart = echarts.init(chartRef.current);
    chartInstance.current = chart;

    chart.setOption({
      useUTC: true,
      tooltip: {
        trigger: 'axis',
        position: (pt) => [pt[0], '10%']
      },
      legend: { show: false },
      toolbox: {
        feature: {
          dataZoom: { yAxisIndex: 'none' },
          restore: {},
          saveAsImage: {}
        }
      },
      grid: { top: 40, left: 50, right: 30, bottom: 80 },
      xAxis: { type: 'time', boundaryGap: false },
      yAxis: { type: 'value', boundaryGap: [0, '100%'] },
      dataZoom: [
        { type: 'inside', start: 0, end: 100 },
        { start: 0, end: 100 }
      ],
      series: []
    });

    const resize = () => chart.resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      chart.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // fetch once on mount HERE!!!
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchAllReadings()
      .then((rows) => {
        if (cancelled) return;
        historyRef.current = rowsToHistory(rows, metrics);

        // console.log(rows);
        // console.log("Rows:", rows.length);

        if (chartInstance.current) {
          chartInstance.current.setOption({
            series: buildSeries(powerAreaOn)
          });
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleZoom() {
    const next = !zoomEnabled;
    setZoomEnabled(next);
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

  function togglePowerArea() {
    const next = !powerAreaOn;
    setPowerAreaOn(next);
    chartInstance.current.setOption({ series: buildSeries(next) });
  }

  return (
    <div>

    <button onClick={refreshData}>Refresh Chart</button>
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
            checked={powerAreaOn}
            onChange={togglePowerArea}
            style={{ accentColor: powerColor, cursor: 'pointer' }}
          />
          <span style={{ width: 10, height: 10, borderRadius: 2, background: powerColor, opacity: 0.4, display: 'inline-block' }} />
          {powerName}
        </label>

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

      <div style={{ position: "absolute", top: "105px"}} className="box">
        <div ref={chartRef} style={{ width: '100%', height: 395 }} />
      </div>
    </div>
  );
}
