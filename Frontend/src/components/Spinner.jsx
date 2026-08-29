import './spinner.css'

function Spinner() {
  return (
    <span className="spinner" role="status" aria-label="Cargando">
      {Array.from({ length: 12 }, (_, index) => (
        <span className="spinner-blade" key={index} />
      ))}
    </span>
  )
}

export default Spinner
