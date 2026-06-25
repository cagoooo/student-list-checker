import { afterEach, describe, expect, it, vi } from 'vitest'
import { headerSignature, recallColumnMap, rememberColumnMap } from '../columnMemory'

function mockLocalStorage() {
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
    clear: () => data.clear(),
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('column mapping memory', () => {
  it('builds a stable signature from headers', () => {
    expect(headerSignature(['班級 ', ' 座號', '姓名'])).toBe('班級|座號|姓名')
  })

  it('remembers and recalls a mapping by header signature', () => {
    mockLocalStorage()
    const headers = ['欄位1', '欄位2', '欄位3']

    expect(recallColumnMap(headers)).toBeUndefined()
    rememberColumnMap(headers, { classKey: '欄位1', seatKey: '欄位2', nameKey: '欄位3' })
    expect(recallColumnMap(headers)).toEqual({ classKey: '欄位1', seatKey: '欄位2', nameKey: '欄位3' })
  })
})
