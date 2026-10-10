import {API_BASE_URL} from './apiConfig';

export type AssistantRole = 'user' | 'assistant';

export type AssistantHistoryMessage = {
  role: AssistantRole;
  text: string;
};

type AssistantApiResponse = {
  answer?: string;
  message?: string;
};

const getApiMessage = (body: AssistantApiResponse, fallback: string) =>
  typeof body.message === 'string' ? body.message : fallback;

export const sendAssistantMessage = async (
  message: string,
  history: AssistantHistoryMessage[],
): Promise<string> => {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/api/assistant/chat`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({message, history}),
    });
  } catch {
    throw new Error('Could not reach the assistant. Check your connection and try again.');
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() || '';
  const body = contentType.includes('application/json')
    ? (await response.json().catch(() => ({}))) as AssistantApiResponse
    : {};

  if (!response.ok) {
    const fallback = response.status === 404
      ? 'Assistant endpoint was not found. Restart the backend and try again.'
      : `Assistant request failed (HTTP ${response.status}). Please try again.`;
    throw new Error(
      getApiMessage(body, fallback),
    );
  }

  if (!contentType.includes('application/json')) {
    throw new Error(`Assistant returned an invalid response (HTTP ${response.status}).`);
  }

  if (typeof body.answer !== 'string' || !body.answer.trim()) {
    throw new Error('The assistant returned an empty response. Please try again.');
  }

  return body.answer.trim();
};