import React from 'react';
import {
  ActivityIndicator,
  Text,
  TextInput,
} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import AssistantScreen from '../src/screens/AssistantScreen';
import {sendAssistantMessage} from '../src/services/assistantService';

jest.mock('../src/services/assistantService', () => ({
  sendAssistantMessage: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: jest.requireActual('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));

const mockSendAssistantMessage = jest.mocked(sendAssistantMessage);

const createAssistantScreen = async () => {
  let renderer!: ReturnType<typeof ReactTestRenderer.create>;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <AssistantScreen
        {...({
          navigation: {goBack: jest.fn()},
          route: {key: 'assistant-test', name: 'Assistant'},
        } as unknown as React.ComponentProps<typeof AssistantScreen>)}
      />,
    );
  });

  return renderer;
};

const getVisibleText = (renderer: ReturnType<typeof ReactTestRenderer.create>) =>
  renderer.root.findAllByType(Text).map(node => node.props.children).flat();

beforeEach(() => {
  jest.clearAllMocks();
});

test('shows loading and replies across consecutive messages', async () => {
  let resolveFirstResponse: (answer: string) => void = () => {};
  const firstResponse = new Promise<string>(resolve => {
    resolveFirstResponse = resolve;
  });
  mockSendAssistantMessage
    .mockReturnValueOnce(firstResponse)
    .mockResolvedValueOnce('Second response');

  const renderer = await createAssistantScreen();
  const input = renderer.root.findByType(TextInput);

  await ReactTestRenderer.act(async () => {
    input.props.onChangeText('First question');
  });

  let firstRequest: Promise<void>;
  ReactTestRenderer.act(() => {
    firstRequest = renderer.root
      .findByProps({accessibilityLabel: 'Send message'})
      .props.onPress();
  });

  expect(renderer.root.findAllByType(ActivityIndicator)).toHaveLength(1);

  await ReactTestRenderer.act(async () => {
    resolveFirstResponse('First response');
    await firstRequest;
  });

  expect(getVisibleText(renderer)).toContain('First response');

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(TextInput).props.onChangeText('Second question');
  });
  await ReactTestRenderer.act(async () => {
    await renderer.root
      .findByProps({accessibilityLabel: 'Send message'})
      .props.onPress();
  });

  expect(mockSendAssistantMessage).toHaveBeenNthCalledWith(1, 'First question', []);
  expect(mockSendAssistantMessage).toHaveBeenNthCalledWith(2, 'Second question', [
    {role: 'user', text: 'First question'},
    {role: 'assistant', text: 'First response'},
  ]);
  expect(getVisibleText(renderer)).toContain('Second response');

  await ReactTestRenderer.act(async () => {
    renderer.unmount();
  });
});

test('shows service errors in the chat screen', async () => {
  mockSendAssistantMessage.mockRejectedValueOnce(new Error('Assistant unavailable'));
  const renderer = await createAssistantScreen();

  await ReactTestRenderer.act(async () => {
    renderer.root.findByType(TextInput).props.onChangeText('Try again');
  });
  await ReactTestRenderer.act(async () => {
    await renderer.root
      .findByProps({accessibilityLabel: 'Send message'})
      .props.onPress();
  });

  expect(mockSendAssistantMessage).toHaveBeenCalledWith('Try again', []);
  expect(getVisibleText(renderer)).toContain('Assistant unavailable');

  await ReactTestRenderer.act(async () => {
    renderer.unmount();
  });
});