import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';

const powerColor = '#e34948';
const powerName = 'Power on';

const RANGES = [
  { key: 'day', label: 'Day', ms: 24 * 3600 * 1000 },
  { key: 'week', label: 'Week', ms: 7 * 24 * 3600 * 1000 },
  { key: 'month', label: 'Month', ms: 30 * 24 * 3600 * 1000 },
  { key: 'year', label: 'Year', ms: 365 * 24 * 3600 * 1000 },
  { key: 'all', label: 'All time', ms: null }
];

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

// Finds the earliest and latest timestamp across every series in history,
// so range buttons work whether history holds live or historical/simulated data.
function getTimeBounds(history) {
  let minTime = null;
  let maxTime = null;
  Object.values(history).forEach((arr) => {
    if (!arr || !arr.length) return;
    const first = arr[0][0];
    const last = arr[arr.length - 1][0];
    if (minTime === null || first < minTime) minTime = first;
    if (maxTime === null || last > maxTime) maxTime = last;
  });
  return { minTime, maxTime };
}

function computeZoomValues(history, rangeKey) {
  const { minTime, maxTime } = getTimeBounds(history);
  if (minTime === null || maxTime === null) return null;

  const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[RANGES.length - 1];
  if (!range.ms) {
    return { startValue: minTime, endValue: maxTime };
  }
  return { startValue: Math.max(minTime, maxTime - range.ms), endValue: maxTime };
}

// `history` shape: { externalTemp, internalTemp, vipPressure, pumpPower, totalPower, power }
// each is an array of [timestamp_ms, value] pairs, except `power` which is [timestamp_ms, 0|1]
//
// `metrics` is the list of series THIS chart instance should plot, e.g.:
// [{ key: 'externalTemp', name: 'External Temp', color: '#2a78d6' }, ...]
// `key` must match a field name in `history`.
export default function AvipChart({ history, metrics }) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const [seriesOn, setSeriesOn] = useState(metrics.map(() => true));
  const [powerAreaOn, setPowerAreaOn] = useState(true);
  const [range, setRange] = useState('all');

  function buildSeries(showPowerArea) {
    const onIntervals = getOnIntervals(history.power);
    const markAreaData = onIntervals.map(([s, e]) => [{ xAxis: s }, { xAxis: e }]);

    return metrics.map((metric, i) => ({
      name: metric.name,
      type: 'line',
      smooth: true,
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

  // init chart once
  useEffect(() => {
    const chart = echarts.init(chartRef.current);
    chartInstance.current = chart;

    const zoom = computeZoomValues(history, range);

    chart.setOption({
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
        {
          type: 'inside',
          ...(zoom ? { startValue: zoom.startValue, endValue: zoom.endValue } : { start: 0, end: 100 })
        },
        {
          ...(zoom ? { startValue: zoom.startValue, endValue: zoom.endValue } : { start: 0, end: 100 })
        }
      ],
      series: buildSeries(powerAreaOn)
    });

    const resize = () => chart.resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      chart.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // update series data whenever new points arrive
  useEffect(() => {
    if (chartInstance.current) {
      chartInstance.current.setOption({ series: buildSeries(powerAreaOn) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history]);

  // re-zoom whenever the selected range changes, or new data shifts "latest"
  useEffect(() => {
    if (!chartInstance.current) return;
    const zoom = computeZoomValues(history, range);
    if (!zoom) return;
    chartInstance.current.setOption({
      dataZoom: [
        { type: 'inside', startValue: zoom.startValue, endValue: zoom.endValue },
        { startValue: zoom.startValue, endValue: zoom.endValue }
      ]
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, history]);

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
    <div style={{ width: '100%' }}>
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

        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              style={{
                fontSize: 12,
                padding: '4px 10px',
                borderRadius: 6,
                border: '1px solid ' + (range === r.key ? '#2d8a4e' : '#ccc'),
                background: range === r.key ? 'rgba(45, 138, 78, 0.1)' : '#fff',
                color: range === r.key ? '#2d8a4e' : '#555',
                cursor: 'pointer'
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="box">
        <div ref={chartRef} style={{ width: '100%', height: 385, width: 555 }} />
      </div>
    </div>
  );
}
