import crypto from 'crypto'
import type { WaiterRecord } from '@app-types/models/permission'
type SessionValue = Pick<WaiterRecord, 'waiter_no' | 'account'>
export type CurrentSession = {
  token: string
  user: Omit<WaiterRecord, 'password'> | null
}

const activeSessions = new Map<string, SessionValue>()
let currentSession: CurrentSession | null = null

export const generateSessionToken = (sessionValue: SessionValue): string => {
  for (const [token, session] of activeSessions.entries()) {
    if (session.waiter_no === sessionValue.waiter_no)
      activeSessions.delete(token)
  }
  const token = crypto.randomBytes(32).toString('hex')
  activeSessions.set(token, sessionValue)
  return token
}

export const getSessionByToken = (token: string): SessionValue | undefined => {
  return activeSessions.get(token)
}

export const deleteSessionByToken = (token: string): void => {
  activeSessions.delete(token)
}

export const setCurrentSession = (session: CurrentSession): void => {
  currentSession = session
}

export const getCurrentSession = (): CurrentSession => {
  if (!currentSession?.user) {
    throw new Error('Current session is missing. Please login again.')
  }

  return currentSession
}

export const clearCurrentSession = (): void => {
  currentSession = null
}
