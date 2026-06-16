// accounts_frontend\src\renderer\src\components\TitleBar.tsx
import { Minus, Square, X, Zap } from 'lucide-react'

export default function TitleBar() {
  const hasElectron = !!window.electronAPI
  const minimize = () => window.electronAPI?.minimize()
  const maximize = () => window.electronAPI?.maximize()
  const close = () => window.electronAPI?.close()

  return (
    <div className="titlebar">
      <div className="tb-left">
        <div className="tb-logo">
          <Zap size={13} color="#fff" strokeWidth={2.5} />
        </div>
        <span className="tb-name">BillingApp</span>
      </div>
      <div className="tb-controls">
        <button className="tb-btn" onClick={minimize} disabled={!hasElectron} title="Minimize">
          <Minus size={12} />
        </button>
        <button className="tb-btn" onClick={maximize} disabled={!hasElectron} title="Maximize / Restore">
          <Square size={10} />
        </button>
        <button className="tb-btn tb-close" onClick={close} disabled={!hasElectron} title="Close">
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
