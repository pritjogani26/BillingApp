import { Minus, Square, X, Zap } from 'lucide-react'

export default function TitleBar() {
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
        <button className="tb-btn" onClick={minimize} title="Minimize">
          <Minus size={12} />
        </button>
        <button className="tb-btn" onClick={maximize} title="Maximize / Restore">
          <Square size={10} />
        </button>
        <button className="tb-btn tb-close" onClick={close} title="Close">
          <X size={13} />
        </button>
      </div>
    </div>
  )
}
