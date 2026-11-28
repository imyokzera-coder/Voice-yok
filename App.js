import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Clipboard,
  Alert,
  Animated,
  TouchableWithoutFeedback,
  Easing,
  TouchableOpacity,
  Vibration,
  Switch,
  Image,
  Modal,
  FlatList,
  Dimensions,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Animatable from 'react-native-animatable';
import { useAudioRecorder, AudioModule, RecordingPresets, useAudioPlayer } from 'expo-audio';
import { RTCPeerConnection, RTCView, mediaDevices, RTCIceCandidate, RTCSessionDescription } from 'react-native-webrtc';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');
const CLICK_SOUND = require('./assets/click.mp3');

// ====================== АВАТАРКИ-ЗАГЛУШКИ ======================
const AVATAR_STUBS = [
  'https://api.dicebear.com/7.x/avataaars/png?seed=Skull1&backgroundColor=09090b',
  'https://api.dicebear.com/7.x/avataaars/png?seed=Skull2&backgroundColor=09090b',
  'https://api.dicebear.com/7.x/avataaars/png?seed=Skull3&backgroundColor=09090b',
  'https://api.dicebear.com/7.x/bottts/png?seed=Robot1&backgroundColor=09090b',
  'https://api.dicebear.com/7.x/bottts/png?seed=Robot2&backgroundColor=09090b',
  'https://api.dicebear.com/7.x/pixel-art/png?seed=Pixel1&backgroundColor=09090b',
  'https://api.dicebear.com/7.x/pixel-art/png?seed=Pixel2&backgroundColor=09090b',
  'https://cdn-icons-png.flaticon.com/512/149/149071.png',
];

const PulseIcon = ({ active, color, isMuted }) => {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (active) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.3, duration: 600, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      scale.setValue(1);
    }
  }, [active]);
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Ionicons name={isMuted ? 'mic-off' : 'mic'} size={24} color={color} />
    </Animated.View>
  );
};

const SmoothButton = ({ onPress, style, children, activeScale = 0.92 }) => {
  const scaleValue = useRef(new Animated.Value(1)).current;
  const handlePressIn = () => {
    Vibration.vibrate(10);
    Animated.spring(scaleValue, { toValue: activeScale, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  };
  const handlePressOut = () =>
    Animated.spring(scaleValue, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 10 }).start();
  return (
    <Animated.View style={{ transform: [{ scale: scaleValue }] }}>
      <TouchableWithoutFeedback onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={onPress}>
        <View style={style}>{children}</View>
      </TouchableWithoutFeedback>
    </Animated.View>
  );
};

export default function App() {
  const [screen, setScreen] = useState('home');
  const [activeTab, setActiveTab] = useState('chats');

  // Профиль
  const [name, setName] = useState('Yokzera');
  const [userCode, setUserCode] = useState('');
  const [avatar, setAvatar] = useState(AVATAR_STUBS[0]);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  // Комната / чат
  const [roomCode, setRoomCode] = useState('');
  const [msg, setMsg] = useState('');
  const [chat, setChat] = useState([]);
  const [myLocalIp, setMyLocalIp] = useState('192.168.0.101');
  const [isInCall, setIsInCall] = useState(false);
  const [myMicOn, setMyMicOn] = useState(true);
  const [remoteStream, setRemoteStream] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);

  // Сервер
  const [serverIp, setServerIp] = useState('192.168.0.101');
  const [tempIp, setTempIp] = useState('192.168.0.101');

  // Контакты
  const [contacts, setContacts] = useState([]);
  const [searchId, setSearchId] = useState('');

  // Игровые лобби
  const [gameLobbies, setGameLobbies] = useState([
    { id: 'LOBBY-DEMO1', title: 'Deathmatch Arena', ip: '192.168.1.50', players: 3, max: 8 },
    { id: 'LOBBY-DEMO2', title: 'Survival Zone', ip: '192.168.1.77', players: 1, max: 4 },
  ]);

  const recordTimer = useRef(null);
  const callTimer = useRef(null);
  const ws = useRef(null);
  const peerConnection = useRef(null);
  const localStream = useRef(null);
  const cardAnim = useRef(new Animated.Value(0)).current;
  const menuBtnAnim = useRef(new Animated.Value(1)).current;
  const callScreenAnim = useRef(new Animated.Value(1)).current;
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const player = useAudioPlayer();

  const clickPlayer = useAudioPlayer();
  const clickReady = useRef(false);
  const clickBusy = useRef(false);
  const lastClickAt = useRef(0);

  // ====================== ИНИЦИАЛИЗАЦИЯ ======================
  useEffect(() => {
    (async () => {
      try {
        // Загружаем IP
        const savedIp = await AsyncStorage.getItem('@voiceyok_ip');
        if (savedIp) {
          setServerIp(savedIp);
          setTempIp(savedIp);
          setMyLocalIp(savedIp);
        }

        // Загружаем / генерируем уникальный ID
        let storedCode = await AsyncStorage.getItem('@voiceyok_usercode');
        if (!storedCode) {
          storedCode = 'YOK' + Math.random().toString(36).substring(2, 7).toUpperCase();
          await AsyncStorage.setItem('@voiceyok_usercode', storedCode);
        }
        setUserCode(storedCode);

        // Загружаем имя и аватар
        const savedName = await AsyncStorage.getItem('@voiceyok_name');
        if (savedName) setName(savedName);

        const savedAvatar = await AsyncStorage.getItem('@voiceyok_avatar');
        if (savedAvatar) setAvatar(savedAvatar);

        // Загружаем контакты
        const savedContacts = await AsyncStorage.getItem('@voiceyok_contacts');
        if (savedContacts) setContacts(JSON.parse(savedContacts));
      } catch (e) {
        console.log('Init error', e);
      }
    })();
  }, []);

  // Таймер звонка
  useEffect(() => {
    if (isInCall) {
      callTimer.current = setInterval(() => setCallDuration((p) => p + 1), 1000);
    } else {
      clearInterval(callTimer.current);
      setCallDuration(0);
    }
    return () => clearInterval(callTimer.current);
  }, [isInCall]);

  const saveNewIp = async () => {
    try {
      await AsyncStorage.setItem('@voiceyok_ip', tempIp);
      setServerIp(tempIp);
      setMyLocalIp(tempIp);
      Alert.alert('Успех', 'IP сохранён: ' + tempIp);
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось сохранить IP');
    }
  };

  // Звук клика
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await clickPlayer.replace(CLICK_SOUND);
        clickPlayer.volume = 0;
        clickPlayer.play();
        setTimeout(() => {
          if (cancelled) return;
          try {
            clickPlayer.pause();
            clickPlayer.volume = 1;
            clickReady.current = true;
          } catch (e) {}
        }, 200);
      } catch (e) {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const playClick = useCallback(() => {
    if (!clickReady.current || isRecording) return;
    const now = Date.now();
    if (now - lastClickAt.current < 40 || clickBusy.current) return;
    lastClickAt.current = now;
    clickBusy.current = true;
    try {
      clickPlayer.seekTo(0);
      clickPlayer.play();
    } catch (e) {}
    setTimeout(() => {
      clickBusy.current = false;
    }, 80);
  }, [isRecording]);

  const formatTime = (sec) =>
    `${Math.floor(sec / 60)
      .toString()
      .padStart(2, '0')}:${(sec % 60).toString().padStart(2, '0')}`;

  // ====================== WEBSOCKET + WEBRTC ======================
  useEffect(() => {
    if (screen === 'room' && roomCode) {
      ws.current = new WebSocket(`ws://${serverIp}:3000`);
      ws.current.onopen = () =>
        ws.current.send(JSON.stringify({ action: 'join', room: roomCode, user: name || 'Гость' }));
      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.action === 'message') setChat((prev) => [...prev, { id: Date.now(), ...data.payload }]);
          else if (data.action === 'signal') handleSignal(data.payload);
        } catch (e) {}
      };
      ws.current.onerror = (e) =>
        Alert.alert('Ошибка WebSocket', e.message || 'Не удалось подключиться к ' + serverIp);
      return () => {
        if (ws.current) ws.current.close();
        if (peerConnection.current) peerConnection.current.close();
      };
    }
  }, [screen, roomCode, serverIp]);

  const handleSignal = async (data) => {
    if (data.type === 'offer') {
      await createPeerConnection();
      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.signal));
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);
      ws.current.send(JSON.stringify({ action: 'signal', room: roomCode, payload: answer }));
    } else if (data.type === 'answer') {
      if (peerConnection.current) await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.signal));
    } else if (data.candidate) {
      if (peerConnection.current) await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  };

  const createPeerConnection = async () => {
    try {
      const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
      localStream.current = stream;
      peerConnection.current = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      stream.getTracks().forEach((track) => peerConnection.current.addTrack(track, stream));
      peerConnection.current.onicecandidate = (event) => {
        if (event.candidate && ws.current)
          ws.current.send(JSON.stringify({ action: 'signal', room: roomCode, payload: { candidate: event.candidate } }));
      };
      peerConnection.current.ontrack = (event) => setRemoteStream(event.streams[0]);
    } catch (e) {
      throw new Error('Микрофон недоступен: ' + e.message);
    }
  };

  const startCall = async () => {
    try {
      playClick();
      setIsInCall(true);
      setIsSpeaking(true);
      setScreen('call');
      await createPeerConnection();
      const offer = await peerConnection.current.createOffer();
      await peerConnection.current.setLocalDescription(offer);
      ws.current.send(JSON.stringify({ action: 'signal', room: roomCode, payload: { type: 'offer', signal: offer } }));
    } catch (e) {
      Alert.alert('Ошибка звонка', e.message);
      setIsInCall(false);
      setScreen('room');
    }
  };

  const endCall = () => {
    playClick();
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    if (localStream.current) {
      localStream.current.getTracks().forEach((t) => t.stop());
      localStream.current = null;
    }
    setRemoteStream(null);
    setIsInCall(false);
    setIsSpeaking(false);
    setScreen('room');
  };

  const requestPermission = async () => {
    const status = await AudioModule.requestRecordingPermissionsAsync();
    if (!status.granted) {
      Alert.alert('Ошибка', 'Нет доступа к микрофону');
      return false;
    }
    return true;
  };

  const toggleCard = () => {
    playClick();
    Animated.sequence([
      Animated.timing(menuBtnAnim, { toValue: 1.2, duration: 100, useNativeDriver: true }),
      Animated.spring(menuBtnAnim, { toValue: 1, friction: 3, tension: 40, useNativeDriver: true }),
    ]).start();
    Animated.timing(cardAnim, {
      toValue: cardAnim._value === 0 ? 1 : 0,
      duration: 400,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const collapseCall = () => {
    Animated.timing(callScreenAnim, {
      toValue: 0,
      duration: 300,
      easing: Easing.in(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      setScreen('room');
      callScreenAnim.setValue(1);
    });
  };

  // ====================== ГОЛОСОВЫЕ ======================
  const handlePressIn = async () => {
    if (vibrationEnabled) Vibration.vibrate(10);
    const hasPermission = await requestPermission();
    if (!hasPermission) return;
    clearInterval(recordTimer.current);
    setRecordDuration(0);
    try {
      await audioRecorder.stop();
    } catch (e) {}
    await AudioModule.setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await audioRecorder.prepareToRecordAsync();
    audioRecorder.record();
    setIsRecording(true);
    recordTimer.current = setInterval(() => setRecordDuration((prev) => prev + 1), 1000);
  };

  const handlePressOut = async () => {
    if (!isRecording) return;
    playClick();
    clearInterval(recordTimer.current);
    try {
      await audioRecorder.stop();
    } catch (e) {}
    const duration = recordDuration;
    setIsRecording(false);
    setRecordDuration(0);
    if (duration > 0) {
      const voiceMsg = {
        user: name || 'Вы',
        text: `[Голосовое ${formatTime(duration)}]`,
        isVoice: true,
        uri: audioRecorder.uri,
      };
      if (ws.current) ws.current.send(JSON.stringify({ action: 'message', room: roomCode, payload: voiceMsg }));
      setChat((prev) => [...prev, { id: Date.now(), ...voiceMsg }]);
    }
  };

  const playVoice = async (uri) => {
    try {
      await player.replace({ uri });
      await player.play();
    } catch (e) {}
  };

  // ====================== КОМНАТЫ / ЛОББИ ======================
  const createRoom = (isLobby = false) => {
    playClick();
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomCode(code);
    setChat([]);
    if (isLobby) {
      const newLobby = {
        id: code,
        title: `Лобби ${code}`,
        ip: myLocalIp,
        players: 1,
        max: 8,
      };
      setGameLobbies((prev) => [newLobby, ...prev]);
    }
    setScreen('room');
  };

  const joinRoom = (code) => {
    playClick();
    if (code && code.length > 2) {
      setRoomCode(code.toUpperCase());
      setChat([]);
      setScreen('room');
    } else Alert.alert('Ошибка', 'Введите ID');
  };

  const copyCode = () => {
    playClick();
    Clipboard.setString(roomCode);
    Alert.alert('Успех', 'Код скопирован!');
  };

  const sendMsg = () => {
    playClick();
    if (msg.trim() && ws.current) {
      const messageData = { user: name || 'Вы', text: msg, isVoice: false };
      ws.current.send(JSON.stringify({ action: 'message', room: roomCode, payload: messageData }));
      setChat((prev) => [...prev, { id: Date.now(), ...messageData }]);
      setMsg('');
    }
  };

  // ====================== КОНТАКТЫ ======================
  const searchAndAddContact = async () => {
    playClick();
    if (!searchId.trim()) return Alert.alert('Ошибка', 'Введите ID');
    const id = searchId.trim().toUpperCase();
    if (contacts.some((c) => c.code === id)) {
      return Alert.alert('Уже есть', 'Этот контакт уже добавлен');
    }
    const newContact = {
      id: Date.now(),
      code: id,
      name: id,
      lastMsg: 'Контакт добавлен',
      time: 'Сейчас',
      online: Math.random() > 0.4,
    };
    const updated = [newContact, ...contacts];
    setContacts(updated);
    await AsyncStorage.setItem('@voiceyok_contacts', JSON.stringify(updated));
    setSearchId('');
    Alert.alert('Успех', `Контакт ${id} добавлен!`);
  };

  // ====================== АВАТАР ======================
  const changeAvatar = async (url) => {
    playClick();
    setAvatar(url);
    await AsyncStorage.setItem('@voiceyok_avatar', url);
    setShowAvatarPicker(false);
  };

  // ====================== ЭКРАН НАСТРОЕК ======================
  if (screen === 'settings') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Настройки</Text>
          <SmoothButton onPress={() => setScreen('home')} style={{ padding: 5 }}>
            <Ionicons name="close" size={28} color="#da373c" />
          </SmoothButton>
        </View>
        <ScrollView style={{ padding: 20 }}>
          <Text style={styles.sectionTitle}>АККАУНТ</Text>
          <View style={styles.settingsCard}>
            <TouchableOpacity style={styles.settingsItem}>
              <Text style={styles.settingsText}>Привязать аккаунт (скоро)</Text>
              <Ionicons name="chevron-forward" size={20} color="#71717a" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.settingsItem}>
              <Text style={styles.settingsText}>Чёрный список</Text>
              <Ionicons name="chevron-forward" size={20} color="#71717a" />
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>ТЕСТ: IP СЕРВЕРА</Text>
          <View style={styles.settingsCard}>
            <Text style={{ color: '#71717a', fontSize: 12, marginBottom: 10 }}>Текущий IP: {serverIp}</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="server-outline" size={20} color="#71717a" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={tempIp}
                onChangeText={setTempIp}
                placeholder="192.168.x.x"
                placeholderTextColor="#71717a"
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <SmoothButton style={styles.primaryBtn} onPress={saveNewIp}>
              <Text style={styles.primaryBtnText}>Сохранить IP</Text>
            </SmoothButton>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ====================== ЭКРАН КОМНАТЫ ======================
  if (screen === 'room') {
    return (
      <SafeAreaView style={styles.container}>
        {isRecording && (
          <View style={{ position: 'absolute', bottom: 85, right: 60, zIndex: 999 }}>
            <View
              style={{
                backgroundColor: '#da373c',
                paddingHorizontal: 20,
                paddingVertical: 8,
                borderRadius: 30,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Ionicons name="mic" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>{formatTime(recordDuration)}</Text>
            </View>
          </View>
        )}

        <View style={styles.roomHeaderCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={styles.roomTitle}>Комната {roomCode}</Text>
              <MaterialCommunityIcons name="skull" size={24} color="#23a559" />
            </View>
            <SmoothButton
              style={styles.disconnectBtn}
              onPress={() => {
                if (ws.current) ws.current.close();
                endCall();
                setScreen('home');
              }}
            >
              <Ionicons name="log-out-outline" size={18} color="#fff" />
              <Text style={styles.disconnectText}>Выйти</Text>
            </SmoothButton>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <SmoothButton style={styles.actionBtn} onPress={copyCode}>
              <Ionicons name="copy-outline" size={16} color="#a1a1aa" />
              <Text style={styles.actionBtnText}>Копировать ID</Text>
            </SmoothButton>
            <Animated.View style={{ transform: [{ scale: menuBtnAnim }] }}>
              <SmoothButton style={styles.squareBtn} onPress={toggleCard}>
                <Ionicons name="menu" size={24} color="#a1a1aa" />
              </SmoothButton>
            </Animated.View>
            <SmoothButton
              style={[styles.squareBtn, { backgroundColor: isInCall ? '#da373c' : '#1f3a29' }]}
              onPress={startCall}
            >
              <Ionicons name={isInCall ? 'return-down-forward' : 'call'} size={24} color="#fff" />
            </SmoothButton>
          </View>
        </View>

        <Animated.View
          style={{
            marginHorizontal: 20,
            marginBottom: 10,
            opacity: cardAnim,
            transform: [
              { scale: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [0.01, 1] }) },
              { translateX: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [130, 0] }) },
              { translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [-80, 0] }) },
            ],
          }}
        >
          <View style={styles.newParticipantCard}>
            <View style={styles.avatarContainer}>
              <Image source={{ uri: avatar }} style={{ width: 50, height: 50, borderRadius: 16 }} />
              <View style={styles.onlineDot} />
            </View>
            <View style={{ flex: 1, marginLeft: 15 }}>
              <Text style={styles.participantNameBig}>{name || 'Вы'}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 10 }}>
              <TouchableOpacity
                onPress={() => {
                  Clipboard.setString(myLocalIp);
                  Alert.alert('Успех', 'IP скопирован');
                }}
              >
                <View style={styles.ipBadge}>
                  <Text style={styles.ipText}>{myLocalIp}</Text>
                </View>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <MaterialCommunityIcons name="skull" size={16} color="#23a559" />
                <Text style={{ color: '#23a559', fontWeight: 'bold', fontSize: 12 }}>12 ms</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        <View style={styles.chatContainer}>
          {chat.length === 0 && <Text style={styles.emptyText}>Чат пуст...</Text>}
          <ScrollView>
            {chat.map((m) => (
              <Animatable.View key={m.id} animation="fadeInUp" duration={300}>
                <View style={styles.msgBubble}>
                  <Text style={styles.msgAuthor}>{m.user}</Text>
                  {m.isVoice ? (
                    <TouchableOpacity
                      onPress={() => playVoice(m.uri)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                    >
                      <View style={{ backgroundColor: '#5865F2', padding: 8, borderRadius: 20 }}>
                        <Ionicons name="play" size={16} color="#fff" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.msgText}>Голосовое сообщение</Text>
                        <Text style={{ color: '#71717a', fontSize: 10 }}>
                          {m.text.match(/\[Голосовое (.*)\]/)?.[1] || '00:00'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.msgText}>{m.text}</Text>
                  )}
                </View>
              </Animatable.View>
            ))}
          </ScrollView>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.bottomBar}>
            <TextInput
              style={styles.chatInput}
              placeholder="Сообщение..."
              placeholderTextColor="#71717a"
              value={msg}
              onChangeText={setMsg}
            />
            <TouchableOpacity
              onPressIn={() => {
                if (!isRecording) handlePressIn();
              }}
              onPressOut={() => {
                if (isRecording) handlePressOut();
              }}
              activeOpacity={0.7}
              style={[styles.micBtnSmall, isRecording && { backgroundColor: '#da373c' }]}
            >
              <Ionicons name={isRecording ? 'mic' : 'mic-outline'} size={22} color={isRecording ? '#fff' : '#a1a1aa'} />
            </TouchableOpacity>
            <SmoothButton style={styles.sendBtn} onPress={sendMsg}>
              <Ionicons name="send" size={20} color="#fff" />
            </SmoothButton>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ====================== ЭКРАН ЗВОНКА ======================
  if (screen === 'call') {
    return (
      <Animated.View
        style={[
          styles.container,
          {
            opacity: callScreenAnim,
            transform: [{ scale: callScreenAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
          },
        ]}
      >
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={styles.headerTitle}>Звонок</Text>
            <Text style={{ color: '#23a559', fontWeight: 'bold' }}>{formatTime(callDuration)}</Text>
          </View>
          <SmoothButton onPress={collapseCall} style={{ padding: 5 }}>
            <Ionicons name="chevron-down" size={32} color="#a1a1aa" />
          </SmoothButton>
        </View>
        <View style={styles.callGrid}>
          <View style={styles.callSquare}>
            <View style={styles.callSquareHeader}>
              <Text style={styles.callSquareName}>{name || 'Вы'}</Text>
              <Text style={styles.callSquareIp}>{myLocalIp}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <MaterialCommunityIcons name="skull" size={20} color="#23a559" />
                <Text style={{ color: '#23a559', fontWeight: 'bold', fontSize: 12 }}>12 ms</Text>
              </View>
              <SmoothButton onPress={() => setMyMicOn(!myMicOn)} activeScale={0.8}>
                <PulseIcon active={myMicOn && isSpeaking} color={myMicOn ? '#23a559' : '#da373c'} isMuted={!myMicOn} />
              </SmoothButton>
            </View>
          </View>
          <View style={[styles.callSquare, { borderColor: '#27272a' }]}>
            <View style={styles.callSquareHeader}>
              <Text style={styles.callSquareName}>Собеседник</Text>
              <Text style={styles.callSquareIp}>{remoteStream ? 'Подключён' : 'Ожидание...'}</Text>
            </View>
            {remoteStream && (
              <RTCView streamURL={remoteStream.toURL()} style={{ flex: 1, width: '100%' }} objectFit="cover" />
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <MaterialCommunityIcons name="skull" size={20} color={remoteStream ? '#23a559' : '#f1c40f'} />
                <Text style={{ color: remoteStream ? '#23a559' : '#f1c40f', fontWeight: 'bold', fontSize: 12 }}>
                  {remoteStream ? '12 ms' : '-- ms'}
                </Text>
              </View>
              <Ionicons name="mic" size={28} color="#3f3f46" />
            </View>
          </View>
        </View>
        <View style={{ padding: 30, alignItems: 'center' }}>
          <SmoothButton style={styles.endCallBtn} onPress={endCall}>
            <Ionicons name="call" size={30} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
          </SmoothButton>
        </View>
      </Animated.View>
    );
  }

  // ====================== ГЛАВНЫЙ ЭКРАН ======================
  return (
    <SafeAreaView style={styles.container}>
      {/* ВЕРХНЯЯ ПАНЕЛЬ */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: 10,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <MaterialCommunityIcons name="skull" size={32} color="#23a559" />
          <Text style={styles.logoText}>voice yok</Text>
        </View>
        <SmoothButton
          style={styles.settingsBtn}
          onPress={() => {
            setScreen('settings');
            if (vibrationEnabled) Vibration.vibrate(10);
          }}
        >
          <Ionicons name="settings-outline" size={24} color="#a1a1aa" />
        </SmoothButton>
      </View>

      {/* КОНТЕНТ ВКЛАДОК */}
      <View style={{ flex: 1 }}>
        {/* ========== ЧАТЫ ========== */}
        {activeTab === 'chats' && (
          <View style={{ flex: 1 }}>
            <View style={{ paddingHorizontal: 20, marginBottom: 10, flexDirection: 'row', gap: 10 }}>
              <View style={[styles.searchBar, { flex: 1 }]}>
                <Ionicons name="search" size={20} color="#71717a" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Введите ID друга..."
                  placeholderTextColor="#71717a"
                  value={searchId}
                  onChangeText={setSearchId}
                  autoCapitalize="characters"
                />
              </View>
              <TouchableOpacity style={styles.addButton} onPress={searchAndAddContact}>
                <Ionicons name="person-add" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              {contacts.length === 0 && (
                <Text style={{ color: '#71717a', textAlign: 'center', marginTop: 50 }}>
                  Нет контактов. Добавьте друга по ID.
                </Text>
              )}
              {contacts.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.chatItem}
                  onPress={() => Alert.alert('Скоро', 'Личные чаты будут позже')}
                >
                  <View style={[styles.chatAvatar, { backgroundColor: item.online ? '#1f3a29' : '#3b2d5c' }]}>
                    <Text style={styles.chatAvatarText}>{item.name[0]}</Text>
                    {item.online && <View style={styles.onlineIndicator} />}
                  </View>
                  <View style={styles.chatInfo}>
                    <View style={styles.chatRow}>
                      <Text style={styles.chatName}>{item.name}</Text>
                      <Text style={styles.chatTime}>{item.time}</Text>
                    </View>
                    <Text style={styles.chatLastMsg} numberOfLines={1}>
                      {item.lastMsg}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* FAB создать группу/комнату */}
            <TouchableOpacity style={styles.fab} onPress={() => createRoom(false)}>
              <Ionicons name="add" size={30} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {/* ========== ИГРОВАЯ ЗОНА ========== */}
        {activeTab === 'games' && (
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text style={{ color: '#fafafa', fontSize: 24, fontWeight: 'bold', marginBottom: 20 }}>Игровая зона</Text>

            <SmoothButton style={[styles.primaryBtn, { marginBottom: 20 }]} onPress={() => createRoom(true)}>
              <Text style={styles.primaryBtnText}>+ Создать лобби</Text>
              <Ionicons name="add" size={20} color="#fff" />
            </SmoothButton>

            {gameLobbies.length === 0 && (
              <Text style={{ color: '#71717a', textAlign: 'center', marginTop: 50 }}>
                Нет активных лобби. Создайте первое!
              </Text>
            )}
            {gameLobbies.map((lobby) => (
              <View key={lobby.id} style={styles.lobbyCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>{lobby.title}</Text>
                  <Text style={{ color: '#23a559', fontSize: 12 }}>IP: {lobby.ip}</Text>
                </View>
                <Text style={{ color: '#71717a', marginTop: 5 }}>
                  Игроков: {lobby.players}/{lobby.max}
                </Text>
                <SmoothButton
                  style={[styles.primaryBtn, { marginTop: 15, backgroundColor: '#1f3a29' }]}
                  onPress={() => joinRoom(lobby.id)}
                >
                  <Text style={styles.primaryBtnText}>Присоединиться</Text>
                  <Ionicons name="arrow-forward" size={20} color="#fff" />
                </SmoothButton>
              </View>
            ))}
          </ScrollView>
        )}

        {/* ========== ПРОФИЛЬ ========== */}
        {activeTab === 'profile' && (
          <ScrollView contentContainerStyle={{ padding: 20, alignItems: 'center' }}>
            <TouchableOpacity onPress={() => setShowAvatarPicker(true)}>
              <View style={styles.profileAvatar}>
                <Image source={{ uri: avatar }} style={{ width: '100%', height: '100%', borderRadius: 60 }} />
                <View
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    backgroundColor: '#5865F2',
                    padding: 5,
                    borderRadius: 15,
                  }}
                >
                  <Ionicons name="camera" size={20} color="#fff" />
                </View>
              </View>
            </TouchableOpacity>
            <Text style={{ color: '#fff', fontSize: 26, fontWeight: 'bold', marginTop: 15 }}>{name}</Text>
            <Text style={{ color: '#71717a', fontSize: 14, marginTop: 5 }}>ID: {userCode}</Text>

            <View style={{ width: '100%', marginTop: 30 }}>
              <Text style={styles.sectionTitle}>НАСТРОЙКИ ПРОФИЛЯ</Text>
              <View style={styles.settingsCard}>
                <TouchableOpacity
                  style={styles.settingsItem}
                  onPress={() => {
                    Alert.prompt
                      ? Alert.prompt(
                          'Изменить имя',
                          'Введите новое имя',
                          [
                            { text: 'Отмена', style: 'cancel' },
                            {
                              text: 'Сохранить',
                              onPress: async (text) => {
                                if (text && text.trim()) {
                                  setName(text.trim());
                                  await AsyncStorage.setItem('@voiceyok_name', text.trim());
                                }
                              },
                            },
                          ],
                          'plain-text',
                          name
                        )
                      : Alert.alert('Скоро', 'Изменение имени будет в следующем обновлении');
                  }}
                >
                  <Text style={styles.settingsText}>Изменить имя</Text>
                  <Ionicons name="chevron-forward" size={20} color="#71717a" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.settingsItem} onPress={() => setScreen('settings')}>
                  <Text style={styles.settingsText}>Настройки сервера</Text>
                  <Ionicons name="chevron-forward" size={20} color="#71717a" />
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        )}
      </View>

      {/* ПЛАВАЮЩАЯ КНОПКА ЗВОНКА */}
      <TouchableOpacity
        style={styles.floatingCallBtn}
        onPress={() => {
          if (roomCode) startCall();
          else Alert.alert('Ошибка', 'Сначала создайте комнату или зайдите в лобби');
        }}
      >
        <Ionicons name="call" size={28} color="#fff" />
      </TouchableOpacity>

      {/* НИЖНЯЯ ПАНЕЛЬ ВКЛАДОК */}
      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('chats')}>
          <Ionicons
            name={activeTab === 'chats' ? 'chatbubbles' : 'chatbubbles-outline'}
            size={24}
            color={activeTab === 'chats' ? '#5865F2' : '#71717a'}
          />
          <Text style={[styles.tabText, activeTab === 'chats' && { color: '#5865F2' }]}>Чаты</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('games')}>
          <Ionicons
            name={activeTab === 'games' ? 'game-controller' : 'game-controller-outline'}
            size={24}
            color={activeTab === 'games' ? '#5865F2' : '#71717a'}
          />
          <Text style={[styles.tabText, activeTab === 'games' && { color: '#5865F2' }]}>Игры</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('profile')}>
          <Ionicons
            name={activeTab === 'profile' ? 'person' : 'person-outline'}
            size={24}
            color={activeTab === 'profile' ? '#5865F2' : '#71717a'}
          />
          <Text style={[styles.tabText, activeTab === 'profile' && { color: '#5865F2' }]}>Профиль</Text>
        </TouchableOpacity>
      </View>

      {/* МОДАЛКА ВЫБОРА АВАТАРКИ */}
      <Modal visible={showAvatarPicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 15 }}>Выбери аватарку</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 }}>
              {AVATAR_STUBS.map((url, i) => (
                <TouchableOpacity key={i} onPress={() => changeAvatar(url)}>
                  <Image
                    source={{ uri: url }}
                    style={{
                      width: 70,
                      height: 70,
                      borderRadius: 35,
                      borderWidth: avatar === url ? 3 : 0,
                      borderColor: '#23a559',
                    }}
                  />
                </TouchableOpacity>
              ))}
            </View>
            <SmoothButton
              style={[styles.primaryBtn, { marginTop: 20, backgroundColor: '#da373c' }]}
              onPress={() => setShowAvatarPicker(false)}
            >
              <Text style={styles.primaryBtnText}>Закрыть</Text>
            </SmoothButton>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090b' },
  logoText: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  settingsBtn: {
    backgroundColor: '#18181b',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272a',
  },

  profileAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#3b2d5c',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  sectionTitle: {
    color: '#71717a',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 10,
    marginLeft: 10,
    marginTop: 20,
  },
  settingsCard: {
    backgroundColor: '#121214',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#27272a',
  },
  settingsItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  settingsText: { color: '#fff', fontSize: 16 },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121214',
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  searchInput: { flex: 1, color: '#fff', marginLeft: 10, fontSize: 16 },
  addButton: {
    backgroundColor: '#23a559',
    width: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },

  chatItem: {
    flexDirection: 'row',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#18181b',
  },
  chatAvatar: {
    width: 55,
    height: 55,
    borderRadius: 27.5,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  chatAvatarText: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#23a559',
    borderWidth: 2,
    borderColor: '#09090b',
  },
  chatInfo: { flex: 1, marginLeft: 15, justifyContent: 'center' },
  chatRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  chatName: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  chatTime: { color: '#71717a', fontSize: 12 },
  chatLastMsg: { color: '#a1a1aa', fontSize: 14 },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#5865F2',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
  },

  lobbyCard: {
    backgroundColor: '#121214',
    borderRadius: 16,
    padding: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#27272a',
  },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#121214',
    borderTopWidth: 1,
    borderTopColor: '#27272a',
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 25 : 10,
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  tabText: { fontSize: 12, fontWeight: '600', color: '#71717a' },

  floatingCallBtn: {
    position: 'absolute',
    right: -20,
    top: '40%',
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#23a559',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#121214',
    borderBottomWidth: 1,
    borderBottomColor: '#27272a',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fafafa' },
  roomHeaderCard: {
    backgroundColor: '#121214',
    margin: 20,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#27272a',
    zIndex: 10,
  },
  roomTitle: { color: '#fafafa', fontSize: 20, fontWeight: 'bold' },
  disconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#da373c',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 5,
  },
  disconnectText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181b',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272a',
    gap: 8,
  },
  actionBtnText: { color: '#a1a1aa', fontSize: 14, fontWeight: '600' },
  squareBtn: {
    backgroundColor: '#18181b',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatContainer: { flex: 1, paddingHorizontal: 20, justifyContent: 'center' },
  emptyText: { color: '#71717a', textAlign: 'center', fontSize: 16 },
  msgBubble: {
    backgroundColor: '#121214',
    padding: 15,
    borderRadius: 16,
    marginBottom: 10,
    alignSelf: 'flex-start',
    maxWidth: '85%',
    borderWidth: 1,
    borderColor: '#27272a',
  },
  msgAuthor: { color: '#5865F2', fontSize: 12, fontWeight: 'bold', marginBottom: 5 },
  msgText: { color: '#fafafa', fontSize: 15 },
  bottomBar: {
    flexDirection: 'row',
    padding: 20,
    backgroundColor: '#121214',
    borderTopWidth: 1,
    borderTopColor: '#27272a',
    alignItems: 'center',
    gap: 10,
  },
  micBtnSmall: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#18181b',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#27272a',
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#09090b',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    color: '#fafafa',
    borderWidth: 1,
    borderColor: '#27272a',
  },
  sendBtn: {
    backgroundColor: '#5865F2',
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  callGrid: {
    flex: 1,
    padding: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 15,
    justifyContent: 'center',
    alignContent: 'center',
  },
  callSquare: {
    backgroundColor: '#121214',
    borderWidth: 1,
    borderColor: '#5865F2',
    borderRadius: 24,
    padding: 20,
    width: '45%',
    aspectRatio: 1,
    justifyContent: 'space-between',
  },
  callSquareHeader: { width: '100%', zIndex: 2 },
  callSquareName: { color: '#fafafa', fontSize: 18, fontWeight: 'bold' },
  callSquareIp: { color: '#a1a1aa', fontSize: 12, marginTop: 2 },
  endCallBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#da373c',
    justifyContent: 'center',
    alignItems: 'center',
  },
  newParticipantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121214',
    padding: 15,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#5865F2',
    position: 'relative',
  },
  avatarContainer: { position: 'relative' },
  onlineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#23a559',
    position: 'absolute',
    bottom: -2,
    right: -2,
    borderWidth: 2,
    borderColor: '#121214',
  },
  participantNameBig: { color: '#fafafa', fontSize: 18, fontWeight: 'bold' },
  ipBadge: {
    backgroundColor: '#0f2e2d',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  ipText: { color: '#23a559', fontSize: 12, fontWeight: 'bold' },
  primaryBtn: {
    flexDirection: 'row',
    backgroundColor: '#5865F2',
    borderRadius: 16,
    padding: 18,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#09090b',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#27272a',
    paddingHorizontal: 15,
    marginBottom: 20,
  },
  input: { flex: 1, color: '#fafafa', paddingVertical: 16, fontSize: 16 },
  inputIcon: { marginRight: 10 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#121214',
    borderRadius: 20,
    padding: 25,
    width: width * 0.85,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#27272a',
  },
});
