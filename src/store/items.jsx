import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'records:items'

// Placeholder content so a fresh checkout has something to show. Replace these
// with your own records (Entry Form) or by editing this list.
const SAMPLE_ITEMS = [
  {
    id: 'rec_northwind',
    name: 'Northwind account renewal',
    category: 'Account',
    status: 'active',
    value: 12400,
    owner: 'Layla Hassan',
    notes: 'Renewal quote sent. Waiting on procurement sign-off before the contracts team countersigns.',
    createdAt: '2026-09-18T09:12:00.000Z',
    updatedAt: '2026-10-21T12:40:00.000Z',
  },
  {
    id: 'rec_autumn',
    name: 'Autumn campaign brief',
    category: 'Campaign',
    status: 'active',
    value: 5200,
    owner: 'Omar Faris',
    notes: 'Creative review booked for next Tuesday. Budget still pending final approval.',
    createdAt: '2026-10-02T08:05:00.000Z',
    updatedAt: '2026-10-23T15:20:00.000Z',
  },
  {
    id: 'rec_support',
    name: 'Support contract extension',
    category: 'Contract',
    status: 'paused',
    owner: 'Sara Kareem',
    value: 8600,
    notes: 'On hold while the customer confirms the number of covered seats.',
    createdAt: '2026-08-27T11:30:00.000Z',
    updatedAt: '2026-10-12T10:15:00.000Z',
  },
  {
    id: 'rec_invoice',
    name: 'Invoice batch #1042',
    category: 'Invoice',
    status: 'archived',
    value: 3150,
    owner: 'Layla Hassan',
    notes: 'Settled in full on 29 September. Kept for the quarterly report.',
    createdAt: '2026-09-05T13:45:00.000Z',
    updatedAt: '2026-09-30T09:00:00.000Z',
  },
  {
    id: 'rec_onboarding',
    name: 'Onboarding checklist update',
    category: 'Task',
    status: 'active',
    value: 450,
    owner: 'Omar Faris',
    notes: 'New handover steps added after the last customer review.',
    createdAt: '2026-10-10T07:20:00.000Z',
    updatedAt: '2026-10-24T16:05:00.000Z',
  },
]

function readStoredItems() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return SAMPLE_ITEMS
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : SAMPLE_ITEMS
  } catch {
    return SAMPLE_ITEMS
  }
}

function createId() {
  return `rec_${Math.random().toString(36).slice(2, 10)}`
}

const ItemsContext = createContext(null)

export function ItemsProvider({ children }) {
  const [items, setItems] = useState(readStoredItems)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  const addItem = useCallback((values) => {
    const timestamp = new Date().toISOString()
    const item = { ...values, id: createId(), createdAt: timestamp, updatedAt: timestamp }
    setItems((previous) => [item, ...previous])
    return item
  }, [])

  const updateItem = useCallback((id, values) => {
    const timestamp = new Date().toISOString()
    setItems((previous) =>
      previous.map((item) => (item.id === id ? { ...item, ...values, id, updatedAt: timestamp } : item)),
    )
  }, [])

  const deleteItem = useCallback((id) => {
    setItems((previous) => previous.filter((item) => item.id !== id))
  }, [])

  const value = useMemo(
    () => ({ items, addItem, updateItem, deleteItem }),
    [items, addItem, updateItem, deleteItem],
  )

  return <ItemsContext.Provider value={value}>{children}</ItemsContext.Provider>
}

export function useItems() {
  const context = useContext(ItemsContext)
  if (!context) throw new Error('useItems must be used inside an ItemsProvider')
  return context
}
