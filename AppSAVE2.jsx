import { useState, useEffect } from 'react'
import viteLogo from './assets/vite.svg'

import { Routes, Route, useNavigate } from 'react-router-dom'
import Sim from './pages/simulation.jsx'
import mqtt from "mqtt";

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

  const [totalPower, setTotalPower] = useState(0)

  useEffect(() => {
    // ws:// not mqtt:// — browsers need the WebSocket listener
    const client = mqtt.connect("wss://2d30bbe70f3947a39ff7131ae78b027e.s1.eu.hivemq.cloud:8884/mqtt", {
      username: "AVIPLab2",
      password: "ControlSoft123!",
    });

    client.on("connect", () => {
      console.log("connected to broker");
      client.subscribe("sensors/power", (err) => {
      if (err) console.error("subscribe error:", err);
      else console.log("subscribed successfully");
      });
    });

    client.on("message", (topic, message) => {
      const payload = JSON.parse(message.toString());
      setRPiData(payload);
    });

    return () => client.end(); // clean up on unmount
    }, []);

    // if (!data) return <div>Waiting for data...</div>;

   return (
    <>
      
      <Routes>
        {/* <button className="corner-btn" onClick={() => navigate('/simulation')}></button> */}

        <Route path="/" element={
          <>
          <button className="corner-btn" onClick={() => navigate('/simulation')}>simulation</button>

          <div className="boxes">

            <div className="box-row">
            <div className="box">

          <div className="data-container">
          <p>External Temperature</p>
          <div className="data-value">


            <span className="data-number">{rPiData?.externalTemp != null ? rPiData.externalTemp + "°C" : 0}</span>
            
            <span className="data-unit">°C</span>
          </div>
        </div>

          <div className="data-container">
          <p>Internal Temperature</p>
          <div className="data-value">
            <span className="data-number">{rPiData?.internalTemp != null ? rPiData.internalTemp + "°C" : 0}</span>
            <span className="data-unit">°C</span>
          </div>
          </div>

          <div className="data-container">
          <p>VIP Pressure</p>
            <div className="data-value">
            <span className="data-number">{rPiData?.vipPressure != null ? rPiData.vipPressure + "Torr" : 0}</span>
            <span className="data-unit">Torr</span>
            </div>
          </div>

          <div className="data-container" style={{ marginTop: "10px" }}>
          <p>Pump Power Usage</p>
          <div className="data-value">
          <span className="data-number">{rPiData?.pumpPower != null ? rPiData.pumpPower + "W" : 0}</span>
          <span className="data-unit">W</span>
          </div>
          </div>

          <div className="data-container">
          <p>RPi Power Usage</p>
          <div className="data-value">
          <span className="data-number">{rPiData?.rPiPower != null ? rPiData.rPiPower + "W" : 0}</span>
          <span className="data-unit">W</span>
          </div>
          </div>

          <div className="data-container">
          <p>Total Power Usage</p>
          <div className="data-value">
          <span className="data-number">{totalPower}</span>
          <span className="data-unit">W</span>
          </div>
          </div>

          <div className="data-container">
          <p>Pump Voltage</p>
          <div className="data-value">
          <span className="data-number">{rPiData?.pumpVoltage != null ? rPiData.pumpVoltage + "V" : 0}</span>
          <span className="data-unit">V</span>
          </div>
          </div>

          <div className="data-container">
          <p>RPi Voltage</p>
          <div className="data-value">
          <span className="data-number">{rPiData?.rPiVoltage != null ? rPiData.rPiVoltage + "V" : 0}</span>
          <span className="data-unit">V</span>
          </div>
          </div>

          <div className="data-container" style={{ marginTop: "10px" }}>
          <p>Valve #1</p>
            <span className="data-number">{right_Valve}</span>
          </div>

          <div className="data-container">
          <p>Valve #2</p>
            <span className="data-number">{left_Valve}</span>
          </div>

          <div className="data-container">
          <p>Pump</p>
            <span className="data-number">{center_Valve}</span>
          </div>

          </div> 
          {/* box  */}

          <div className="box">
          
          </div>
          {/* box  */}

          </div>
          {/* box row */}
          
          <div className="lower-box">

          <div className="data-container">
          <p>Deflate</p>
            <div className="data-value">
              <span>
            <input className="deflate-input"
            type="text" 
            placeholder=" "
            value={value}
            onChange={(e) => setDeflateValue(e.target.value)}
            />
            </span>

            <span>
            <button>
            Start</button>
            </span>

            </div>
          </div>


          <div className="data-container">
          <p>Stop Deflating</p>
            <button>ON</button>
          </div>

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
