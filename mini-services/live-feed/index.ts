// MPLAD Sentinel — Live Feed mini-service
// Simulates real-time fund releases + risk-flag events pushed to the dashboard via Socket.IO
import { createServer } from 'http'
import { Server } from 'socket.io'

const httpServer = createServer()
const io = new Server(httpServer, {
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// Simulated live event generator
const STATES = ['Uttar Pradesh', 'Maharashtra', 'Tamil Nadu', 'Karnataka', 'West Bengal', 'Gujarat', 'Rajasthan', 'Bihar', 'Madhya Pradesh', 'Andhra Pradesh', 'Kerala', 'Punjab']
const CATEGORIES = ['Road Construction', 'Drainage', 'School Building', 'Community Hall', 'Street Lighting', 'Water Supply', 'Health Center', 'Bridge Construction', 'Public Toilet', 'Sports Complex']
const DISTRICTS: Record<string, string[]> = {
  'Uttar Pradesh': ['Lucknow', 'Kanpur', 'Varanasi'],
  'Maharashtra': ['Mumbai', 'Pune', 'Nagpur'],
  'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai'],
  'Karnataka': ['Bengaluru', 'Mysuru', 'Mangaluru'],
  'West Bengal': ['Kolkata', 'Howrah', 'Darjeeling'],
}
const VENDORS = ['Shree Construction', 'Bharat Builders', 'Skyline Infra', 'Royal Contractors', 'Sai Enterprises', 'Vinayak Works', 'Ganesh Engineering', 'Lakshmi Associates']

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

interface LiveEvent {
  id: string
  type: 'fund_release' | 'risk_flag' | 'case_update' | 'citizen_report'
  timestamp: string
  state: string
  district?: string
  workId: string
  amount?: number
  vendor?: string
  category?: string
  tier?: 'critical' | 'high' | 'medium' | 'low'
  message: string
}

let eventCounter = 1

function generateEvent(): LiveEvent {
  const state = randomItem(STATES)
  const districts = DISTRICTS[state] || ['Central']
  const district = randomItem(districts)
  const workId = 'W' + String(Math.floor(Math.random() * 99999) + 1).padStart(5, '0')
  const vendor = randomItem(VENDORS)
  const category = randomItem(CATEGORIES)
  const types: LiveEvent['type'][] = ['fund_release', 'fund_release', 'fund_release', 'risk_flag', 'risk_flag', 'case_update', 'citizen_report']
  const type = randomItem(types)

  const id = 'EVT' + String(eventCounter++).padStart(5, '0')
  const base: LiveEvent = {
    id,
    type,
    timestamp: new Date().toISOString(),
    state,
    district,
    workId,
    vendor,
    category,
    message: '',
  }

  switch (type) {
    case 'fund_release':
      base.amount = Math.floor(Math.random() * 80) + 5
      base.message = `₹${base.amount}L released to ${vendor} for ${category} in ${district}, ${state}`
      break
    case 'risk_flag':
      base.tier = Math.random() > 0.5 ? 'critical' : 'high'
      base.message = `${base.tier.toUpperCase()} risk detected on ${workId} — auto-flagged by ensemble`
      break
    case 'case_update':
      base.message = `Case CASE${workId.substring(1)} status changed to investigating`
      break
    case 'citizen_report':
      base.message = `New citizen report on ${workId} — cross-reference pending`
      break
  }
  return base
}

const recentEvents: LiveEvent[] = []

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`)
  // Send recent events on connect
  socket.emit('recent-events', recentEvents.slice(-20))

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`)
  })
})

// Emit a new event every 5-8 seconds
function scheduleNext() {
  const delay = 5000 + Math.random() * 3000
  setTimeout(() => {
    const evt = generateEvent()
    recentEvents.push(evt)
    if (recentEvents.length > 100) recentEvents.shift()
    io.emit('live-event', evt)
    scheduleNext()
  }, delay)
}

const PORT = 3003
httpServer.listen(PORT, () => {
  console.log(`MPLAD Sentinel live feed running on port ${PORT}`)
  scheduleNext()
})

process.on('SIGTERM', () => { httpServer.close(() => process.exit(0)) })
process.on('SIGINT', () => { httpServer.close(() => process.exit(0)) })
