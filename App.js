import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity, FlatList,
  Modal, SafeAreaView, Alert, Image, KeyboardAvoidingView, Platform,
  Dimensions, Animated, Vibration
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { RTCPeerConnection, mediaDevices, RTCView } from 'react-native-webrtc';

const { width } = Dimensions.get('window');

// Цвета в стиле Telegram Dark
const COLORS = {
  bg: '#0e1621',
  bgSecondary: '#17212b',
  bgTertiary: '#242f3d',
  accent: '#2b5278',
  accentLight: '#3a6ea5',
  green: '#00c853',
  text: '#ffffff',
  textSecondary: '#7a8b9e',
  border: '#1e2c3a',
  bubble: '#2b5278',
  bubbleOther: '#182533',
};

export default function App() {
  const [activeTab, setActiveTab] = useState('chats');
  
  // Профиль
  const [profile, setProfile] = useState({
    name: 'Гость',
    id: '',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=default',
    ip: '192.168.1.100'
  });

  // Чаты
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState({});
  const [inputText, setInputText] = useState('');
  const [searchId, setSearchId] = useState('');

  // Игровая зона
  const [peers, setPeers] = useState([]);
  const [team, setTeam] = useState([]);
  const [isTeamLeader, setIsTeamLeader] = useState(false);

  // Звонки
  const [isInCall, setIsInCall] = useState(false);
  const [callMinimized, setCallMinimized] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [remoteStream, setRemoteStream] = useState(null);

  // Настройки
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [showCreateTeam, setShowCreateTeam] = useState(false);

  const peerConnection = useRef(null);
  const localStream = useRef(null);
  const callTimer = useRef(null);

  // Инициализация
  useEffect(() => {
    loadProfile();
    loadChats();
    scanNetwork();
  }, []);

  const loadProfile = async () => {
    const saved = await AsyncStorage.getItem('voiceyok_profile');
    if (saved) {
      setProfile(JSON.parse(saved));
    } else {
      const newId = 'YOK' + Math.random().toString(36).substring(2, 8).toUpperCase();
      const newProfile = {
        name: 'Игрок',
        id: newId,
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + newId,
        ip: '192.168.1.' + Math.floor(Math.random() * 255)
      };
      setProfile(newProfile);
      await AsyncStorage.setItem('voiceyok_profile', JSON.stringify(newProfile));
    }
  };

  const loadChats = async () => {
    const saved = await AsyncStorage.getItem('voiceyok_chats');
    if (saved) setChats(JSON.parse(saved));
  };

  const saveChats = async (newChats) => {
    setChats(newChats);
    await AsyncStorage.setItem('voiceyok_chats', JSON.stringify(newChats));
  };

  // Сканирование сети (имитация P2P discovery)
  const scanNetwork = () => {
    // В реальности здесь будет UDP broadcast
    // Пока имитируем обнаружение устройств
    const mockPeers = [
      { id: 'YOK12345', name: 'Алексей', ip: '192.168.1.101', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alex', online: true, ping: 12 },
      { id: 'YOK67890', name: 'Мария', ip: '192.168.1.102', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=maria', online: true, ping: 8 },
      { id: 'YOK11111', name: 'Дмитрий', ip: '192.168.1.103', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=dmitry', online: false, ping: 0 },
    ];
    setPeers(mockPeers);
  };

  // Добавление контакта по ID
  const addContact = async () => {
    if (!searchId.trim()) return;
    const id = searchId.toUpperCase();
    
    if (chats.find(c => c.id === id)) {
      Alert.alert('Уже в контактах');
      return;
    }

    const newChat = {
      id,
      name: `Пользователь ${id}`,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${id}`,
      lastMessage: '',
      lastTime: '',
      online: Math.random() > 0.5
    };

    const newChats = [newChat, ...chats];
    await saveChats(newChats);
    setSearchId('');
    Alert.alert('Контакт добавлен', `ID: ${id}`);
  };

  // Открытие чата
  const openChat = (chat) => {
    setActiveChat(chat);
    setActiveTab('chat');
  };

  // Отправка сообщения
  const sendMessage = () => {
    if (!inputText.trim() || !activeChat) return;

    const msg = {
      id: Date.now().toString(),
      text: inputText,
      sender: 'me',
      time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    };

    const chatMessages = messages[activeChat.id] || [];
    const newMessages = { ...messages, [activeChat.id]: [...chatMessages, msg] };
    setMessages(newMessages);
    setInputText('');

    // Обновляем последнее сообщение в списке чатов
    const updatedChats = chats.map(c => 
      c.id === activeChat.id ? { ...c, lastMessage: inputText, lastTime: msg.time } : c
    );
    saveChats(updatedChats);
  };

  // Создание команды
  const createTeam = (selectedPeers) => {
    const teamMembers = [
      { ...profile, isLeader: true },
      ...selectedPeers.map(p => ({ ...p, isLeader: false }))
    ];
    setTeam(teamMembers);
    setIsTeamLeader(true);
    setShowCreateTeam(false);
    Alert.alert('Команда создана', `Участников: ${teamMembers.length}`);
  };

  // Начало звонка
  const startCall = async () => {
    try {
      const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
      localStream.current = stream;
      
      setIsInCall(true);
      setCallMinimized(false);
      
      callTimer.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);

      // Здесь будет WebRTC подключение к пиру
      Alert.alert('Звонок начат', 'Подключение к собеседнику...');
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось получить доступ к микрофону');
    }
  };

  // Завершение звонка
  const endCall = () => {
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => track.stop());
      localStream.current = null;
    }
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    clearInterval(callTimer.current);
    setIsInCall(false);
    setCallMinimized(false);
    setCallDuration(0);
    setRemoteStream(null);
  };

  // Сворачивание звонка
  const minimizeCallScreen = () => {
    setCallMinimized(true);
    setActiveTab('chats');
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // ================= РЕНДЕР =================

  // Экран чата
  if (activeTab === 'chat' && activeChat) {
    const chatMessages = messages[activeChat.id] || [];
    return (
      <SafeAreaView style={styles.container}>
        {/* Шапка чата */}
        <View style={styles.chatHeader}>
          <TouchableOpacity onPress={() => setActiveTab('chats')} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Image source={{ uri: activeChat.avatar }} style={styles.headerAvatar} />
          <View style={styles.headerInfo}>
            <Text style={styles.headerName}>{activeChat.name}</Text>
            <Text style={styles.headerStatus}>{activeChat.online ? 'В сети' : 'Не в сети'}</Text>
          </View>
          <TouchableOpacity onPress={startCall} style={styles.callButton}>
            <Ionicons name="call" size={22} color={COLORS.green} />
          </TouchableOpacity>
        </View>

        {/* Сообщения */}
        <FlatList
          data={chatMessages}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.messagesList}
          renderItem={({ item }) => (
            <View style={[
              styles.messageBubble,
              item.sender === 'me' ? styles.myMessage : styles.otherMessage
            ]}>
              <Text style={styles.messageText}>{item.text}</Text>
              <Text style={styles.messageTime}>{item.time}</Text>
            </View>
          )}
        />

        {/* Ввод сообщения */}
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.inputContainer}
        >
          <TextInput
            style={styles.messageInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Сообщение"
            placeholderTextColor={COLORS.textSecondary}
            multiline
          />
          <TouchableOpacity onPress={sendMessage} style={styles.sendButton}>
            <Ionicons name="send" size={24} color={COLORS.green} />
          </TouchableOpacity>
        </KeyboardAvoidingView>

        {/* Плавающая кнопка звонка */}
        {callMinimized && isInCall && (
          <View style={styles.floatingCallButton}>
            <TouchableOpacity 
              onPress={() => setCallMinimized(false)}
              style={styles.floatingCallMain}
            >
              <Ionicons name="call" size={20} color="#fff" />
              <Text style={styles.floatingCallText}>{formatDuration(callDuration)}</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={endCall}
              style={styles.floatingCallClose}
            >
              <Ionicons name="close" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // Экран звонка
  if (isInCall && !callMinimized) {
    return (
      <SafeAreaView style={styles.callContainer}>
        <View style={styles.callHeader}>
          <Text style={styles.callTitle}>Звонок</Text>
          <Text style={styles.callTimer}>{formatDuration(callDuration)}</Text>
        </View>

        <View style={styles.callContent}>
          <Image source={{ uri: activeChat?.avatar }} style={styles.callAvatar} />
          <Text style={styles.callName}>{activeChat?.name}</Text>
          <Text style={styles.callStatus}>Подключение...</Text>
        </View>

        {remoteStream && (
          <RTCView streamURL={remoteStream.toURL()} style={styles.remoteVideo} />
        )}

        <View style={styles.callControls}>
          <TouchableOpacity onPress={minimizeCallScreen} style={styles.callControlButton}>
            <Ionicons name="chevron-down" size={28} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={endCall} style={[styles.callControlButton, styles.endCallButton]}>
            <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Главный экран
  return (
    <SafeAreaView style={styles.container}>
      {/* Шапка */}
      <View style={styles.mainHeader}>
        <View style={styles.headerLeft}>
          <Ionicons name="skull" size={28} color={COLORS.green} />
          <Text style={styles.headerTitle}>VoiceYok</Text>
        </View>
        <TouchableOpacity onPress={() => setActiveTab('profile')}>
          <Image source={{ uri: profile.avatar }} style={styles.headerAvatarSmall} />
        </TouchableOpacity>
      </View>

      {/* Контент вкладок */}
      {activeTab === 'chats' && (
        <View style={styles.tabContent}>
          {/* Поиск */}
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color={COLORS.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Поиск по ID..."
              placeholderTextColor={COLORS.textSecondary}
              value={searchId}
              onChangeText={setSearchId}
              autoCapitalize="characters"
            />
            <TouchableOpacity onPress={addContact} style={styles.addButton}>
              <Ionicons name="add" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Список чатов */}
          <FlatList
            data={chats}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={styles.chatItem}
                onPress={() => openChat(item)}
              >
                <View style={styles.chatAvatarContainer}>
                  <Image source={{ uri: item.avatar }} style={styles.chatAvatar} />
                  {item.online && <View style={styles.onlineIndicator} />}
                </View>
                <View style={styles.chatInfo}>
                  <View style={styles.chatInfoTop}>
                    <Text style={styles.chatName}>{item.name}</Text>
                    <Text style={styles.chatTime}>{item.lastTime}</Text>
                  </View>
                  <Text style={styles.chatLastMessage} numberOfLines={1}>
                    {item.lastMessage || 'Нет сообщений'}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="chatbubbles-outline" size={64} color={COLORS.textSecondary} />
                <Text style={styles.emptyText}>Нет чатов</Text>
                <Text style={styles.emptySubtext}>Добавьте контакт по ID</Text>
              </View>
            }
          />
        </View>
      )}

      {activeTab === 'games' && (
        <View style={styles.tabContent}>
          {/* Мой профиль в сети */}
          <View style={styles.myNetworkCard}>
            <View style={styles.myNetworkHeader}>
              <Ionicons name="wifi" size={20} color={COLORS.green} />
              <Text style={styles.myNetworkTitle}>Вы в сети</Text>
            </View>
            <Text style={styles.myNetworkId}>ID: {profile.id}</Text>
            <Text style={styles.myNetworkIp}>IP: {profile.ip}</Text>
            <TouchableOpacity 
              onPress={() => setShowCreateTeam(true)}
              style={styles.createTeamButton}
            >
              <Ionicons name="add-circle" size={20} color="#fff" />
              <Text style={styles.createTeamText}>Создать команду</Text>
            </TouchableOpacity>
          </View>

          {/* Устройства в сети */}
          <Text style={styles.sectionTitle}>Устройства в сети</Text>
          <FlatList
            data={peers}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <View style={styles.peerCard}>
                <Image source={{ uri: item.avatar }} style={styles.peerAvatar} />
                <View style={styles.peerInfo}>
                  <Text style={styles.peerName}>{item.name}</Text>
                  <Text style={styles.peerIp}>{item.ip}</Text>
                  <Text style={styles.peerPing}>
                    {item.online ? `${item.ping} мс` : 'Не в сети'}
                  </Text>
                </View>
                <TouchableOpacity 
                  style={[
                    styles.peerAction,
                    !item.online && styles.peerActionDisabled
                  ]}
                  disabled={!item.online}
                >
                  <Ionicons 
                    name={item.online ? "person-add" : "close"} 
                    size={20} 
                    color={item.online ? COLORS.green : COLORS.textSecondary} 
                  />
                </TouchableOpacity>
              </View>
            )}
          />

          {/* Моя команда */}
          {team.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Моя команда</Text>
              <View style={styles.teamGrid}>
                {team.map((member, index) => (
                  <View key={index} style={styles.teamCard}>
                    <Image source={{ uri: member.avatar }} style={styles.teamAvatar} />
                    <Text style={styles.teamName}>{member.name}</Text>
                    <Text style={styles.teamIp}>{member.ip}</Text>
                    {member.isLeader && (
                      <View style={styles.leaderBadge}>
                        <Text style={styles.leaderText}>Лидер</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      )}

      {activeTab === 'profile' && (
        <View style={styles.tabContent}>
          <View style={styles.profileContainer}>
            <TouchableOpacity onPress={() => setShowAvatarPicker(true)}>
              <Image source={{ uri: profile.avatar }} style={styles.profileAvatar} />
              <View style={styles.avatarEditBadge}>
                <Ionicons name="camera" size={20} color="#fff" />
              </View>
            </TouchableOpacity>
            <Text style={styles.profileName}>{profile.name}</Text>
            <Text style={styles.profileId}>ID: {profile.id}</Text>
            <Text style={styles.profileIp}>IP: {profile.ip}</Text>

            <View style={styles.profileStats}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{chats.length}</Text>
                <Text style={styles.statLabel}>Контактов</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{team.length}</Text>
                <Text style={styles.statLabel}>В команде</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.settingsButton}>
              <Ionicons name="settings-outline" size={20} color={COLORS.text} />
              <Text style={styles.settingsText}>Настройки</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Нижняя навигация */}
      <View style={styles.tabBar}>
        <TouchableOpacity 
          style={styles.tabItem}
          onPress={() => setActiveTab('chats')}
        >
          <Ionicons 
            name={activeTab === 'chats' ? 'chatbubbles' : 'chatbubbles-outline'} 
            size={24} 
            color={activeTab === 'chats' ? COLORS.green : COLORS.textSecondary} 
          />
          <Text style={[
            styles.tabText,
            activeTab === 'chats' && styles.tabTextActive
          ]}>
            Чаты
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.tabItem}
          onPress={() => setActiveTab('games')}
        >
          <Ionicons 
            name={activeTab === 'games' ? 'game-controller' : 'game-controller-outline'} 
            size={24} 
            color={activeTab === 'games' ? COLORS.green : COLORS.textSecondary} 
          />
          <Text style={[
            styles.tabText,
            activeTab === 'games' && styles.tabTextActive
          ]}>
            Игры
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.tabItem}
          onPress={() => setActiveTab('profile')}
        >
          <Ionicons 
            name={activeTab === 'profile' ? 'person' : 'person-outline'} 
            size={24} 
            color={activeTab === 'profile' ? COLORS.green : COLORS.textSecondary} 
          />
          <Text style={[
            styles.tabText,
            activeTab === 'profile' && styles.tabTextActive
          ]}>
            Профиль
          </Text>
        </TouchableOpacity>
      </View>

      {/* Модальное окно создания команды */}
      <Modal visible={showCreateTeam} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Создать команду</Text>
            <Text style={styles.modalSubtitle}>Выберите игроков из сети</Text>
            
            <FlatList
              data={peers.filter(p => p.online)}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.modalPeerItem}>
                  <Image source={{ uri: item.avatar }} style={styles.modalPeerAvatar} />
                  <View style={styles.modalPeerInfo}>
                    <Text style={styles.modalPeerName}>{item.name}</Text>
                    <Text style={styles.modalPeerIp}>{item.ip}</Text>
                  </View>
                  <Ionicons name="add-circle-outline" size={24} color={COLORS.green} />
                </TouchableOpacity>
              )}
            />

            <TouchableOpacity 
              onPress={() => setShowCreateTeam(false)}
              style={styles.modalCloseButton}
            >
              <Text style={styles.modalCloseText}>Отмена</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Модальное окно выбора аватарки */}
      <Modal visible={showAvatarPicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Выберите аватарку</Text>
            <View style={styles.avatarGrid}>
              {['alex', 'maria', 'dmitry', 'anna', 'sergey', 'elena'].map((seed, index) => (
                <TouchableOpacity 
                  key={index}
                  onPress={() => {
                    const newProfile = { ...profile, avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}` };
                    setProfile(newProfile);
                    AsyncStorage.setItem('voiceyok_profile', JSON.stringify(newProfile));
                    setShowAvatarPicker(false);
                  }}
                >
                  <Image 
                    source={{ uri: `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}` }}
                    style={styles.avatarOption}
                  />
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity 
              onPress={() => setShowAvatarPicker(false)}
              style={styles.modalCloseButton}
            >
              <Text style={styles.modalCloseText}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Плавающая кнопка звонка (глобальная) */}
      {callMinimized && isInCall && activeTab !== 'chat' && (
        <View style={styles.floatingCallButton}>
          <TouchableOpacity 
            onPress={() => setCallMinimized(false)}
            style={styles.floatingCallMain}
          >
            <Ionicons name="call" size={20} color="#fff" />
            <Text style={styles.floatingCallText}>{formatDuration(callDuration)}</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={endCall}
            style={styles.floatingCallClose}
          >
            <Ionicons name="close" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  
  // Шапка
  mainHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  headerAvatarSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },

  // Контент вкладок
  tabContent: {
    flex: 1,
  },

  // Поиск
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgTertiary,
    margin: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 16,
  },
  addButton: {
    backgroundColor: COLORS.green,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Список чатов
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  chatAvatarContainer: {
    position: 'relative',
  },
  chatAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS.green,
    borderWidth: 2,
    borderColor: COLORS.bgSecondary,
  },
  chatInfo: {
    flex: 1,
    marginLeft: 12,
  },
  chatInfoTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  chatName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  chatTime: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  chatLastMessage: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },

  // Пустое состояние
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    color: COLORS.text,
    marginTop: 16,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 8,
  },

  // Игровая зона
  myNetworkCard: {
    backgroundColor: COLORS.bgTertiary,
    margin: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.green,
  },
  myNetworkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  myNetworkTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  myNetworkId: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  myNetworkIp: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 12,
  },
  createTeamButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.green,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
  },
  createTeamText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    paddingHorizontal: 16,
    marginBottom: 8,
    marginTop: 16,
  },

  peerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgTertiary,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
  },
  peerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  peerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  peerName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  peerIp: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  peerPing: {
    fontSize: 11,
    color: COLORS.green,
    marginTop: 2,
  },
  peerAction: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 200, 83, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  peerActionDisabled: {
    backgroundColor: 'rgba(122, 139, 158, 0.1)',
  },

  // Команда
  teamGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 12,
  },
  teamCard: {
    width: (width - 56) / 3,
    backgroundColor: COLORS.bgTertiary,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  teamAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginBottom: 8,
  },
  teamName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
  },
  teamIp: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  leaderBadge: {
    backgroundColor: COLORS.green,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 6,
  },
  leaderText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
  },

  // Профиль
  profileContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  profileAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    position: 'relative',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: COLORS.accentLight,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: COLORS.bg,
  },
  profileName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: 16,
  },
  profileId: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  profileIp: {
    fontSize: 14,
    color: COLORS.green,
    marginTop: 4,
  },
  profileStats: {
    flexDirection: 'row',
    gap: 32,
    marginTop: 24,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgTertiary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 24,
    gap: 8,
  },
  settingsText: {
    fontSize: 16,
    color: COLORS.text,
  },

  // Чат
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgSecondary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    marginRight: 8,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  headerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  headerName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  headerStatus: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  callButton: {
    padding: 8,
  },
  messagesList: {
    padding: 16,
  },
  messageBubble: {
    maxWidth: '75%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
  },
  myMessage: {
    backgroundColor: COLORS.bubble,
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  otherMessage: {
    backgroundColor: COLORS.bubbleOther,
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    color: COLORS.text,
  },
  messageTime: {
    fontSize: 10,
    color: COLORS.textSecondary,
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: COLORS.bgSecondary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 8,
  },
  messageInput: {
    flex: 1,
    backgroundColor: COLORS.bgTertiary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 15,
    maxHeight: 100,
  },
  sendButton: {
    padding: 8,
  },

  // Звонок
  callContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  callHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  callTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  callTimer: {
    fontSize: 16,
    color: COLORS.green,
    fontWeight: '600',
  },
  callContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  callAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  callName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: 16,
  },
  callStatus: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginTop: 8,
  },
  remoteVideo: {
    position: 'absolute',
    top: 100,
    right: 20,
    width: 120,
    height: 160,
    borderRadius: 12,
  },
  callControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    padding: 32,
  },
  callControlButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.bgTertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  endCallButton: {
    backgroundColor: '#ff3b30',
  },

  // Плавающая кнопка звонка
  floatingCallButton: {
    position: 'absolute',
    right: 16,
    bottom: 100,
    zIndex: 100,
  },
  floatingCallMain: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: COLORS.green,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  floatingCallText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 2,
  },
  floatingCallClose: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ff3b30',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },

  // Нижняя навигация
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.bgSecondary,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingVertical: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  tabText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  tabTextActive: {
    color: COLORS.green,
    fontWeight: '600',
  },

  // Модальные окна
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.bgSecondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 16,
  },
  modalPeerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalPeerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  modalPeerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  modalPeerName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  modalPeerIp: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  modalCloseButton: {
    backgroundColor: COLORS.bgTertiary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  modalCloseText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
    marginVertical: 16,
  },
  avatarOption: {
    width: 70,
    height: 70,
    borderRadius: 35,
  },
});
