import {sendAssistantMessage} from '../src/services/assistantService';

jest.mock('../src/services/apiConfig', () => ({
  API_BASE_URL: 'http://localhost:5000',
}));

const originalFetch = globalThis.fetch;
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;

const createResponse = (
  status: number,
  body: unknown,
  contentType = 'application/json',
) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {get: () => contentType},
  json: jest.fn().mockResolvedValue(body),
}) as unknown as Response;

beforeEach(() => {
  globalThis.fetch = mockFetch;
  mockFetch.mockReset();
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

test('posts the expected request and reads a successful JSON answer', async () => {
  mockFetch.mockResolvedValueOnce(createResponse(200, {answer: 'Try the cafe'}));

  await expect(sendAssistantMessage('Find a cafe', [])).resolves.toBe('Try the cafe');
  expect(mockFetch).toHaveBeenCalledWith(
    'http://localhost:5000/api/assistant/chat',
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({message: 'Find a cafe', history: []}),
    },
  );
});

test('explains a non-JSON 404 from a stale backend', async () => {
  const response = createResponse(404, '<html>not found</html>', 'text/html; charset=utf-8');
  mockFetch.mockResolvedValueOnce(response);

  await expect(sendAssistantMessage('Find a cafe', [])).rejects.toThrow(
    'Assistant endpoint was not found. Restart the backend and try again.',
  );
  expect(response.json).not.toHaveBeenCalled();
});

test('surfaces a safe JSON backend configuration error', async () => {
  mockFetch.mockResolvedValueOnce(createResponse(503, {
    message: 'The assistant is not configured on the server yet.',
  }));

  await expect(sendAssistantMessage('Find a cafe', [])).rejects.toThrow(
    'The assistant is not configured on the server yet.',
  );
});