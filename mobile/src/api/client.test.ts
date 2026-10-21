import { ApiError, configureApi, messageFor, request } from './client'

jest.mock('expo-application', () => ({ nativeBuildVersion: '1', nativeApplicationVersion: '1.0.0' }))

function respond(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(body === undefined ? '' : JSON.stringify(body)) })
}

describe('api client', () => {
  const fetchMock = jest.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })

  it('sends the bearer token and JSON', async () => {
    configureApi({ getToken: () => 'tok', onUnauthorized: () => {} })
    fetchMock.mockReturnValue(respond(200, { data: { ok: true } }))
    await expect(request('/api/setups', { method: 'POST', body: { a: 1 } })).resolves.toEqual({ data: { ok: true } })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tok', 'Content-Type': 'application/json', Accept: 'application/json' })
    expect(init.body).toBe('{"a":1}')
  })

  it('leaves the token off anonymous calls', async () => {
    configureApi({ getToken: () => 'tok', onUnauthorized: () => {} })
    fetchMock.mockReturnValue(respond(200, {}))
    await request('/api/mobile/login', { method: 'POST', body: {}, anonymous: true })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('turns 422 into field messages', async () => {
    configureApi({ getToken: () => null, onUnauthorized: () => {} })
    fetchMock.mockReturnValue(respond(422, { message: 'The given data was invalid.', errors: { email: ['Wrong email.'] } }))
    const error = (await request('/x').catch((e: unknown) => e)) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.message).toBe('Wrong email.')
    expect(error.fields).toEqual({ email: 'Wrong email.' })
  })

  it('signs out on 401 only when a token was sent', async () => {
    const onUnauthorized = jest.fn()
    configureApi({ getToken: () => 'tok', onUnauthorized })
    fetchMock.mockReturnValue(respond(401, { message: 'Unauthenticated.' }))
    await expect(request('/api/setups')).rejects.toThrow('Your session ended')
    expect(onUnauthorized).toHaveBeenCalledTimes(1)

    configureApi({ getToken: () => null, onUnauthorized })
    await expect(request('/api/setups')).rejects.toBeInstanceOf(ApiError)
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('reports offline when fetch fails', async () => {
    configureApi({ getToken: () => null, onUnauthorized: () => {} })
    fetchMock.mockReturnValue(Promise.reject(new TypeError('Network request failed')))
    const error = (await request('/x').catch((e: unknown) => e)) as ApiError
    expect(error.offline).toBe(true)
    expect(error.message).toMatch(/couldn't reach/)
  })

  it('keeps the 409 body (preview flag)', async () => {
    configureApi({ getToken: () => 'tok', onUnauthorized: () => {} })
    fetchMock.mockReturnValue(respond(409, { message: 'Needs a plan', preview: false }))
    const error = (await request('/x').catch((e: unknown) => e)) as ApiError
    expect(error.status).toBe(409)
    expect(error.body.preview).toBe(false)
  })

  it('has friendly fallbacks', () => {
    expect(messageFor(429, { message: 'Too Many Attempts.' })).toMatch(/Wait a minute/)
    expect(messageFor(500, {})).toMatch(/server had a problem/)
    expect(messageFor(404, { message: 'Not Found' })).toBe('That could not be found.')
  })
})
