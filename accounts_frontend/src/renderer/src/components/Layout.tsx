import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function Layout() {
  return (
    <>
      <Sidebar />
      <main className="layout">
        <div className="page">
          <Outlet />
        </div>
      </main>
    </>
  )
}
