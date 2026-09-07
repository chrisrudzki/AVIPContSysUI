import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';

const powerColor = '#e34948';
const powerName = 'Power on';

// Displays all live Control System data (besides power consumption) in a line chart
export default function AvipChart({ history, metrics }) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const [seriesOn, setSeriesOn] = useState(metrics.map(() => true));
  const [powerAreaOn, setPowerAreaOn] = useState(true);
  const [zoomEnabled, setZoomEnabled] = useState(true);
  
  // null shows full range
  // once the user zooms this holds startValue and endValue}
  const zoomRef = useRef(null);
  const zoomEnabledRef = useRef(true);

  useEffect(() => {
    zoomEnabledRef.current = zoomEnabled;
  }, [zoomEnabled]);

  //get intervals of power on from the power data
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

  // create chart
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

  // create chart on mount 
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
      //inital drawing of chart
      series: buildSeries(powerAreaOn)
    });

    // record the zoom window using absolute timestamps
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

  }, []);

  // update series data whenever new points arrive
  useEffect(() => {
    if (chartInstance.current) {
      const update = { series: buildSeries(powerAreaOn) };

      // if zoom is on and the user has manually zoomed, pin that exact
      // window to prevent resizing
      if (zoomEnabled && zoomRef.current) {
        update.dataZoom = [
          { type: 'inside', startValue: zoomRef.current.startValue, endValue: zoomRef.current.endValue },
          { startValue: zoomRef.current.startValue, endValue: zoomRef.current.endValue }
        ];
      }
      chartInstance.current.setOption(update);
    }
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
      chartInstance.current.setOption({
        dataZoom: [
          { type: 'inside', start: 0, end: 100, zoomOnMouseWheel: false, moveOnMouseWheel: false, moveOnMouseMove: false },
          { show: false, start: 0, end: 100 }
        ]
      });
    }
  }

  // toggle variable on chart
  function toggleSeries(index) {
    const next = [...seriesOn];
    next[index] = !next[index];
    setSeriesOn(next);
    chartInstance.current.dispatchAction({
      type: next[index] ? 'legendSelect' : 'legendUnSelect',
      name: metrics[index].name
    });
  }

  // toggle the power area on/off
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