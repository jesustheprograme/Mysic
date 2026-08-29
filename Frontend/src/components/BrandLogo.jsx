import darkLogo from '../assets/brand/mysic-dark.png'
import whiteLogo from '../assets/brand/mysic-white.png'

function BrandLogo({ className = '', tone = 'light' }) {
  const logo = tone === 'dark' ? darkLogo : whiteLogo

  return (
    <span className={`brand-logo${className ? ` ${className}` : ''}`}>
      <img src={logo} alt="Mysic" />
    </span>
  )
}

export default BrandLogo
