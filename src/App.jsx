import { useState, useEffect, useRef } from 'react'
import viteLogo from './assets/vite.svg'
import AvipHistoryChart from './AvipHistoryChart.jsx';
import AvipPowerHistoryChart from './AvipPowerHistoryChart.jsx';

import { Routes, Route, useNavigate } from 'react-router-dom'
import { fetchAllReadings, fetchRangedReadings } from './utils/DataBaseQuery.jsx';


import Sim from './pages/simulation.jsx'
import mqtt from "mqtt";
import AvipChart from './AvipChart.jsx'
import AvipPowerChart from './PowerChart.jsx'
import DateRangePicker from './DateRangePicker.jsx'
import * as XLSX from 'xlsx';

import './App.css'

function App() {
  // const [ex_Temp, setExTemp] = useState(0)
  // const [in_Temp, setInTemp] = useState(0)
  // const [pressure, setPressure] = useState(0)

  // const [pressure, setPressure] = useState(0)

  const [right_Valve, setRightValve] = useState("OFF")
  const [left_Valve, setLeftValve] = useState("OFF")
  const [center_Valve, setCenterValve] = useState("OFF")
  
  const [pump_Status, setPumpStatus] = useState("OFF")

  const [value, setDeflateValue] = useState(-1000)
  
  const navigate = useNavigate()

  const [rPiData, setRPiData] = useState(null)

  const [totalPower, setTotalPower] = useState(null)

  const [graphRangeGenerate, setGraphRangeGenerate] = useState({ start: '', end: '', allTime: true })

  const [isPumpOn, setIsPumpOn] = useState(false)

  const [pumpTimeoutDone, setPumpTimeoutDone] = useState(true)

  let client = useRef(null);
  // const [graphRangePowerGenerate, setGraphRangePowerGenerate] = useState({ start: '', end: '', allTime: true })
  // const [deleteRange, setDeleteRange] = useState(null)

  // Rolling history of data points for the chart. Each array holds
  // [timestamp_ms, value] pairs, capped at MAX_POINTS so it doesn't grow forever.
  const [history, setHistory] = useState({
    externalTemp: [],
    internalTemp: [],
    vipPressure: [],
    pumpPower: [],
    totalPower: [],
    rPiPower: [],      
    pumpVoltage: [],  
    rPiVoltage: [],  
    power: [], // 0/1 pump-on indicator, used to shade the chart
    new_pump_power_data: [] 
  })

  const [powerHistory, setPowerHistory] = useState({
    pumpPower: [],
    totalPower: [],
    rPiPower: [],      
    new_pump_power_data: [] 
  })

  // ------------------------------------------------------------------
  // Simulation mode — lets you test the dashboard without a live Pi/MQTT feed
  // ------------------------------------------------------------------
  const [simulate, setSimulate] = useState(false)

  // Which metrics each chart box plots. `key` must match a field in `history`.
  const leftGraphMetrics = [
    { key: 'externalTemp', name: 'External Temp', color: '#2a78d6' },
    { key: 'internalTemp', name: 'Internal Temp', color: '#1baf7a' },
    { key: 'vipPressure', name: 'VIP Pressure', color: '#eda100' },
    { key: 'pumpVoltage', name: 'Pump Voltage', color: '#d6a300' },
    { key: 'rPiVoltage', name: 'RPi Voltage', color: '#c2185b' }
  ]
  const powerMetrics = [
  { key: 'pumpPower', name: 'Pump Power', color: '#008300' },
  { key: 'totalPower', name: 'Total Power', color: '#4a3aa7' },
  { key: 'rPiPower', name: 'RPi Power', color: '#012300' },
  ]

  const simStateRef = useRef({
    externalTemp: 21,
    internalTemp: 18,
    vipPressure: 0.05,
    pumpPower: 0,
    rPiPower: 3,
    pumpVoltage: 24,
    rPiVoltage: 5,
    pumpOn: true
  })

  function flattenRows(rows) {
    return rows.map((row) => ({
      created_at: row.created_at,
      ...row.data_point, // spreads externalTemp, pumpPower, etc. into top-level columns
    }));
  }

  async function exportToSpreadsheet(rows, filename = 'avip_data.xlsx') {
      // rows = array of objects, e.g. what fetchAllReadings() already returns
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
      XLSX.writeFile(workbook, filename);
    }

  // Shared handler: both the real MQTT message handler and the simulator
  // call this so the rest of the app doesn't care where the data came from.
  function applyPayload(payload) {
    setRPiData(payload);

    const now = payload.timestamp * 1000
    const now2 = Date.now();

    // console.log("GOT THE PAYLOAD TIME: ", now2)

    // console.log("Payload time: ", payload.timestamp * 1000)

    const total = (payload.pumpPower ?? 0) + (payload.rPiPower ?? 0);
    setTotalPower(total);

    const MAX_POINTS = 500;
    const push = (arr, val) => [...arr, [now, val]].slice(-MAX_POINTS);
    // console.log("Updating history with payload:", payload, "Total power:", total);

    console.log("PAYLOAD: ex temp", payload.externalTemp, "in temp", payload.internalTemp, "vip pressure", payload.vipPressure, "pump power", payload.pumpPower, "rPi power", payload.rPiPower, "total power", total, "pump voltage", payload.pumpVoltage, "rPi voltage", payload.rPiVoltage);

    setHistory((prev) => ({
      externalTemp: push(prev.externalTemp, payload.externalTemp),
      internalTemp: push(prev.internalTemp, payload.internalTemp),
      vipPressure: push(prev.vipPressure, payload.vipPressure),
      pumpVoltage: push(prev.pumpVoltage, payload.pumpVoltage),
      rPiVoltage: push(prev.rPiVoltage, payload.rPiVoltage),
      // heuristic: pump is "on" if it's drawing power. Swap this for
      // payload.pumpStatus if/when that field gets added to the payload.
      power: push(prev.power, payload.pumpPower > 0 ? 1 : 0)
    }));

    console.log("new pump power data: ", payload.new_pump_power_data);
    
    if (payload.new_pump_power_data == 1) {
      console.log("set power history");
      setPowerHistory((prev) => ({
        pumpPower: push(prev.pumpPower, payload.pumpPower),
        rPiPower: push(prev.rPiPower, payload.rPiPower),
        totalPower: push(prev.totalPower, total)
        }));
      }
    
    }

  // useEffect(() => {
  //   // if (!simulate) return;

  //   const interval = setInterval(() => {
  //     const s = simStateRef.current;

  //     // random walk each field a little, occasionally flip the pump on/off
  //     s.externalTemp += (Math.random() - 0.5) * 0.3;
  //     s.internalTemp += (Math.random() - 0.5) * 0.2;
  //     s.vipPressure = Math.max(0, s.vipPressure + (Math.random() - 0.5) * 0.002);
  //     if (Math.random() < 0.05) s.pumpOn = !s.pumpOn;
  //     s.pumpPower = s.pumpOn ? Math.max(0, 40 + (Math.random() - 0.5) * 8) : 0;
  //     s.rPiPower = Math.max(0, 3 + (Math.random() - 0.5) * 0.5);
  //     s.pumpVoltage = s.pumpOn ? 24 + (Math.random() - 0.5) : 0;
  //     s.rPiVoltage = 5 + (Math.random() - 0.5) * 0.1;

  //     applyPayload({
  //       externalTemp: Number(s.externalTemp.toFixed(2)),
  //       internalTemp: Number(s.internalTemp.toFixed(2)),
  //       vipPressure: Number(s.vipPressure.toFixed(4)),
  //       pumpPower: Number(s.pumpPower.toFixed(1)),
  //       rPiPower: Number(s.rPiPower.toFixed(2)),
  //       pumpVoltage: Number(s.pumpVoltage.toFixed(2)),
  //       rPiVoltage: Number(s.rPiVoltage.toFixed(2))
  //     });
  //   }, 1000); // one fake reading per second — change to match your real cadence

  //   return () => clearInterval(interval);
  // }, []);

  useEffect(() => {
    
    // ws:// not mqtt:// — browsers need the WebSocket listener
    let mqttClient = mqtt.connect("wss://e17befc47e684572a7e116a22da1ad42.s1.eu.hivemq.cloud:8884/mqtt", {
      username: "AVIPLab",
      password: "AVIPCom445!",
    });

    client.current = mqttClient;

    mqttClient.on("connect", () => {
      // console.log("connected to broker");
      mqttClient.subscribe("RPi/payload", (err) => {
      if (err) console.error("subscribe error:", err);
      else console.log("subscribed successfully");
      });
    });

    mqttClient.on("message", (topic, message) => {
      const payload = JSON.parse(message.toString());
      applyPayload(payload);
      // console.log("Received message:", payload);

    });

    return () => mqttClient.end(); // clean up on unmount
    }, []);


    //WORKING
    function handlePumpToggle(isOn) {
      // s
      if (isOn) {
        setIsPumpOn(true);
        console.log("Pump turned ON");
        setPumpTimeoutDone(false);

        const timer = setTimeout(() => {
          setPumpTimeoutDone(true);
        }, 4000); // 4 seconds

        
        client.current?.publish("RPi/pump", JSON.stringify({ on: true }), { qos: 1 }, (err) => {
        if (err) console.error("Publish failed:", err);
        else console.log("Published ON");
        
    });
        //set timer to disallow turning on for 5 seconds
        // send a command to turn on the pump


        //set timer to disallow turning off for 5 seconds
        // send a command to turn on the pump

      }else{
        setIsPumpOn(false);
        console.log("Pump turned OFF");
        setPumpTimeoutDone(false);

        const timer = setTimeout(() => {
          setPumpTimeoutDone(true);
        }, 4000); // 4 seconds

        client.current?.publish("RPi/pump", JSON.stringify({ on: false }), { qos: 1 }, (err) => {
          if (err) console.error("Publish failed:", err);
          else console.log("Published OFF");
        });
        //set timer to disallow turning on for 5 seconds
      }

    }

    // if (!data) return <div>Waiting for data...</div>;

   return (
    <>
      
      <Routes>
        {/* <button className="corner-btn" onClick={() => navigate('/simulation')}></button> */}

        <Route path="/" element={
          <>
          {/* <button className="corner-btn" onClick={() => navigate('/simulation')}>simulation</button> */}
          {/* <button
            className="corner-btn"
            style={{ right: "160px" }}
            onClick={() => setSimulate((s) => !s)}
          >
            {simulate ? "Stop simulating" : "Simulate data"}
          </button> */}

          <div className="boxes">

             <h2>Live Data</h2>
            <div className="box-row">
    
            <div className="responsive-box-chart">
              <AvipChart history={history} metrics={leftGraphMetrics} />
            </div>

            <div className="responsive-box-chart">
              <AvipPowerChart history={powerHistory} metrics={powerMetrics} />
            </div>

          {/* box  */}

          </div>
          {/* box row */}
          
          <div className="lower-box">
            <div className="lower-box-inner">

            <div className="data-container" style={{ marginTop: "10px" }}>
          <p>External Temp</p>
          <div className="data-value">
            <span className="data-number">{rPiData?.externalTemp != null ? rPiData.externalTemp.toFixed(1) + " °C" : 0}</span>
            
          </div>
        </div>

          <div className="data-container">
          <p>Internal Temp</p>
          <div className="data-value">
            <span className="data-number">{rPiData?.internalTemp != null ? rPiData.internalTemp.toFixed(1) + " °C" : 0}</span>
            
          </div>
          </div>

          <div className="data-container">
          <p>VIP Pressure</p>
            <div className="data-value">
            <span className="data-number">{rPiData?.vipPressure != null ? rPiData.vipPressure.toFixed(1) + " Torr" : 0}</span>
            
            </div>
          </div>
          </div>

          <div className="lower-box-inner">
          <div className="data-container" style={{ marginTop: "10px" }}>
          <p>Pump Power</p>
          <div className="data-value">
          <span className="data-number">{rPiData?.pumpPower != null ? rPiData.pumpPower.toFixed(1) + " W/min" : 0}</span>
          
          </div>
          </div>

          <div className="data-container">
          <p>RPi Power</p>
          <div className="data-value">
          <span className="data-number">{rPiData?.rPiPower != null ? rPiData.rPiPower.toFixed(1) + " W/min" : 0}</span>
          
          </div>
          </div>

          <div className="data-container">
          <p>Total Power</p>
          <div className="data-value">
          <span className="data-number">{totalPower != null ? totalPower.toFixed(1) + " W/min" : 0}</span>
          </div>
          </div>

          <div className="data-container">
          <p>Pump Voltage</p>
          <div className="data-value">
          <span className="data-number">{rPiData?.pumpVoltage != null ? rPiData.pumpVoltage.toFixed(1) + " V" : 0}</span>
         
          </div>
          </div>

          <div className="data-container">
          <p>RPi Voltage</p>
          <div className="data-value">
          <span className="data-number">{rPiData?.rPiVoltage != null ? rPiData.rPiVoltage.toFixed(1) + " V" : 0}</span>
          
          </div>
          </div>

          </div>

          <div className="lower-box-inner">

          <div className="data-container" style={{ marginTop: "10px" }}>
          <p>Valve #1</p>
          <div className='data-value'>
            <span className="data-number">{right_Valve}</span>
          </div>
          </div>

          <div className="data-container">
          <p>Valve #2</p>
          <div className='data-value'>
            <span className="data-number">{left_Valve}</span>
          </div>
          </div>

          <div className="data-container">
          <p>Pump</p>
          <div className='data-value'>
            <span className="data-number">{center_Valve}</span>
          </div>
          </div>
        
            </div>
          </div>

          <div className="lower-box-2">

          <div className="lower-box-inner-2">

          <div className="data-container-controls">
          <p>Pump</p>
          
            <div>
            <button disabled={isPumpOn} className={`corner-btn-2 ${isPumpOn || !pumpTimeoutDone ? "btn-disabled" : ""}`} onClick={() => handlePumpToggle(true)} >ON</button>
            <button disabled={!isPumpOn} className={`corner-btn-2 ${!isPumpOn || !pumpTimeoutDone ? "btn-disabled" : ""}`} onClick={() => handlePumpToggle(false)} >OFF</button>
            </div>
          
          </div>

          <div className="data-container-controls">
          <p>Isolation Valve #1 </p>
          
            <div>
            <button className="corner-btn-2">ON</button>
            <button className="corner-btn-2">OFF</button>
            </div>
          
          </div>

            <div className="data-container-controls">
          <p>Timed Pump</p>
            


              <div>
              
            <input className="deflate-input"
            type="text" 
            placeholder=" "
            value={value}
            onChange={(e) => setDeflateValue(e.target.value)}
            />
            <button className="corner-btn-2">Start</button>
            <button className="corner-btn-2">STOP</button>

            </div></div>
            
            </div>

            <div className="lower-box-inner">

              <DateRangePicker
                title="Graph Interval"
                actionLabel="Set Interval"
                idPrefix="graph-range"
                onSubmit={(range) => {
                  setGraphRangeGenerate(range);
                  // TODO: use range.start / range.end / range.allTime to
                  // fetch or filter the history data shown in the charts below
                  console.log("RANGE: ", range)
                }}
              />

              <button onClick={async () => {
             
                if (graphRangeGenerate.allTime == false){
                  console.log("start: ", graphRangeGenerate.start, " end: ", graphRangeGenerate.end);
                  const rows = await fetchRangedReadings(graphRangeGenerate.start, graphRangeGenerate.end);
                  console.log("ALL ROWS2: ", rows);
                  
                  exportToSpreadsheet(flattenRows(rows));
                }else{
                  const rows = await fetchAllReadings();
                  console.log("ALL ROWS: ", rows);
                  exportToSpreadsheet(flattenRows(rows));
                }

            }} className="corner-btn-2">Export to Excel</button>
              
            </div>
          </div>
          
          </div>

          <div className='box-row'>

          <div style={{position:"relative"}} className="responsive-box-chart">
              <AvipHistoryChart drawRange={graphRangeGenerate} metrics={leftGraphMetrics} />
          </div>

          <div style={{position: "relative"}} className="responsive-box-chart">
              <AvipPowerHistoryChart drawRange={graphRangeGenerate} metrics={powerMetrics} />
          </div>

          </div>

          {/* <div className="box-row">
          <div className="lower-box-3">

            <div className="lower-box-inner">

              <DateRangePicker
                title="Delete Data"
                actionLabel="Delete"
                idPrefix="delete-range"
                onSubmit={(range) => {
                  setDeleteRange(range);
                  deleteDataRange(range);
                  // TODO: call the delete endpoint with range.start / range.end / range.allTime
                  console.log("Delete requested for range:", range);
                }}
              />

            </div>
          </div>

          </div> */}
          </>
        } />

        <Route path="/simulation" element={<Sim />} />
      </Routes>
    </>
  )
}

export default App
