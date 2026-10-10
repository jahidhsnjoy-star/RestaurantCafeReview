import React, {useRef, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import {
  AssistantHistoryMessage,
  sendAssistantMessage,
} from '../services/assistantService';

type RootStackParamList = {
  Assistant: undefined;
  Home: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, 'Assistant'>;

type ChatMessage = AssistantHistoryMessage & {
  id: string;
};

const MAX_MESSAGE_LENGTH = 1200;
const MAX_HISTORY_MESSAGES = 8;
const HEADER_MIN_HEIGHT = 68;
const MIN_ANDROID_TOP_INSET = 8;

const AssistantScreen = ({navigation}: Props) => {
  const insets = useSafeAreaInsets();
  const androidTopInset = Platform.OS === 'android'
    ? Math.max(insets.top, MIN_ANDROID_TOP_INSET)
    : 0;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) {
      return;
    }

    const history = messages.slice(-MAX_HISTORY_MESSAGES).map(item => ({
      role: item.role,
      text: item.text,
    }));
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text,
    };

    setMessages(current => [...current, userMessage]);
    setInput('');
    setError('');
    setLoading(true);

    try {
      const answer = await sendAssistantMessage(text, history);
      setMessages(current => [...current, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: answer,
      }]);
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : 'The assistant could not respond. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  const renderMessage = ({item}: {item: ChatMessage}) => {
    const isUser = item.role === 'user';

    return (
      <View style={[styles.messageRow, isUser && styles.userMessageRow]}>
        <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble]}>
          <Text style={[styles.messageText, isUser && styles.userMessageText]}>
            {item.text}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <KeyboardAvoidingView
        style={styles.keyboardArea}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View
          style={[
            styles.header,
            {
              minHeight: HEADER_MIN_HEIGHT + androidTopInset,
              paddingTop: androidTopInset,
            },
          ]}>
          <TouchableOpacity
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => navigation.goBack()}>
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
          <View style={styles.headerTitleBlock}>
            <Text style={styles.title}>AI Assistant</Text>
            <Text style={styles.subtitle}>Restaurant & cafe reviews</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => listRef.current?.scrollToEnd({animated: true})}
          ListEmptyComponent={(
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Where would you like to eat?</Text>
              <Text style={styles.emptyText}>Ask about restaurants, ratings, or what reviewers say.</Text>
            </View>
          )}
          ListFooterComponent={loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#E67E22" />
              <Text style={styles.loadingText}>Finding an answer...</Text>
            </View>
          ) : undefined}
        />

        {error ? (
          <View style={styles.errorBox} accessibilityRole="alert">
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View
          style={[
            styles.composer,
            Platform.OS === 'android' && {paddingBottom: Math.max(insets.bottom, 10)},
          ]}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask about a restaurant..."
            placeholderTextColor="#888888"
            multiline
            maxLength={MAX_MESSAGE_LENGTH}
            editable={!loading}
            accessibilityLabel="Message the AI restaurant assistant"
          />
          <TouchableOpacity
            style={[styles.sendButton, (!input.trim() || loading) && styles.sendButtonDisabled]}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            disabled={!input.trim() || loading}
            onPress={sendMessage}>
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F8F8',
  },
  keyboardArea: {
    flex: 1,
  },
  header: {
    minHeight: HEADER_MIN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  backButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: '#FFF0E5',
  },
  backIcon: {
    color: '#E67E22',
    fontSize: 34,
    lineHeight: 38,
  },
  headerTitleBlock: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    color: '#222222',
    fontSize: 19,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#777777',
    fontSize: 12,
    marginTop: 2,
  },
  headerSpacer: {
    width: 42,
  },
  messageList: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 72,
  },
  emptyTitle: {
    color: '#333333',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  emptyText: {
    color: '#777777',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    textAlign: 'center',
  },
  messageRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 12,
  },
  userMessageRow: {
    justifyContent: 'flex-end',
  },
  messageBubble: {
    maxWidth: '86%',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  assistantBubble: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  userBubble: {
    backgroundColor: '#E67E22',
  },
  messageText: {
    color: '#333333',
    fontSize: 15,
    lineHeight: 21,
  },
  userMessageText: {
    color: '#FFFFFF',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  loadingText: {
    color: '#777777',
    fontSize: 13,
    marginLeft: 8,
  },
  errorBox: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#FDECEC',
  },
  errorText: {
    color: '#A52A2A',
    fontSize: 13,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    color: '#222222',
    fontSize: 15,
    lineHeight: 20,
    paddingHorizontal: 12,
    paddingTop: 11,
    paddingBottom: 9,
    borderWidth: 1,
    borderColor: '#DDDDDD',
    borderRadius: 10,
    marginRight: 8,
  },
  sendButton: {
    minWidth: 68,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E67E22',
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  sendButtonDisabled: {
    backgroundColor: '#C9C9C9',
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default AssistantScreen;