import { useCallback, useEffect, useMemo, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

const CHECK_ITEMS = [
  ['workstation_ready', 'Workstation setup (computer, scanner, printer, cash drawer)'],
  ['ticket_stock_verified', 'Ticket stock levels verified'],
  ['pos_ok', 'POS system is functional'],
  ['card_reader_ok', 'Card readers are functional'],
  ['network_ok', 'Network connectivity is stable'],
  ['hse_ready', 'Health & safety checks completed'],
]

function Card({ title, children, className = '' }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      <h2 className="mb-4 text-xl font-semibold text-slate-800">{title}</h2>
      {children}
    </section>
  )
}

function App() {
  const [auth, setAuth] = useState({ authenticated: false })
  const [credentials, setCredentials] = useState({ username: 'staff', password: 'password123' })

  const [ticketsData, setTicketsData] = useState({ tickets: [], recommendations: [] })
  const [bookingForm, setBookingForm] = useState({ ticket_code: '', adult_qty: 1, child_qty: 0, visit_date: '' })
  const [bookingMessage, setBookingMessage] = useState('')

  const [membershipData, setMembershipData] = useState({ types: [], benefits: [] })
  const [membershipForm, setMembershipForm] = useState({ full_name: '', email: '', membership_code: '' })
  const [membershipMessage, setMembershipMessage] = useState('')
  const [memberDashboardEmail, setMemberDashboardEmail] = useState('')
  const [memberDashboard, setMemberDashboard] = useState([])

  const [checklistForm, setChecklistForm] = useState({
    staff_name: '',
    ticket_stock: 0,
    notes: '',
    checklist: Object.fromEntries(CHECK_ITEMS.map(([key]) => [key, false])),
  })
  const [checklistHistory, setChecklistHistory] = useState([])
  const [checklistAnalytics, setChecklistAnalytics] = useState(null)
  const [checklistMessage, setChecklistMessage] = useState('')

  const [analyticsData, setAnalyticsData] = useState(null)
  const [attractions, setAttractions] = useState([])

  const totals = useMemo(() => {
    const ticket = ticketsData.tickets.find((item) => item.code === bookingForm.ticket_code)
    if (!ticket) return null
    const total = Number(bookingForm.adult_qty) * ticket.adult_price + Number(bookingForm.child_qty) * ticket.child_price
    return { ticket, total }
  }, [bookingForm, ticketsData.tickets])

  const request = async (path, options = {}) => {
    const response = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    })
    const json = await response.json()
    if (!response.ok) throw new Error(json.error || 'Request failed')
    return json
  }

  const loadPublicData = useCallback(async () => {
    const [tickets, memberships, analytics, attractionsData, me] = await Promise.all([
      request('/api/tickets'),
      request('/api/memberships/types'),
      request('/api/analytics/signup-improvement'),
      request('/api/attractions'),
      request('/api/auth/me'),
    ])
    setTicketsData(tickets)
    setMembershipData(memberships)
    setAnalyticsData(analytics)
    setAttractions(attractionsData.attractions)
    setAuth(me)

    if (tickets.tickets.length) {
      setBookingForm((prev) => ({ ...prev, ticket_code: tickets.tickets[0].code }))
    }
    if (memberships.types.length) {
      setMembershipForm((prev) => ({ ...prev, membership_code: memberships.types[0].code }))
    }
  }, [])

  const loadChecklistData = useCallback(async () => {
    if (!auth.authenticated) return
    try {
      const [history, analytics] = await Promise.all([
        request('/api/checklists'),
        request('/api/checklists/analytics'),
      ])
      setChecklistHistory(history.items)
      setChecklistAnalytics(analytics)
    } catch {
      setChecklistHistory([])
      setChecklistAnalytics(null)
    }
  }, [auth.authenticated])

  useEffect(() => {
    loadPublicData().catch(() => null)
  }, [loadPublicData])

  useEffect(() => {
    loadChecklistData().catch(() => null)
  }, [loadChecklistData])

  const handleLogin = async (event) => {
    event.preventDefault()
    setChecklistMessage('')
    try {
      const me = await request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      })
      setAuth({ authenticated: true, ...me })
    } catch (error) {
      setChecklistMessage(error.message)
    }
  }

  const handleLogout = async () => {
    await request('/api/auth/logout', { method: 'POST' })
    setAuth({ authenticated: false })
    setChecklistHistory([])
    setChecklistAnalytics(null)
  }

  const submitChecklist = async (event) => {
    event.preventDefault()
    setChecklistMessage('')
    try {
      const response = await request('/api/checklists', {
        method: 'POST',
        body: JSON.stringify(checklistForm),
      })
      setChecklistMessage(`Checklist signed at ${new Date(response.signed_at).toLocaleString()}`)
      setChecklistForm((prev) => ({
        ...prev,
        notes: '',
        checklist: Object.fromEntries(CHECK_ITEMS.map(([key]) => [key, false])),
      }))
      loadChecklistData()
    } catch (error) {
      setChecklistMessage(error.message)
    }
  }

  const submitBooking = async (event) => {
    event.preventDefault()
    setBookingMessage('')
    try {
      const response = await request('/api/tickets/book', {
        method: 'POST',
        body: JSON.stringify(bookingForm),
      })
      setBookingMessage(`Booking submitted. Total: S$${response.total_amount}`)
    } catch (error) {
      setBookingMessage(error.message)
    }
  }

  const submitMembership = async (event) => {
    event.preventDefault()
    setMembershipMessage('')
    try {
      const response = await request('/api/memberships/signup', {
        method: 'POST',
        body: JSON.stringify(membershipForm),
      })
      setMembershipMessage(`${response.member.membership} registered. Renewal: ${response.member.renewal_date}`)
    } catch (error) {
      setMembershipMessage(error.message)
    }
  }

  const fetchMemberDashboard = async (event) => {
    event.preventDefault()
    const response = await request(`/api/memberships/dashboard?email=${encodeURIComponent(memberDashboardEmail)}`)
    setMemberDashboard(response.memberships)
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-700">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-8">
        <header className="rounded-xl bg-gradient-to-r from-emerald-700 to-sky-700 p-6 text-white shadow">
          <h1 className="text-3xl font-bold">Mount Faber Leisure Portal</h1>
          <p className="mt-2 text-sm md:text-base">Operations, ticketing, membership and growth analytics in one platform.</p>
        </header>

        <Card title="Attractions Information">
          <ul className="grid gap-2 md:grid-cols-2">
            {attractions.map((item) => (
              <li key={item} className="rounded bg-slate-50 p-3 text-sm">{item}</li>
            ))}
          </ul>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="1) Pre-Shift Checklist (Ticketing Team)">
            {!auth.authenticated ? (
              <form className="space-y-3" onSubmit={handleLogin}>
                <p className="text-sm">Staff login required for checklist sign-off.</p>
                <input className="w-full rounded border p-2" value={credentials.username} onChange={(e) => setCredentials((prev) => ({ ...prev, username: e.target.value }))} placeholder="Username" />
                <input className="w-full rounded border p-2" type="password" value={credentials.password} onChange={(e) => setCredentials((prev) => ({ ...prev, password: e.target.value }))} placeholder="Password" />
                <button className="rounded bg-emerald-700 px-4 py-2 text-white" type="submit">Login</button>
              </form>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between rounded bg-emerald-50 p-3 text-sm">
                  <span>Signed in as <strong>{auth.username}</strong></span>
                  <button className="rounded bg-slate-700 px-3 py-1 text-white" onClick={handleLogout}>Logout</button>
                </div>
                <form className="space-y-3" onSubmit={submitChecklist}>
                  <input className="w-full rounded border p-2" placeholder="Staff name" value={checklistForm.staff_name} onChange={(e) => setChecklistForm((prev) => ({ ...prev, staff_name: e.target.value }))} required />
                  <input className="w-full rounded border p-2" type="number" min="0" placeholder="Ticket stock level" value={checklistForm.ticket_stock} onChange={(e) => setChecklistForm((prev) => ({ ...prev, ticket_stock: Number(e.target.value) }))} required />
                  {CHECK_ITEMS.map(([key, label]) => (
                    <label key={key} className="flex items-start gap-2 rounded border p-2 text-sm">
                      <input type="checkbox" checked={Boolean(checklistForm.checklist[key])} onChange={(e) => setChecklistForm((prev) => ({ ...prev, checklist: { ...prev.checklist, [key]: e.target.checked } }))} />
                      <span>{label}</span>
                    </label>
                  ))}
                  <textarea className="w-full rounded border p-2" rows="3" placeholder="Notes" value={checklistForm.notes} onChange={(e) => setChecklistForm((prev) => ({ ...prev, notes: e.target.value }))} />
                  <button className="rounded bg-emerald-700 px-4 py-2 text-white" type="submit">Submit checklist</button>
                </form>
              </>
            )}

            {checklistMessage && <p className="mt-3 text-sm font-medium text-emerald-700">{checklistMessage}</p>}

            {checklistAnalytics && (
              <div className="mt-4 grid gap-2 text-sm md:grid-cols-2">
                <div className="rounded bg-slate-50 p-2">Total: {checklistAnalytics.total_submissions}</div>
                <div className="rounded bg-slate-50 p-2">Completion: {checklistAnalytics.completion_rate}%</div>
                <div className="rounded bg-slate-50 p-2">Fully complete: {checklistAnalytics.fully_completed}</div>
                <div className="rounded bg-slate-50 p-2">Low stock alerts: {checklistAnalytics.low_stock_alerts}</div>
              </div>
            )}

            {checklistHistory.length > 0 && (
              <div className="mt-4 space-y-2">
                {checklistHistory.slice(0, 5).map((item) => (
                  <div key={item.id} className="rounded border bg-slate-50 p-2 text-xs">
                    <div className="font-semibold">{item.staff_name} • {new Date(item.signed_at).toLocaleString()}</div>
                    <div>Ticket stock: {item.ticket_stock}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="2) Types of Admission Tickets">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-100 text-left">
                    <th className="p-2">Ticket</th>
                    <th className="p-2">Adult</th>
                    <th className="p-2">Child</th>
                    <th className="p-2">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {ticketsData.tickets.map((ticket) => (
                    <tr key={ticket.code} className="border-t">
                      <td className="p-2 font-medium">{ticket.name}</td>
                      <td className="p-2">S${ticket.adult_price}</td>
                      <td className="p-2">S${ticket.child_price}</td>
                      <td className="p-2">{ticket.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form className="mt-4 grid gap-2 md:grid-cols-2" onSubmit={submitBooking}>
              <select className="rounded border p-2" value={bookingForm.ticket_code} onChange={(e) => setBookingForm((prev) => ({ ...prev, ticket_code: e.target.value }))}>
                {ticketsData.tickets.map((ticket) => <option key={ticket.code} value={ticket.code}>{ticket.name}</option>)}
              </select>
              <input className="rounded border p-2" type="date" value={bookingForm.visit_date} onChange={(e) => setBookingForm((prev) => ({ ...prev, visit_date: e.target.value }))} required />
              <input className="rounded border p-2" type="number" min="0" value={bookingForm.adult_qty} onChange={(e) => setBookingForm((prev) => ({ ...prev, adult_qty: Number(e.target.value) }))} />
              <input className="rounded border p-2" type="number" min="0" value={bookingForm.child_qty} onChange={(e) => setBookingForm((prev) => ({ ...prev, child_qty: Number(e.target.value) }))} />
              <button className="rounded bg-sky-700 px-4 py-2 text-white md:col-span-2" type="submit">Book tickets</button>
            </form>
            {totals && <p className="mt-2 text-sm">Estimated total: <strong>S${totals.total}</strong></p>}
            {bookingMessage && <p className="mt-1 text-sm text-sky-700">{bookingMessage}</p>}
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">
              {ticketsData.recommendations.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </Card>

          <Card title="3) Membership / Loyalty Programme (Faber Licence)">
            <div className="grid gap-3 md:grid-cols-2">
              {membershipData.types.map((type) => (
                <article key={type.code} className="rounded border bg-slate-50 p-3 text-sm">
                  <h3 className="font-semibold text-slate-800">{type.name} • S${type.price}/year</h3>
                  <p>{type.capacity}</p>
                  {!!type.highlights.length && (
                    <ul className="mt-1 list-disc pl-5">
                      {type.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}
                    </ul>
                  )}
                </article>
              ))}
            </div>
            <p className="mt-3 text-sm font-medium">Benefits</p>
            <ul className="list-disc pl-5 text-sm">
              {membershipData.benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}
            </ul>
            <form className="mt-4 grid gap-2 md:grid-cols-2" onSubmit={submitMembership}>
              <input className="rounded border p-2" placeholder="Full name" value={membershipForm.full_name} onChange={(e) => setMembershipForm((prev) => ({ ...prev, full_name: e.target.value }))} required />
              <input className="rounded border p-2" type="email" placeholder="Email" value={membershipForm.email} onChange={(e) => setMembershipForm((prev) => ({ ...prev, email: e.target.value }))} required />
              <select className="rounded border p-2 md:col-span-2" value={membershipForm.membership_code} onChange={(e) => setMembershipForm((prev) => ({ ...prev, membership_code: e.target.value }))}>
                {membershipData.types.map((type) => <option key={type.code} value={type.code}>{type.name}</option>)}
              </select>
              <button className="rounded bg-purple-700 px-4 py-2 text-white md:col-span-2" type="submit">Sign up membership</button>
            </form>
            {membershipMessage && <p className="mt-2 text-sm text-purple-700">{membershipMessage}</p>}

            <form className="mt-4 flex gap-2" onSubmit={fetchMemberDashboard}>
              <input className="flex-1 rounded border p-2" type="email" placeholder="Member email for dashboard" value={memberDashboardEmail} onChange={(e) => setMemberDashboardEmail(e.target.value)} />
              <button className="rounded bg-slate-700 px-3 py-2 text-white" type="submit">Load</button>
            </form>
            {!!memberDashboard.length && (
              <div className="mt-2 space-y-2 text-xs">
                {memberDashboard.map((member, index) => (
                  <div key={`${member.email}-${index}`} className="rounded border bg-slate-50 p-2">
                    <div className="font-semibold">{member.membership}</div>
                    <div>{member.renewal_reminder}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="4) Ways to Improve Sign-Up Rate">
            {analyticsData && (
              <div className="space-y-4 text-sm">
                <div className="grid gap-2 md:grid-cols-3">
                  <div className="rounded bg-slate-50 p-3">Views: {analyticsData.funnel.views}</div>
                  <div className="rounded bg-slate-50 p-3">Clicks: {analyticsData.funnel.clicks}</div>
                  <div className="rounded bg-slate-50 p-3">Conversions: {analyticsData.funnel.conversions}</div>
                  <div className="rounded bg-slate-50 p-3">CTR: {analyticsData.funnel.click_through_rate}%</div>
                  <div className="rounded bg-slate-50 p-3">Conversion: {analyticsData.funnel.conversion_rate}%</div>
                  <div className="rounded bg-slate-50 p-3">Bookings: {analyticsData.funnel.ticket_bookings}</div>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">Bottlenecks</h3>
                  <ul className="list-disc pl-5">
                    {analyticsData.bottlenecks.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">AI-powered recommendations</h3>
                  <ul className="list-disc pl-5">
                    {analyticsData.recommendations.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded border bg-slate-50 p-3">
                    <h3 className="font-semibold text-slate-800">A/B Testing Framework</h3>
                    <ul className="list-disc pl-5">
                      {analyticsData.ab_testing_framework.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                  <div className="rounded border bg-slate-50 p-3">
                    <h3 className="font-semibold text-slate-800">Email Marketing Integration</h3>
                    <ul className="list-disc pl-5">
                      {analyticsData.email_marketing.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                  <div className="rounded border bg-slate-50 p-3">
                    <h3 className="font-semibold text-slate-800">Social Media Templates</h3>
                    <ul className="list-disc pl-5">
                      {analyticsData.social_templates.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                  <div className="rounded border bg-slate-50 p-3">
                    <h3 className="font-semibold text-slate-800">Mobile Optimization Metrics</h3>
                    <p>Avg load: {analyticsData.mobile_optimization.avg_load_time_seconds}s</p>
                    <p>Completion: {analyticsData.mobile_optimization.form_completion_rate}%</p>
                    <p>Bounce: {analyticsData.mobile_optimization.bounce_rate}%</p>
                    <p className="mt-2">Referral program: {analyticsData.referral_program}</p>
                    <p>Peak visits: {analyticsData.peak_visit_times.join(', ')}</p>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </main>
  )
}

export default App
