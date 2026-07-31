import { useEffect, useRef, useState, useMemo } from 'react';
import * as echarts from 'echarts';

// history arrays are index-aligned (each index = one incoming payload).
// Pull raw values + timestamps straight out, no grouping/averaging, and keep
// them paired as [timestamp_ms, value] so the x-axis can be type: 'time'.
function extractSeries(history, metrics) {
  const seriesData = {};
  metrics.forEach((metric) => {
    seriesData[metric.key] = (history[metric.key] ?? []).map(([t, v]) => [t, v ?? 0]);
  });

  return { seriesData };
}

export default function AvipBarChart({ history, metrics }) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const [seriesOn, setSeriesOn] = useState(metrics.map(() => true));
  const [totals, setTotals] = useState(null); // { [metricKey]: sum } from last brush selection
  const [zoomEnabled, setZoomEnabled] = useState(true);

  // Tracks the user's manual zoom/pan window as absolute timestamps,
  // so new incoming data doesn't reset the view back to 0-100%.
  // null = "no manual zoom yet, show everything".
  const zoomRef = useRef(null);

  const zoomEnabledRef = useRef(true);

  useEffect(() => {
    zoomEnabledRef.current = zoomEnabled;
  }, [zoomEnabled]);

  const { seriesData } = useMemo(
    () => extractSeries(history, metrics),
    [history, metrics]
  );

  function buildSeries() {
    return metrics.map((metric) => ({
      name: metric.name,
      type: 'bar',
      data: seriesData[metric.key] ?? [],
      itemStyle: { color: metric.color }
    }));
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
      xAxis: { type: 'time', boundaryGap: false },
      yAxis: { type: 'value' },
      dataZoom: [
        { type: 'inside', start: 0, end: 100 },
        { start: 0, end: 100 }
      ],
      series: buildSeries()
    });

  //   chart.dispatchAction({
  //   type: 'takeGlobalCursor',
  //   key: 'brush',
  //   brushOption: {
  //   brushType: 'lineX',
  //   brushMode: 'single'
  //   }
  // });

    // Capture the user's zoom/pan whenever they drag the slider or
    // scroll-zoom, so it can be re-applied after every data update below.
    chart.on('datazoom', () => {
      const opt = chart.getOption();
      const dz = opt.dataZoom && opt.dataZoom[0];
      if (dz && dz.startValue != null && dz.endValue != null) {
        zoomRef.current = { startValue: dz.startValue, endValue: dz.endValue };
      }
    });

    // Fires whenever the user drags a brush selection or clears it.
    // chart.on('brushSelected', (params) => {
    //   const batch = params.batch && params.batch[0];
    //   if (!batch || !batch.selected || !batch.selected.length) {
    //     setTotals(null);
    //     return;
    //   }



    //   const nextTotals = {};
    //   batch.selected.forEach((sel) => {
    //     const metric = metrics[sel.seriesIndex];
    //     if (!metric) return;
    //     const values = seriesData[metric.key] ?? [];
    //     const sum = sel.dataIndex.reduce((acc, idx) => acc + (values[idx] ?? 0), 0);
    //     nextTotals[metric.key] = Number(sum.toFixed(2));
    //   });
    //   setTotals(nextTotals);
    // });

    const resize = () => chart.resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      chart.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // update series whenever new payloads arrive
  useEffect(() => {
    if (chartInstance.current) {
      const update = {
        series: buildSeries()
      };

      // Re-pin the exact same zoom window instead of letting it reset
      // to 0-100% every time a new payload comes in.
      if (zoomRef.current) {
        update.dataZoom = [
          { type: 'inside', startValue: zoomRef.current.startValue, endValue: zoomRef.current.endValue },
          { startValue: zoomRef.current.startValue, endValue: zoomRef.current.endValue }
        ];
      }

      chartInstance.current.setOption(update);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesData]);

  function toggleSeries(index) {
    const next = [...seriesOn];
    next[index] = !next[index];
    setSeriesOn(next);
    chartInstance.current.dispatchAction({
      type: next[index] ? 'legendSelect' : 'legendUnSelect',
      name: metrics[index].name
    });
  }

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

  return (
    <div>
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
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={zoomEnabled}
            onChange={toggleZoom}
            style={{ cursor: 'pointer' }}
          />
          Zoom
        </label>

      <div className="box">
        <div ref={chartRef} style={{ width: '100%', height: 395 }} />
      </div>

      {/* {totals && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 8, fontSize: 13 }}>
          {metrics.map((metric) =>
            totals[metric.key] != null ? (
              <div key={metric.key} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: metric.color, display: 'inline-block' }} />
                <strong>{metric.name} total:</strong> {totals[metric.key]}
              </div>
            ) : null
          )}
        </div>
      )} */}
    </div>
  );
}