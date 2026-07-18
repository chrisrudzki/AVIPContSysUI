import { useNavigate } from 'react-router-dom'
import '../App.css'

function Simulation() {
  const navigate = useNavigate()

  return (
    <>
      <button className="corner-btn" onClick={() => navigate('/')}>
        Home
      </button>
      <p>Simulation Page</p>
    </>
  )
}

export default Simulation