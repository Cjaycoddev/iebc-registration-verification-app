import iebcLogo from '../assets/iebc-logo.png'

export default function Logo({ size = 40, showText = false }) {
  return (
    <div className="logo">
      <img src={iebcLogo} alt="IEBC" width={size} height={size} style={{ objectFit: 'contain' }} />
      {showText && (
        <div className="logo-text">
          <span className="logo-title">IEBC</span>
          <span className="logo-sub">Voter Registration</span>
        </div>
      )}
    </div>
  )
}
