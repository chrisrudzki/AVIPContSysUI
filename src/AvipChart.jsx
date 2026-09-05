import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';

const powerColor = '#e34948';
const powerName = 'Power on';

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
  const [zoomEnabled, setZoomEnabled] = useState(true);
  // null = "not manually zoomed, always show full range".
  // once the user zooms/pans, this holds the absolute {startValue, endValue}
  // (real timestamps) so the window stays put as new data streams in.
  const zoomRef = useRef(null);
  // mirrors zoomEnabled for use inside the 'datazoom' listener, which is
  // registered once and would otherwise only ever see its initial value
  const zoomEnabledRef = useRef(true);

  useEffect(() => {
    zoomEnabledRef.current = zoomEnabled;
  }, [zoomEnabled]);

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
        { type: 'inside', start: 0, end: 100 },
        { start: 0, end: 100 }
      ],
      series: buildSeries(powerAreaOn)
    });

    // Whenever the user drags/zooms (slider or inside-scroll), record the
    // resulting window as absolute timestamps rather than trusting percent.
    // Ignored while zoom is toggled off, since interaction is disabled then anyway.
    chart.on('datazoom', () => {
      if (!zoomEnabledRef.current) return;
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

  // update series data whenever new points arrive
  useEffect(() => {
    if (chartInstance.current) {
      const update = { series: buildSeries(powerAreaOn) };
      // if zoom is on AND the user has manually zoomed, re-pin that exact
      // window so it doesn't silently drift as the time range grows.
      // if zoom is off, we deliberately skip this so the percent-based
      // 0-100 window (set in toggleZoom/init) keeps showing everything.
      if (zoomEnabled && zoomRef.current) {
        update.dataZoom = [
          { type: 'inside', startValue: zoomRef.current.startValue, endValue: zoomRef.current.endValue },
          { startValue: zoomRef.current.startValue, endValue: zoomRef.current.endValue }
        ];
      }
      chartInstance.current.setOption(update);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history]);

  function toggleZoom() {
    const next = !zoomEnabled;
    setZoomEnabled(next);
    zoomRef.current = null; // start fresh each time zoom is toggled

    if (!chartInstance.current) return;

    if (next) {
      // re-enable dragging/scrolling and show the slider again
      chartInstance.current.setOption({
        dataZoom: [
          { type: 'inside', start: 0, end: 100, zoomOnMouseWheel: true, moveOnMouseWheel: true, moveOnMouseMove: true },
          { show: true, start: 0, end: 100 }
        ]
      });
    } else {
      // lock to full range and disable interaction so it can't be
      // dragged while off; the growing 0-100% window shows all data.
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
    <div >
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
      <div style={{ position: "absolute", top: "75px"}} className="box">
        <div ref={chartRef} style={{ width: '100%', height: 395, }} />
      </div>
    </div>
  );
}