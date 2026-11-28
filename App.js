import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Animated, Dimensions, Image, KeyboardAvoidingView, Modal, Platform,
  SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity,
  Vibration, View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Animatable from 'react-native-animatable';
import * as Clipboard from 'expo-clipboard';
import {
  AudioModule, RecordingPresets, useAudioPlayer, useAudioRecorder,
} from 'expo-audio';
import {
  RTCPeerConnection, RTCView, mediaDevices, RTCIceCandidate,
  RTCSessionDescription,
} from 'react-native-webrtc';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');
const AVATARS = [
  'https://api.dicebear.com/7.x/avataaars/png?seed=Skull1&backgroundColor=09090b',
  'https://api.dicebear.com/7.x/avataaars/png?seed=Skull2&backgroundColor=09090b',
  'https://api.dicebear.com/7.x/avataaars/png?seed=Skull3&backgroundColor=09090b',
  'https://api.dicebear.com/7.x/bottts/png?seed=Robot1&backgroundColor=09090b',
  'https://api.dicebear.com/7.x/bottts/png?seed=Robot2&backgroundColor=09090b',
  'https://api.dicebear.com/7.x/pixel-art/png?seed=Pixel1&backgroundColor=09090b',
  'https://cdn-icons-png.flaticon.com/512/149/149071.png',
];

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const makeUserCode = () => `YOK${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
const formatTime = (seconds = 0) =>
  `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;

function PressButton({ onPress, style, children, disabled }) {
  const scale = useRef(new Animated.Value(1)).current;
  const animate = (toValue) => Animated.spring(scale, {
    toValue, useNativeDriver: true, speed: 35, bounciness: 5,
  }).start();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        activeOpacity={0.85}
        disabled={disabled}
        onPressIn={() => animate(0.96)}
        onPressOut={() => animate(1)}
        onPress={onPress}
        style={style}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

function PulseMic({ active, muted }) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let animation;
    if (active && !muted) {
      animation = Animated.loop(Animated.sequence([
        Animated.timing(scale, { toValue: 1.22, duration: 550, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 550, useNativeDriver: true }),
      ]));
      animation.start();
    } else {
      scale.setValue(1);
    }
    return () => animation?.stop();
  }, [active, muted, scale]);
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Ionicons name={muted ? 'mic-off' : 'mic'} size={25} color={muted ? '#da373c' : '#23a559'} />
    </Animated.View>
  );
}

export default function App() {
  const [screen, setScreen] = useState('home');
  const [tab, setTab] = useState('chats');
  const [name, setName] = useState('Yokzera');
  const [userCode, setUserCode] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [avatarPicker, setAvatarPicker] = useState(false);

  const [serverIp, setServerIp] = useState('192.168.0.101');
  const [tempIp, setTempIp] = useState('192.168.0.101');
  const [roomCode, setRoomCode] = useState('');
  const [connection, setConnection] = useState('disconnected');
  const [message, setMessage] = useState('');
  const [chat, setChat] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [searchId, setSearchId] = useState('');
  const [lobbies, setLobbies] = useState([]);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);

  const [isInCall, setIsInCall] = useState(false);
  const [callMinimized, setCallMinimized] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [remoteStream, setRemoteStream] = useState(null);
  const [callSeconds, setCallSeconds] = useState(0);

  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const ws = useRef(null);
  const wsReady = useRef(false);
  const pendingMessages = useRef([]);
  const peer = useRef(null);
  const localStream = useRef(null);
  const remoteCandidates = useRef([]);
  const recordingRef = useRef(false);
  const recordPressHeld = useRef(false);
  const recordingStartedAt = useRef(0);
  const recordInterval = useRef(null);
  const callInterval = useRef(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const audioPlayer = useAudioPlayer();

  const notify = useCallback((title, text) => Alert.alert(title, text), []);
  const vibrate = useCallback(() => {
    if (vibrationEnabled) Vibration.vibrate(10);
  }, [vibrationEnabled]);

  // Загрузка локальных настроек и сохранённых данных.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [
          savedIp, savedCode, savedName, savedAvatar, savedContacts, savedLobbies,
        ] = await Promise.all([
          AsyncStorage.getItem('@voiceyok_ip'),
          AsyncStorage.getItem('@voiceyok_usercode'),
          AsyncStorage.getItem('@voiceyok_name'),
          AsyncStorage.getItem('@voiceyok_avatar'),
          AsyncStorage.getItem('@voiceyok_contacts'),
          AsyncStorage.getItem('@voiceyok_lobbies'),
        ]);
        if (!alive) return;
        const code = savedCode || makeUserCode();
        if (!savedCode) await AsyncStorage.setItem('@voiceyok_usercode', code);
        setUserCode(code);
        if (savedIp) { setServerIp(savedIp); setTempIp(savedIp); }
        if (savedName) setName(savedName);
        if (savedAvatar) setAvatar(savedAvatar);
        if (savedContacts) setContacts(JSON.parse(savedContacts));
        if (savedLobbies) setLobbies(JSON.parse(savedLobbies));
      } catch (error) {
        console.warn('VoiceYok init:', error);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Таймер звонка.
  useEffect(() => {
    if (isInCall) {
      callInterval.current = setInterval(() => setCallSeconds((value) => value + 1), 1000);
    } else {
      clearInterval(callInterval.current);
      setCallSeconds(0);
    }
    return () => clearInterval(callInterval.current);
  }, [isInCall]);

  // История хранится отдельно для каждой комнаты на этом устройстве.
  useEffect(() => {
    let alive = true;
    if (!roomCode) return undefined;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(`@voiceyok_chat_${roomCode}`);
        if (alive && raw) setChat(JSON.parse(raw));
      } catch (error) {
        console.warn('Не удалось загрузить историю:', error);
      }
    })();
    return () => { alive = false; };
  }, [roomCode]);

  const persistChat = useCallback((items, code = roomCode) => {
    if (!code) return;
    AsyncStorage.setItem(`@voiceyok_chat_${code}`, JSON.stringify(items))
      .catch((error) => console.warn('Не удалось сохранить чат:', error));
  }, [roomCode]);

  const addChatMessage = useCallback((item) => {
    setChat((previous) => {
      // clientId позволяет не добавлять второй раз собственное сообщение,
      // если сервер рассылает отправителю его же сообщение обратно.
      if (item.clientId && previous.some((entry) => entry.clientId === item.clientId)) return previous;
      const next = [...previous, { id: item.id || makeId(), ...item }];
      persistChat(next);
      return next;
    });
  }, [persistChat]);

  const sendSocket = useCallback((payload) => {
    const socket = ws.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
      return true;
    }
    if (socket?.readyState === WebSocket.CONNECTING) {
      pendingMessages.current.push(payload);
      return true;
    }
    return false;
  }, []);

  const closePeer = useCallback(() => {
    try { peer.current?.close(); } catch (_) {}
    peer.current = null;
    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => track.stop());
      localStream.current = null;
    }
    remoteCandidates.current = [];
    setRemoteStream(null);
  }, []);

  const createPeer = useCallback(async () => {
    if (peer.current) return peer.current;
    const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
    localStream.current = stream;

    const connection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    peer.current = connection;
    stream.getTracks().forEach((track) => connection.addTrack(track, stream));

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        sendSocket({
          action: 'signal',
          room: roomCode,
          payload: { type: 'candidate', candidate: event.candidate },
        });
      }
    };
    connection.ontrack = (event) => {
      const streamFromEvent = event.streams?.[0];
      if (streamFromEvent) setRemoteStream(streamFromEvent);
    };
    connection.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(connection.connectionState)) {
        if (connection.connectionState === 'failed') {
          notify('Связь потеряна', 'Не удалось установить WebRTC-соединение.');
        }
      }
    };
    return connection;
  }, [notify, roomCode, sendSocket]);

  const handleSignal = useCallback(async (payload) => {
    try {
      if (!payload) return;
      const signalType = payload.type || payload.signal?.type;
      if (signalType === 'offer') {
        const connection = await createPeer();
        await connection.setRemoteDescription(
          new RTCSessionDescription(payload.signal || payload),
        );
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        sendSocket({
          action: 'signal',
          room: roomCode,
          payload: { type: 'answer', signal: answer },
        });
        setIsInCall(true);
        setCallMinimized(false);
        setScreen('call');
        // Применяем ICE-кандидаты, пришедшие до SDP.
        const queued = remoteCandidates.current.splice(0);
        for (const candidate of queued) await connection.addIceCandidate(candidate);
      } else if (signalType === 'answer') {
        if (!peer.current) return;
        await peer.current.setRemoteDescription(
          new RTCSessionDescription(payload.signal || payload),
        );
        const queued = remoteCandidates.current.splice(0);
        for (const candidate of queued) await peer.current.addIceCandidate(candidate);
      } else if (payload.candidate) {
        const candidate = new RTCIceCandidate(payload.candidate);
        if (peer.current?.remoteDescription) {
          await peer.current.addIceCandidate(candidate);
        } else {
          remoteCandidates.current.push(candidate);
        }
      }
    } catch (error) {
      console.warn('WebRTC signal error:', error);
      notify('Ошибка звонка', error.message || 'Не удалось обработать сигнал.');
    }
  }, [createPeer, notify, roomCode, sendSocket]);

  // WebSocket живёт всё время, пока выбрана комната, в том числе при открытом экране звонка.
  useEffect(() => {
    if (!roomCode) return undefined;
    let active = true;
    setConnection('connecting');
    pendingMessages.current = [];

    const socket = new WebSocket(`ws://${serverIp.trim()}:3000`);
    ws.current = socket;

    socket.onopen = () => {
      if (!active) return;
      wsReady.current = true;
      setConnection('connected');
      socket.send(JSON.stringify({
        action: 'join',
        room: roomCode,
        user: name || 'Гость',
        userId: userCode,
      }));
      pendingMessages.current.splice(0).forEach((item) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(item));
      });
    };
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.action === 'message' && data.payload) {
          addChatMessage(data.payload);
        } else if (data.action === 'signal') {
          handleSignal(data.payload);
        } else if (data.action === 'system') {
          addChatMessage({
            clientId: data.id || makeId(),
            user: 'Система',
            text: data.payload?.text || data.text || 'Событие комнаты',
          });
        }
      } catch (error) {
        console.warn('WebSocket message parse error:', error);
      }
    };
    socket.onerror = () => {
      if (active) setConnection('error');
    };
    socket.onclose = () => {
      if (active) {
        wsReady.current = false;
        setConnection('disconnected');
      }
    };

    return () => {
      active = false;
      wsReady.current = false;
      if (ws.current === socket) ws.current = null;
      try { socket.close(); } catch (_) {}
    };
  }, [roomCode, serverIp, name, userCode, addChatMessage, handleSignal]);

  // Реально выключаем/включаем аудиотрек, а не только иконку.
  useEffect(() => {
    localStream.current?.getAudioTracks().forEach((track) => { track.enabled = micOn; });
  }, [micOn]);

  const saveIp = async () => {
    const value = tempIp.trim();
    const valid = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/.test(value);
    if (!valid) return notify('Некорректный IP', 'Введите IPv4-адрес, например 192.168.0.101.');
    try {
      await AsyncStorage.setItem('@voiceyok_ip', value);
      setServerIp(value);
      notify('Сохранено', `Адрес сервера: ${value}`);
    } catch (_) {
      notify('Ошибка', 'Не удалось сохранить IP-адрес.');
    }
  };

  const createRoom = async (isGame = false) => {
    vibrate();
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    setChat([]);
    setRoomCode(code);
    if (isGame) {
      const newLobby = {
        id: code, title: `Лобби ${code}`, ip: serverIp, players: 1, max: 8,
      };
      setLobbies((old) => {
        const next = [newLobby, ...old];
        AsyncStorage.setItem('@voiceyok_lobbies', JSON.stringify(next)).catch(() => {});
        return next;
      });
    }
    setScreen('room');
  };

  const joinRoom = (code) => {
    const normalized = (code || '').trim().toUpperCase();
    if (normalized.length < 3) return notify('Ошибка', 'Введите корректный ID комнаты.');
    setChat([]);
    setRoomCode(normalized);
    setScreen('room');
  };

  const exitRoom = () => {
    if (isInCall) {
      closePeer();
      setIsInCall(false);
      setCallMinimized(false);
    }
    try { ws.current?.close(); } catch (_) {}
    setRoomCode('');
    setChat([]);
    setScreen('home');
  };

  const startCall = async () => {
    if (!roomCode) return notify('Нет комнаты', 'Сначала войдите в комнату.');
    if (ws.current?.readyState !== WebSocket.OPEN) {
      return notify('Нет соединения', 'Дождитесь подключения к серверу перед звонком.');
    }
    if (isInCall) {
      setCallMinimized(false);
      setScreen('call');
      return;
    }
    try {
      vibrate();
      const connection = await createPeer();
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      const sent = sendSocket({
        action: 'signal',
        room: roomCode,
        payload: { type: 'offer', signal: offer },
      });
      if (!sent) throw new Error('WebSocket не подключён.');
      setIsInCall(true);
      setCallMinimized(false);
      setScreen('call');
    } catch (error) {
      closePeer();
      setIsInCall(false);
      notify('Не удалось начать звонок', error.message || 'Проверьте доступ к микрофону.');
    }
  };

  const endCall = () => {
    vibrate();
    closePeer();
    setIsInCall(false);
    setCallMinimized(false);
    setMicOn(true);
    setScreen(roomCode ? 'room' : 'home');
  };

  const copyText = async (value, label) => {
    try {
      await Clipboard.setStringAsync(value);
      notify('Скопировано', `${label} скопирован.`);
    } catch (_) {
      notify('Ошибка', 'Не удалось скопировать текст.');
    }
  };

  const sendMessage = () => {
    const text = message.trim();
    if (!text) return;
    if (ws.current?.readyState !== WebSocket.OPEN) {
      return notify('Нет соединения', 'Сообщение не отправлено: сервер недоступен.');
    }
    const item = {
      clientId: makeId(),
      user: name || 'Гость',
      userId: userCode,
      text,
      isVoice: false,
      createdAt: new Date().toISOString(),
    };
    const sent = sendSocket({ action: 'message', room: roomCode, payload: item });
    if (sent) {
      addChatMessage(item);
      setMessage('');
    }
  };

  const requestMicPermission = async () => {
    const result = await AudioModule.requestRecordingPermissionsAsync();
    if (!result.granted) {
      notify('Нет доступа к микрофону', 'Разрешите приложению использовать микрофон в настройках телефона.');
      return false;
    }
    return true;
  };

  const startRecording = async () => {
    if (recordingRef.current) return;
    const granted = await requestMicPermission();
    if (!granted) return;
    try {
      await AudioModule.setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordingRef.current = true;
      if (!recordPressHeld.current) {
        await stopRecording();
        return;
      }
      recordingStartedAt.current = Date.now();
      setIsRecording(true);
      setRecordSeconds(0);
      clearInterval(recordInterval.current);
      recordInterval.current = setInterval(() => {
        setRecordSeconds(Math.floor((Date.now() - recordingStartedAt.current) / 1000));
      }, 250);
    } catch (error) {
      recordingRef.current = false;
      setIsRecording(false);
      notify('Ошибка записи', error.message || 'Не удалось начать запись.');
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    clearInterval(recordInterval.current);
    const duration = Math.max(1, Math.floor((Date.now() - recordingStartedAt.current) / 1000));
    setIsRecording(false);
    setRecordSeconds(0);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error('Аудиофайл не создан.');
      if (ws.current?.readyState !== WebSocket.OPEN) {
        notify('Нет соединения', 'Запись сохранена на устройстве, но отправить её сейчас нельзя.');
        return;
      }
      const item = {
        clientId: makeId(),
        user: name || 'Гость',
        userId: userCode,
        text: `[Голосовое ${formatTime(duration)}]`,
        isVoice: true,
        uri,
        duration,
        createdAt: new Date().toISOString(),
      };
      sendSocket({ action: 'message', room: roomCode, payload: item });
      addChatMessage(item);
    } catch (error) {
      notify('Ошибка записи', error.message || 'Не удалось сохранить голосовое сообщение.');
    }
  };

  const playVoice = async (uri) => {
    if (!uri) return notify('Аудио недоступно', 'У этого сообщения нет локального аудиофайла.');
    try {
      await audioPlayer.replace({ uri });
      await audioPlayer.play();
    } catch (error) {
      notify('Ошибка воспроизведения', error.message || 'Не удалось воспроизвести запись.');
    }
  };

  const addContact = async () => {
    const code = searchId.trim().toUpperCase();
    if (!code) return notify('Ошибка', 'Введите ID пользователя.');
    if (code === userCode) return notify('Ошибка', 'Нельзя добавить самого себя.');
    if (contacts.some((contact) => contact.code === code)) {
      return notify('Уже добавлен', 'Этот пользователь уже есть в контактах.');
    }
    const next = [{ id: makeId(), code, name: code, lastMsg: 'Контакт добавлен', time: 'Сейчас', online: false }, ...contacts];
    setContacts(next);
    setSearchId('');
    try {
      await AsyncStorage.setItem('@voiceyok_contacts', JSON.stringify(next));
      notify('Готово', `ID ${code} сохранён в контактах на этом устройстве.`);
    } catch (_) {
      notify('Ошибка', 'Не удалось сохранить контакт.');
    }
  };

  const saveAvatar = async (url) => {
    setAvatar(url);
    setAvatarPicker(false);
    try { await AsyncStorage.setItem('@voiceyok_avatar', url); } catch (_) {}
  };

  const saveName = () => {
    Alert.prompt?.(
      'Имя пользователя',
      'Введите новое отображаемое имя',
      async (value) => {
        const next = value?.trim();
        if (!next) return;
        setName(next);
        try { await AsyncStorage.setItem('@voiceyok_name', next); } catch (_) {}
      },
      'plain-text',
      name,
    );
    if (Platform.OS === 'android') {
      notify('Изменение имени', 'На Android используйте поле имени в настройках профиля в следующем обновлении.');
    }
  };

  // Экран настроек.
  if (screen === 'settings') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Настройки</Text>
          <TouchableOpacity onPress={() => setScreen('home')} style={styles.iconButton}>
            <Ionicons name="close" size={27} color="#da373c" />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Text style={styles.sectionTitle}>СЕТЬ</Text>
          <View style={styles.settingsCard}>
            <Text style={styles.helperText}>Адрес Python WebSocket-сервера (порт 3000)</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="server-outline" size={20} color="#71717a" />
              <TextInput
                style={styles.input}
                value={tempIp}
                onChangeText={setTempIp}
                placeholder="192.168.0.101"
                placeholderTextColor="#71717a"
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
              />
            </View>
            <PressButton style={styles.primaryBtn} onPress={saveIp}>
              <Text style={styles.primaryBtnText}>Сохранить IP</Text>
            </PressButton>
            <Text style={styles.helperText}>Сейчас: {serverIp} · ws://{serverIp}:3000</Text>
          </View>
          <Text style={styles.sectionTitle}>ПРИЛОЖЕНИЕ</Text>
          <View style={styles.settingsCard}>
            <View style={styles.settingsItem}>
              <Text style={styles.settingsText}>Вибрация кнопок</Text>
              <Switch value={vibrationEnabled} onValueChange={setVibrationEnabled} />
            </View>
            <View style={styles.settingsItem}>
              <Text style={styles.settingsText}>Мой ID</Text>
              <TouchableOpacity onPress={() => copyText(userCode, 'ID')}>
                <Text style={styles.accentText}>{userCode || '...'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Экран звонка.
  if (screen === 'call') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Голосовой звонок</Text>
            <Text style={styles.accentText}>{formatTime(callSeconds)}</Text>
          </View>
          <TouchableOpacity onPress={() => { setCallMinimized(true); setScreen('room'); }} style={styles.iconButton}>
            <Ionicons name="chevron-down" size={30} color="#a1a1aa" />
          </TouchableOpacity>
        </View>
        <View style={styles.callGrid}>
          <View style={styles.callSquare}>
            <Text style={styles.callSquareName}>{name}</Text>
            <Text style={styles.callSquareIp}>Вы · {userCode}</Text>
            <View style={styles.callControls}>
              <TouchableOpacity onPress={() => setMicOn((value) => !value)}>
                <PulseMic active={isInCall} muted={!micOn} />
              </TouchableOpacity>
              <Text style={styles.helperText}>{micOn ? 'Микрофон включён' : 'Микрофон выключен'}</Text>
            </View>
          </View>
          <View style={[styles.callSquare, { borderColor: remoteStream ? '#23a559' : '#27272a' }]}>
            <Text style={styles.callSquareName}>Собеседник</Text>
            <Text style={styles.callSquareIp}>{remoteStream ? 'Подключён' : 'Ожидание подключения...'}</Text>
            {remoteStream ? (
              <RTCView streamURL={remoteStream.toURL()} style={{ flex: 1, width: '100%' }} objectFit="cover" />
            ) : (
              <View style={styles.waitingIcon}><Ionicons name="person" size={42} color="#52525b" /></View>
            )}
          </View>
        </View>
        <View style={{ alignItems: 'center', padding: 30 }}>
          <PressButton style={styles.endCallBtn} onPress={endCall}>
            <Ionicons name="call" size={29} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
          </PressButton>
        </View>
      </SafeAreaView>
    );
  }

  // Экран комнаты.
  if (screen === 'room') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.roomHeaderCard}>
          <View style={styles.roomTopLine}>
            <View style={{ flex: 1 }}>
              <Text style={styles.roomTitle}>Комната {roomCode}</Text>
              <Text style={[styles.connectionText, {
                color: connection === 'connected' ? '#23a559' : connection === 'error' ? '#da373c' : '#f1c40f',
              }]}>
                {connection === 'connected' ? '● Подключено' : connection === 'connecting' ? '● Подключение...' : connection === 'error' ? '● Ошибка сети' : '● Нет соединения'}
              </Text>
            </View>
            <TouchableOpacity style={styles.disconnectBtn} onPress={exitRoom}>
              <Ionicons name="log-out-outline" size={18} color="#fff" />
              <Text style={styles.disconnectText}>Выйти</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.roomActions}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => copyText(roomCode, 'ID комнаты')}>
              <Ionicons name="copy-outline" size={16} color="#a1a1aa" />
              <Text style={styles.actionBtnText}>Копировать ID</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.squareBtn, { backgroundColor: isInCall ? '#23a559' : '#1f3a29' }]}
              onPress={startCall}
            >
              <Ionicons name={isInCall ? 'return-down-forward' : 'call'} size={23} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.newParticipantCard}>
          <Image source={{ uri: avatar }} style={styles.roomAvatar} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.participantNameBig}>{name}</Text>
            <Text style={styles.helperText}>ID: {userCode}</Text>
          </View>
          <TouchableOpacity onPress={() => copyText(serverIp, 'IP сервера')} style={styles.ipBadge}>
            <Text style={styles.ipText}>{serverIp}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.chatContainer}>
          {chat.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="chatbubbles-outline" size={35} color="#3f3f46" />
              <Text style={styles.emptyText}>Пока нет сообщений</Text>
              <Text style={styles.helperText}>Напишите первым — или отправьте голосовое</Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={{ paddingVertical: 8 }}
              ref={(ref) => { chatScroll.current = ref; }}
              onContentSizeChange={() => chatScroll.current?.scrollToEnd({ animated: true })}
            >
              {chat.map((item) => (
                <Animatable.View key={item.clientId || item.id} animation="fadeInUp" duration={220}>
                  <View style={[
                    styles.msgBubble,
                    item.userId === userCode && styles.myMsgBubble,
                    item.user === 'Система' && styles.systemMsgBubble,
                  ]}>
                    <Text style={styles.msgAuthor}>{item.user || 'Пользователь'}</Text>
                    {item.isVoice ? (
                      <TouchableOpacity onPress={() => playVoice(item.uri)} style={styles.voiceRow}>
                        <View style={styles.voicePlay}><Ionicons name="play" size={17} color="#fff" /></View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.msgText}>Голосовое сообщение</Text>
                          <Text style={styles.helperText}>{formatTime(item.duration || 0)}</Text>
                        </View>
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.msgText}>{item.text}</Text>
                    )}
                  </View>
                </Animatable.View>
              ))}
            </ScrollView>
          )}
        </View>

        {isRecording && (
          <View style={styles.recordingBadge}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>Запись {formatTime(recordSeconds)}</Text>
          </View>
        )}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.bottomBar}>
            <TextInput
              style={styles.chatInput}
              placeholder="Сообщение..."
              placeholderTextColor="#71717a"
              value={message}
              onChangeText={setMessage}
              onSubmitEditing={sendMessage}
              returnKeyType="send"
            />
            <TouchableOpacity
              style={[styles.micBtnSmall, isRecording && { backgroundColor: '#da373c' }]}
              onPressIn={() => { recordPressHeld.current = true; startRecording(); }}
              onPressOut={() => { recordPressHeld.current = false; stopRecording(); }}
              delayLongPress={0}
            >
              <Ionicons name={isRecording ? 'mic' : 'mic-outline'} size={22} color={isRecording ? '#fff' : '#a1a1aa'} />
            </TouchableOpacity>
            <PressButton style={styles.sendBtn} onPress={sendMessage}>
              <Ionicons name="send" size={19} color="#fff" />
            </PressButton>
          </View>
        </KeyboardAvoidingView>

        {callMinimized && isInCall && (
          <View style={styles.floatingCallContainer}>
            <TouchableOpacity style={styles.floatingCallBtn} onPress={() => { setCallMinimized(false); setScreen('call'); }}>
              <Ionicons name="call" size={23} color="#fff" />
              <Text style={styles.floatingTime}>{formatTime(callSeconds)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.floatingEndCallBtn} onPress={endCall}>
              <Ionicons name="close" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // Главный экран.
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.homeHeader}>
        <View style={styles.brand}>
          <MaterialCommunityIcons name="skull" size={31} color="#23a559" />
          <Text style={styles.logoText}>voice yok</Text>
        </View>
        <TouchableOpacity style={styles.settingsBtn} onPress={() => setScreen('settings')}>
          <Ionicons name="settings-outline" size={23} color="#a1a1aa" />
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1 }}>
        {tab === 'chats' && (
          <View style={{ flex: 1 }}>
            <View style={styles.searchRow}>
              <View style={styles.searchBar}>
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
              <TouchableOpacity style={styles.addButton} onPress={addContact}>
                <Ionicons name="person-add" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {contacts.length === 0 ? (
                <View style={styles.emptyHome}>
                  <Ionicons name="people-outline" size={38} color="#3f3f46" />
                  <Text style={styles.emptyText}>Контактов пока нет</Text>
                  <Text style={styles.helperText}>Добавьте пользователя по его ID</Text>
                </View>
              ) : contacts.map((contact) => (
                <TouchableOpacity
                  key={contact.id}
                  style={styles.chatItem}
                  onPress={() => notify('Личный чат', 'Для личной переписки серверу нужен отдельный протокол личных сообщений. Пока доступен общий чат по ID комнаты.')}
                >
                  <View style={styles.chatAvatar}>
                    <Text style={styles.chatAvatarText}>{(contact.name || contact.code || '?')[0]}</Text>
                  </View>
                  <View style={styles.chatInfo}>
                    <Text style={styles.chatName}>{contact.name || contact.code}</Text>
                    <Text style={styles.chatLastMsg}>ID: {contact.code}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#52525b" />
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.fab} onPress={() => createRoom(false)}>
              <Ionicons name="add" size={30} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {tab === 'games' && (
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text style={styles.pageTitle}>Игровая зона</Text>
            <PressButton style={styles.primaryBtn} onPress={() => createRoom(true)}>
              <Text style={styles.primaryBtnText}>Создать лобби</Text>
              <Ionicons name="add" size={21} color="#fff" />
            </PressButton>
            <Text style={styles.sectionTitle}>ЛОКАЛЬНЫЕ ЛОББИ</Text>
            {lobbies.length === 0 ? (
              <Text style={styles.emptyText}>Лобби пока не созданы</Text>
            ) : lobbies.map((lobby) => (
              <View key={lobby.id} style={styles.lobbyCard}>
                <View style={styles.roomTopLine}>
                  <Text style={styles.lobbyTitle}>{lobby.title}</Text>
                  <Text style={styles.accentText}>{lobby.players}/{lobby.max}</Text>
                </View>
                <Text style={styles.helperText}>ID: {lobby.id} · Сервер: {lobby.ip}</Text>
                <PressButton style={[styles.primaryBtn, styles.joinBtn]} onPress={() => joinRoom(lobby.id)}>
                  <Text style={styles.primaryBtnText}>Присоединиться</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </PressButton>
              </View>
            ))}
            <Text style={styles.helperText}>Список лобби пока хранится локально на этом устройстве. Для общей сетевой выдачи лобби нужен серверный обработчик.</Text>
          </ScrollView>
        )}

        {tab === 'profile' && (
          <ScrollView contentContainerStyle={{ padding: 20, alignItems: 'center' }}>
            <TouchableOpacity onPress={() => setAvatarPicker(true)} style={styles.profileAvatar}>
              <Image source={{ uri: avatar }} style={{ width: '100%', height: '100%', borderRadius: 60 }} />
              <View style={styles.cameraBadge}><Ionicons name="camera" size={18} color="#fff" /></View>
            </TouchableOpacity>
            <Text style={styles.profileName}>{name}</Text>
            <TouchableOpacity onPress={() => copyText(userCode, 'ID пользователя')}>
              <Text style={styles.accentText}>ID: {userCode} · нажмите, чтобы скопировать</Text>
            </TouchableOpacity>
            <View style={{ width: '100%', marginTop: 28 }}>
              <Text style={styles.sectionTitle}>ПРОФИЛЬ</Text>
              <View style={styles.settingsCard}>
                <TouchableOpacity style={styles.settingsItem} onPress={saveName}>
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

      {callMinimized && isInCall && (
        <View style={styles.floatingCallContainer}>
          <TouchableOpacity style={styles.floatingCallBtn} onPress={() => { setCallMinimized(false); setScreen('call'); }}>
            <Ionicons name="call" size={23} color="#fff" />
            <Text style={styles.floatingTime}>{formatTime(callSeconds)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.floatingEndCallBtn} onPress={endCall}>
            <Ionicons name="close" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.tabBar}>
        {[
          { id: 'chats', label: 'Чаты', icon: 'chatbubbles' },
          { id: 'games', label: 'Игры', icon: 'game-controller' },
          { id: 'profile', label: 'Профиль', icon: 'person' },
        ].map((item) => (
          <TouchableOpacity key={item.id} style={styles.tabItem} onPress={() => setTab(item.id)}>
            <Ionicons
              name={tab === item.id ? item.icon : `${item.icon}-outline`}
              size={23}
              color={tab === item.id ? '#5865F2' : '#71717a'}
            />
            <Text style={[styles.tabText, tab === item.id && { color: '#5865F2' }]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Modal visible={avatarPicker} transparent animationType="fade" onRequestClose={() => setAvatarPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Выберите аватар</Text>
            <View style={styles.avatarGrid}>
              {AVATARS.map((url) => (
                <TouchableOpacity key={url} onPress={() => saveAvatar(url)}>
                  <Image source={{ uri: url }} style={[styles.avatarChoice, avatar === url && styles.selectedAvatar]} />
                </TouchableOpacity>
              ))}
            </View>
            <PressButton style={[styles.primaryBtn, { marginTop: 20, backgroundColor: '#da373c', width: '100%' }]} onPress={() => setAvatarPicker(false)}>
              <Text style={styles.primaryBtnText}>Закрыть</Text>
            </PressButton>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Ref для автопрокрутки чата объявлен вне JSX, чтобы не создавать состояние на каждый рендер.
const chatScroll = { current: null };

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090b' },
  homeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoText: { fontSize: 23, fontWeight: 'bold', color: '#fff' },
  settingsBtn: { backgroundColor: '#18181b', padding: 11, borderRadius: 12, borderWidth: 1, borderColor: '#27272a' },
  iconButton: { padding: 6 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#121214', borderBottomWidth: 1, borderBottomColor: '#27272a' },
  headerTitle: { fontSize: 19, fontWeight: 'bold', color: '#fafafa' },
  sectionTitle: { color: '#71717a', fontSize: 12, fontWeight: 'bold', marginBottom: 10, marginTop: 22, marginLeft: 5 },
  settingsCard: { backgroundColor: '#121214', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#27272a', padding: 14 },
  settingsItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#27272a' },
  settingsText: { color: '#fff', fontSize: 15 },
  helperText: { color: '#71717a', fontSize: 12, marginTop: 5 },
  accentText: { color: '#23a559', fontSize: 13, fontWeight: 'bold' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#09090b', borderRadius: 13, borderWidth: 1, borderColor: '#27272a', paddingHorizontal: 13, marginVertical: 12 },
  input: { flex: 1, color: '#fafafa', paddingVertical: 14, paddingHorizontal: 10, fontSize: 15 },
  primaryBtn: { flexDirection: 'row', backgroundColor: '#5865F2', borderRadius: 14, padding: 16, justifyContent: 'space-between', alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  roomHeaderCard: { backgroundColor: '#121214', margin: 16, padding: 17, borderRadius: 18, borderWidth: 1, borderColor: '#27272a' },
  roomTopLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  roomTitle: { color: '#fafafa', fontSize: 19, fontWeight: 'bold' },
  connectionText: { fontSize: 11, marginTop: 5, fontWeight: '600' },
  disconnectBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#da373c', paddingHorizontal: 11, paddingVertical: 9, borderRadius: 10, gap: 5 },
  disconnectText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  roomActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 15 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#18181b', paddingHorizontal: 13, paddingVertical: 11, borderRadius: 11, borderWidth: 1, borderColor: '#27272a', gap: 7 },
  actionBtnText: { color: '#a1a1aa', fontSize: 13, fontWeight: '600' },
  squareBtn: { backgroundColor: '#1f3a29', padding: 10, borderRadius: 11, borderWidth: 1, borderColor: '#27272a' },
  newParticipantCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#121214', marginHorizontal: 16, marginBottom: 10, padding: 13, borderRadius: 15, borderWidth: 1, borderColor: '#27272a' },
  roomAvatar: { width: 47, height: 47, borderRadius: 14 },
  participantNameBig: { color: '#fafafa', fontSize: 16, fontWeight: 'bold' },
  ipBadge: { backgroundColor: '#0f2e2d', paddingHorizontal: 9, paddingVertical: 7, borderRadius: 8 },
  ipText: { color: '#23a559', fontSize: 11, fontWeight: 'bold' },
  chatContainer: { flex: 1, paddingHorizontal: 16 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 7 },
  emptyText: { color: '#71717a', textAlign: 'center', fontSize: 14, marginTop: 7 },
  msgBubble: { backgroundColor: '#121214', padding: 13, borderRadius: 15, marginBottom: 9, alignSelf: 'flex-start', maxWidth: '88%', borderWidth: 1, borderColor: '#27272a' },
  myMsgBubble: { alignSelf: 'flex-end', borderColor: '#344a9b', backgroundColor: '#151725' },
  systemMsgBubble: { alignSelf: 'center', backgroundColor: '#18181b' },
  msgAuthor: { color: '#8b93ff', fontSize: 11, fontWeight: 'bold', marginBottom: 5 },
  msgText: { color: '#fafafa', fontSize: 14, lineHeight: 20 },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 9, minWidth: 170 },
  voicePlay: { backgroundColor: '#5865F2', padding: 9, borderRadius: 20 },
  bottomBar: { flexDirection: 'row', padding: 13, backgroundColor: '#121214', borderTopWidth: 1, borderTopColor: '#27272a', alignItems: 'center', gap: 8 },
  chatInput: { flex: 1, backgroundColor: '#09090b', borderRadius: 22, paddingHorizontal: 17, paddingVertical: 11, color: '#fafafa', borderWidth: 1, borderColor: '#27272a', minHeight: 44 },
  micBtnSmall: { width: 45, height: 45, borderRadius: 23, backgroundColor: '#18181b', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#27272a' },
  sendBtn: { backgroundColor: '#5865F2', width: 45, height: 45, borderRadius: 23, justifyContent: 'center', alignItems: 'center' },
  recordingBadge: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#4b171b', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, marginBottom: 5 },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ff5b61' },
  recordingText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  floatingCallContainer: { position: 'absolute', right: 16, bottom: 88, zIndex: 100, alignItems: 'center' },
  floatingCallBtn: { width: 59, height: 59, borderRadius: 15, backgroundColor: '#23a559', justifyContent: 'center', alignItems: 'center', elevation: 8 },
  floatingTime: { color: '#fff', fontSize: 10, fontWeight: 'bold', marginTop: 2 },
  floatingEndCallBtn: { position: 'absolute', top: -7, right: -7, width: 23, height: 23, borderRadius: 12, backgroundColor: '#da373c', justifyContent: 'center', alignItems: 'center' },
  callGrid: { flex: 1, padding: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', alignContent: 'center' },
  callSquare: { backgroundColor: '#121214', borderWidth: 1, borderColor: '#5865F2', borderRadius: 21, padding: 15, width: '47%', minHeight: 190, justifyContent: 'space-between' },
  callSquareName: { color: '#fafafa', fontSize: 16, fontWeight: 'bold' },
  callSquareIp: { color: '#a1a1aa', fontSize: 11, marginTop: 4 },
  callControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  waitingIcon: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  endCallBtn: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#da373c', justifyContent: 'center', alignItems: 'center' },
  searchRow: { paddingHorizontal: 18, marginBottom: 8, flexDirection: 'row', gap: 9 },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#121214', borderRadius: 12, paddingHorizontal: 13, borderWidth: 1, borderColor: '#27272a' },
  searchInput: { flex: 1, color: '#fff', marginLeft: 9, fontSize: 14, paddingVertical: 12 },
  addButton: { backgroundColor: '#23a559', width: 47, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  chatItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#18181b' },
  chatAvatar: { width: 51, height: 51, borderRadius: 26, backgroundColor: '#1f3a29', justifyContent: 'center', alignItems: 'center' },
  chatAvatarText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  chatInfo: { flex: 1, marginLeft: 13 },
  chatName: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  chatLastMsg: { color: '#a1a1aa', fontSize: 12, marginTop: 5 },
  emptyHome: { alignItems: 'center', marginTop: 65, gap: 5 },
  fab: { position: 'absolute', bottom: 18, right: 18, width: 58, height: 58, borderRadius: 29, backgroundColor: '#5865F2', justifyContent: 'center', alignItems: 'center', elevation: 5 },
  pageTitle: { color: '#fafafa', fontSize: 24, fontWeight: 'bold', marginBottom: 18 },
  lobbyCard: { backgroundColor: '#121214', borderRadius: 15, padding: 15, marginTop: 13, borderWidth: 1, borderColor: '#27272a' },
  lobbyTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', flex: 1 },
  joinBtn: { marginTop: 13, backgroundColor: '#1f3a29' },
  tabBar: { flexDirection: 'row', backgroundColor: '#121214', borderTopWidth: 1, borderTopColor: '#27272a', paddingVertical: 9, paddingBottom: Platform.OS === 'ios' ? 23 : 9 },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  tabText: { fontSize: 11, fontWeight: '600', color: '#71717a' },
  profileAvatar: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#3b2d5c', marginTop: 15 },
  cameraBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#5865F2', padding: 6, borderRadius: 15 },
  profileName: { color: '#fff', fontSize: 25, fontWeight: 'bold', marginTop: 15, marginBottom: 5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#121214', borderRadius: 20, padding: 22, width: width * 0.86, alignItems: 'center', borderWidth: 1, borderColor: '#27272a' },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 18 },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
  avatarChoice: { width: 66, height: 66, borderRadius: 33, backgroundColor: '#27272a' },
  selectedAvatar: { borderWidth: 3, borderColor: '#23a559' },
});
