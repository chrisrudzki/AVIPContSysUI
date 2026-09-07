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

const MQTT_USERNAME = import.meta.env.VITE_MQTT_USERNAME;
const MQTT_PASSWORD = import.meta.env.VITE_MQTT_PASSWORD;

function App() {
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

  function flattenRows(rows) {
    return rows.map((row) => ({
      created_at: row.created_at,
      ...row.data_point, 
    }));
  }

  async function exportToSpreadsheet(rows, filename = 'avip_data.xlsx') {
      // rows = array of objects, e.g. what fetchAllReadings() already returns
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
      XLSX.writeFile(workbook, filename);
    }

  // takes Live Control System Data and packages for the Live Charts
  function applyPayload(payload) {
    setRPiData(payload);

    const now = payload.timestamp * 1000
    
    const total = (payload.pumpPower ?? 0) + (payload.rPiPower ?? 0);
    setTotalPower(total);

    const MAX_POINTS = 500;
    const push = (arr, val) => [...arr, [now, val]].slice(-MAX_POINTS);
    
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

 
  // on start of program
  useEffect(() => {
    
    // connect to the MQTT broker
    let mqttClient = mqtt.connect("wss://e17befc47e684572a7e116a22da1ad42.s1.eu.hivemq.cloud:8884/mqtt", {
      username: MQTT_USERNAME,
      password: MQTT_PASSWORD,
    });

    client.current = mqttClient;

    mqttClient.on("connect", () => {
      mqttClient.subscribe("RPi/payload", (err) => {
      if (err) console.error("subscribe error:", err);
      else console.log("subscribed successfully");
      });
    });

    // when a message is received from the broker, update the live data 
    mqttClient.on("message", (topic, message) => {
      const payload = JSON.parse(message.toString());
      applyPayload(payload);

    });

    return () => mqttClient.end(); // clean up on unmount
    }, []);

    // pump on/off button functionality, prevent rapid toggling
    function handlePumpToggle(isOn) {
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
        
      }

    }

   return (
    <>
      
      <Routes>
        
        <Route path="/" element={
          <>
          
          {/* optional seperate tab */}
          {/* <button className="corner-btn" onClick={() => navigate('/simulation')}>simulation</button> */}
          

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

          </>
        } />

        <Route path="/simulation" element={<Sim />} />
      </Routes>
    </>
  )
}

export default App
