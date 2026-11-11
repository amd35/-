export type Account = {
  id: number
  name: string
  handle: string
  platform: string
  url: string
  description: string | null
}

export async function fetchAccounts(): Promise<Account[]> {
  const res = await fetch('/api/accounts')
  if (!res.ok) {
    throw new Error('تعذّر تحميل الحسابات')
  }
  return (await res.json()) as Account[]
}
