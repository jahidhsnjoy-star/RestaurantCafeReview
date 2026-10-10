import {API_BASE_URL} from './apiConfig';

export type UserProfile = {
  user_id: number;
  name: string;
  email: string;
  role: string;
};

type ApiMessage = {
  message?: string;
};

const getApiMessage = (body: ApiMessage, fallback: string) =>
  typeof body.message === 'string' ? body.message : fallback;

export const registerUser = async (
  name: string,
  email: string,
  password: string,
): Promise<{message: string}> => {
  const response = await fetch(`${API_BASE_URL}/api/users/register`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({name, email, password}),
  });
  const body = (await response.json().catch(() => ({}))) as ApiMessage;

  if (!response.ok) {
    throw new Error(getApiMessage(body, 'Registration failed. Please try again.'));
  }

  return {message: getApiMessage(body, 'Registration successful')};
};

export const getUserProfile = async (
  userId: number,
): Promise<UserProfile | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/users/${userId}`);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error('Failed to fetch user profile');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching user profile:', error);
    throw error;
  }
};