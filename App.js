import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  StyleSheet, Text, View, TextInput, SafeAreaView, ScrollView, KeyboardAvoidingView,
  Platform, Clipboard, Alert, Animated, TouchableWithoutFeedback, Easing, TouchableOpacity,
  Vibration, Image, Modal, Dimensions, FlatList
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Animatable from 'react-native-animatable';
import { useAudioRecorder, AudioModule, RecordingPresets, useAudioPlayer } from 'expo-audio';
import { RTCPeerConnection, RTCView, mediaDevices, RTCIceCandidate, RTCSessionDescription } from 'react-native-webrtc';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import io from 'socket.io-client';

const { width } = Dimensions.get('window');
const SERVER_URL = 'http://192.168.1.100:3000'; // ЗАМЕНИ НА СВОЙ IP

const AVATAR_STUBS = [
  'https://api.dicebear.com/7.x/avataaars/png?seed=Skull1&backgroundColor=09090b',
  'https://api.dicebear.com/7.x/avataaars/png?seed=Skull2&backgroundColor=09090b',
  'https://api.dicebear.com/7.x/avataaars/png?seed=Skull3&backgroundColor=09090b',
  'https://api.dicebear.com/7.x/bottts/png?seed=Robot1&backgroundColor=09090b',
  'https://api.dicebear.com/7.x/bottts/png?seed=Robot2&backgroundColor=09090b',
  'https://api.dicebear.com/7.x/pixel-art/png?seed=Pixel1&backgroundColor=09090b',
  'https://cdn-icons-png.flaticon.com/512/149/149071.png',
];

const COLORS = {
  bg: '#09090b',
  card: '#121214',
  border: '#27272a',
  green: '#23a559',
  red: '#da373c',
  blue: '#5865F2',
  text: '#fafafa',
  textSec: '#a1a1aa',
  textDim: '#71717a',
};

// --- PulseIcon ---
const PulseIcon = ({ active, color, isMuted }) => {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (active) {
      Animated.loop(Animated.sequence([
        Animated.timing(scale, { toValue: 1.3, duration: 600, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 600, useNativeDriver: true })
      ])).start();
    } else { scale.setValue(1); }
  }, [active]);
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Ionicons name={isMuted ? "mic-off" : "mic"} size={24} color={color} />
    </Animated.View>
  );
};

// --- SmoothButton ---
const SmoothButton = ({ onPress, style, children, activeScale = 0.92 }) => {
  const scaleValue = useRef(new Animated.Value(1)).current;
  const handlePressIn = () => {
    Vibration.vibrate(10);
    Animated.spring(scaleValue, { toValue: activeScale, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  };
  const handlePressOut = () => Animated.spring(scaleValue, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 10 }).start();
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
  const [nameColor, setNameColor] = useState('#ffffff');
  const [myLocalIp, setMyLocalIp] = useState('');
  const [generatedIp, setGeneratedIp] = useState('');

  // Модалки
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [showNameChange, setShowNameChange] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [newName, setNewName] = useState('');

  // Комната
  const [roomCode, setRoomCode] = useState('');
  const [msg, setMsg] = useState('');
  const [chat, setChat] = useState([]);
  const [serverIp, setServerIp] = useState('192.168.1.100');
  const [tempIp, setTempIp] = useState('192.168.1.100');

  // Звонки
  const [isInCall, setIsInCall] = useState(false);
  const [isCallMinimized, setIsCallMinimized] = useState(false);
  const [callMenuOpen, setCallMenuOpen] = useState(false);
  const [myMicOn, setMyMicOn] = useState(true);
  const [remoteStream, setRemoteStream] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Запись
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);

  // Контакты и чаты
  const [contacts, setContacts] = useState([]);
  const [searchId, setSearchId] = useState('');
  const [activeChat, setActiveChat] = useState(null);
  const [chatMessages, setChatMessages] = useState({});

  // Игровая зона
  const [gameLobbies, setGameLobbies] = useState([
    { id: 'LOBBY-DEMO1', title: 'Deathmatch Arena', ip: '192.168.1.50', players: 3, max: 8 },
    { id: 'LOBBY-DEMO2', title: 'Survival Zone', ip: '192.168.1.77', players: 1, max: 4 },
  ]);
  const [team, setTeam] = useState([]);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [selectedTeamPeers, setSelectedTeamPeers] = useState([]);

  // Refs
  const recordTimer = useRef(null);
  const callTimer = useRef(null);
  const ws = useRef(null);
  const socket = useRef(null);
  const peerConnection = useRef(null);
  const localStream = useRef(null);
  const dataChannel = useRef(null);
  const cardAnim = useRef(new Animated.Value(0)).current;
  const menuBtnAnim = useRef(new Animated.Value(1)).current;
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const player = useAudioPlayer();

  // ============ ИНИЦИАЛИЗАЦИЯ ============
  useEffect(() => {
    (async () => {
      try {
        let savedLocalIp = await AsyncStorage.getItem('@voiceyok_local_ip');
        if (!savedLocalIp) {
          savedLocalIp = '192.168.1.' + Math.floor(Math.random() * 254 + 1);
          await AsyncStorage.setItem('@voiceyok_local_ip', savedLocalIp);
        }
        setMyLocalIp(savedLocalIp);

        let savedGenIp = await AsyncStorage.getItem('@voiceyok_generated_ip');
        if (!savedGenIp) {
          savedGenIp = '10.0.0.' + Math.floor(Math.random() * 254 + 1);
          await AsyncStorage.setItem('@voiceyok_generated_ip', savedGenIp);
        }
        setGeneratedIp(savedGenIp);

        const savedIp = await AsyncStorage.getItem('@voiceyok_ip');
        if (savedIp) { setServerIp(savedIp); setTempIp(savedIp); }

        let storedCode = await AsyncStorage.getItem('@voiceyok_usercode');
        if (!storedCode) {
          storedCode = 'YOK' + Math.random().toString(36).substring(2, 7).toUpperCase();
          await AsyncStorage.setItem('@voiceyok_usercode', storedCode);
        }
        setUserCode(storedCode);

        const savedName = await AsyncStorage.getItem('@voiceyok_name');
        if (savedName) { setName(savedName); setNewName(savedName); }

        const savedAvatar = await AsyncStorage.getItem('@voiceyok_avatar');
        if (savedAvatar) setAvatar(savedAvatar);

        const savedNameColor = await AsyncStorage.getItem('@voiceyok_namecolor');
        if (savedNameColor) setNameColor(savedNameColor);

        const savedContacts = await AsyncStorage.getItem('@voiceyok_contacts');
        if (savedContacts) setContacts(JSON.parse(savedContacts));

        const savedMsgs = await AsyncStorage.getItem('@voiceyok_chatmessages');
        if (savedMsgs) setChatMessages(JSON.parse(savedMsgs));
      } catch (e) { console.log('Init error', e); }
    })();
  }, []);

  // Подключение к сигнальному серверу
  useEffect(() => {
    socket.current = io(SERVER_URL, { autoConnect: false });
    socket.current.connect();
    socket.current.on('connect', () => {
      socket.current.emit('register', { id: userCode, ip: myLocalIp, name });
    });
    socket.current.on('peers', (peersList) => {
      // Обновление списка пиров
    });
    socket.current.on('offer', async (data) => { await handleOffer(data.from, data.offer); });
    socket.current.on('answer', async (data) => {
      if (peerConnection.current) await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.answer));
    });
    socket.current.on('ice-candidate', async (data) => {
      if (peerConnection.current) await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate));
    });
    return () => { if (socket.current) socket.current.disconnect(); };
  }, [userCode, myLocalIp, name]);

  // WebSocket комнаты
  useEffect(() => {
    if (screen === 'room' && roomCode) {
      ws.current = new WebSocket(`ws://${serverIp}:3000`);
      ws.current.onopen = () => ws.current.send(JSON.stringify({ action: 'join', room: roomCode, user: name || 'Гость' }));
      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.action === 'message') setChat((prev) => [...prev, { id: Date.now(), ...data.payload }]);
          else if (data.action === 'signal') handleSignal(data.payload);
        } catch (e) {}
      };
      ws.current.onerror = (e) => Alert.alert("Ошибка WS", e.message || serverIp);
      return () => { if (ws.current) ws.current.close(); };
    }
  }, [screen, roomCode, serverIp]);

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

  const formatTime = (sec) => `${Math.floor(sec/60).toString().padStart(2,'0')}:${(sec%60).toString().padStart(2,'0')}`;

  // ============ WEBRTC ============
  const handleSignal = async (data) => {
    if (data.type === 'offer') {
      await createPeerConnection();
      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.signal));
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);
      if (ws.current) ws.current.send(JSON.stringify({ action: 'signal', room: roomCode, payload: answer }));
    } else if (data.type === 'answer') {
      if (peerConnection.current) await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.signal));
    } else if (data.candidate) {
      if (peerConnection.current) await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  };

  const handleOffer = async (fromPeerId, offer) => {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    peerConnection.current = pc;
    pc.ondatachannel = (event) => {
      dataChannel.current = event.channel;
      dataChannel.current.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'chat') {
            const msgs = chatMessages[fromPeerId] || [];
            const newMsgs = { ...chatMessages, [fromPeerId]: [...msgs, { ...data.payload, sender: 'other' }] };
            setChatMessages(newMsgs);
            AsyncStorage.setItem('@voiceyok_chatmessages', JSON.stringify(newMsgs));
          }
        } catch (err) {}
      };
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) socket.current.emit('ice-candidate', { target: fromPeerId, candidate: event.candidate });
    };
    pc.ontrack = (event) => setRemoteStream(event.streams[0]);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.current.emit('answer', { target: fromPeerId, answer });
  };

  const createPeerConnection = async () => {
    try {
      const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
      localStream.current = stream;
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      peerConnection.current = pc;
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      const dc = pc.createDataChannel('chat');
      dataChannel.current = dc;
      dc.onopen = () => console.log('DataChannel открыт');
      dc.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'chat' && data.from) {
            const msgs = chatMessages[data.from] || [];
            const newMsgs = { ...chatMessages, [data.from]: [...msgs, { ...data.payload, sender: 'other' }] };
            setChatMessages(newMsgs);
            AsyncStorage.setItem('@voiceyok_chatmessages', JSON.stringify(newMsgs));
          }
        } catch (err) {}
      };
      pc.onicecandidate = (event) => {
        if (event.candidate && ws.current) ws.current.send(JSON.stringify({ action: 'signal', room: roomCode, payload: { candidate: event.candidate } }));
      };
      pc.ontrack = (event) => setRemoteStream(event.streams[0]);
    } catch (e) { throw new Error("Микрофон недоступен: " + e.message); }
  };

  const connectToPeer = async (peerId) => {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    peerConnection.current = pc;
    const channel = pc.createDataChannel('chat');
    dataChannel.current = channel;
    channel.onopen = () => console.log('P2P установлено');
    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'chat') {
          const msgs = chatMessages[peerId] || [];
          const newMsgs = { ...chatMessages, [peerId]: [...msgs, { ...data.payload, sender: 'other' }] };
          setChatMessages(newMsgs);
          AsyncStorage.setItem('@voiceyok_chatmessages', JSON.stringify(newMsgs));
        }
      } catch (err) {}
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) socket.current.emit('ice-candidate', { target: peerId, candidate: event.candidate });
    };
    pc.ontrack = (event) => setRemoteStream(event.streams[0]);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.current.emit('offer', { target: peerId, offer });
  };

  const sendP2PMessage = (peerId, message) => {
    if (dataChannel.current && dataChannel.current.readyState === 'open') {
      dataChannel.current.send(JSON.stringify({ type: 'chat', from: userCode, payload: message }));
    }
  };

  const startCall = async () => {
    try {
      Vibration.vibrate(10);
      const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
      localStream.current = stream;
      setIsInCall(true);
      setIsSpeaking(true);
      setCallMenuOpen(false);
      
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      peerConnection.current = pc;
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      pc.ontrack = (event) => setRemoteStream(event.streams[0]);
      
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      if (screen === 'room' && ws.current) {
        ws.current.send(JSON.stringify({ action: 'signal', room: roomCode, payload: { type: 'offer', signal: offer } }));
      } else if (activeChat && socket.current) {
        socket.current.emit('offer', { target: activeChat.code, offer });
      }
      
      if (screen !== 'call') setScreen('call');
    } catch (e) { Alert.alert("Ошибка звонка", e.message); }
  };

  const endCall = () => {
    Vibration.vibrate(10);
    if (peerConnection.current) { peerConnection.current.close(); peerConnection.current = null; }
    if (localStream.current) { localStream.current.getTracks().forEach(t => t.stop()); localStream.current = null; }
    setRemoteStream(null);
    setIsInCall(false);
    setIsSpeaking(false);
    setIsCallMinimized(false);
    setCallMenuOpen(false);
    if (screen === 'call') setScreen('home');
  };

  const minimizeCall = () => {
    setIsCallMinimized(true);
    setCallMenuOpen(false);
    setScreen('home');
  };

  const restoreCall = () => {
    setIsCallMinimized(false);
    setCallMenuOpen(false);
    setScreen('call');
  };

  const hideCallBubble = () => {
    // Скрывает плашку, но звонок продолжает работать в фоне
    setIsCallMinimized(false);
    setCallMenuOpen(false);
  };

  // ============ ДЕЙСТВИЯ ============
  const saveNewIp = async () => {
    try {
      await AsyncStorage.setItem('@voiceyok_ip', tempIp);
      setServerIp(tempIp);
      Alert.alert('Успех', 'IP сохранён: ' + tempIp);
    } catch (e) { Alert.alert('Ошибка', 'Не удалось сохранить IP'); }
  };

  const toggleCard = () => {
    Vibration.vibrate(10);
    Animated.sequence([Animated.timing(menuBtnAnim, { toValue: 1.2, duration: 100, useNativeDriver: true }), Animated.spring(menuBtnAnim, { toValue: 1, friction: 3, tension: 40, useNativeDriver: true })]).start();
    Animated.timing(cardAnim, { toValue: cardAnim._value === 0 ? 1 : 0, duration: 400, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start();
  };

  const requestPermission = async () => {
    const status = await AudioModule.requestRecordingPermissionsAsync();
    if (!status.granted) { Alert.alert('Ошибка', 'Нет доступа к микрофону'); return false; }
    return true;
  };

  const handlePressIn = async () => {
    if (vibrationEnabled) Vibration.vibrate(10);
    const hasPermission = await requestPermission();
    if (!hasPermission) return;
    clearInterval(recordTimer.current); setRecordDuration(0);
    try { await audioRecorder.stop(); } catch (e) {}
    await AudioModule.setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await audioRecorder.prepareToRecordAsync(); audioRecorder.record();
    setIsRecording(true); recordTimer.current = setInterval(() => setRecordDuration(prev => prev + 1), 1000);
  };

  const handlePressOut = async () => {
    if (!isRecording) return;
    Vibration.vibrate(10); clearInterval(recordTimer.current);
    try { await audioRecorder.stop(); } catch (e) {}
    const duration = recordDuration; setIsRecording(false); setRecordDuration(0);
    if (duration > 0) {
      const voiceMsg = { user: name || 'Вы', text: `[Голосовое ${formatTime(duration)}]`, isVoice: true, uri: audioRecorder.uri };
      if (ws.current) ws.current.send(JSON.stringify({ action: 'message', room: roomCode, payload: voiceMsg }));
      setChat((prev) => [...prev, { id: Date.now(), ...voiceMsg }]);
    }
  };

  const playVoice = async (uri) => { try { await player.replace({ uri }); await player.play(); } catch (e) {} };

  const createRoom = (isLobby = false) => {
    Vibration.vibrate(10);
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomCode(code); setChat([]);
    if (isLobby) {
      setGameLobbies((prev) => [{ id: code, title: `Лобби ${code}`, ip: myLocalIp, players: 1, max: 8 }, ...prev]);
    }
    setScreen('room');
  };

  const joinRoom = (code) => {
    Vibration.vibrate(10);
    if (code && code.length > 2) { setRoomCode(code.toUpperCase()); setChat([]); setScreen('room'); }
    else Alert.alert('Ошибка', 'Введите ID');
  };

  const copyCode = () => { Vibration.vibrate(10); Clipboard.setString(roomCode); Alert.alert('Успех', 'Код скопирован!'); };

  const sendMsg = () => {
    Vibration.vibrate(10);
    if (msg.trim() && ws.current) {
      const messageData = { user: name || 'Вы', text: msg, isVoice: false };
      ws.current.send(JSON.stringify({ action: 'message', room: roomCode, payload: messageData }));
      setChat((prev) => [...prev, { id: Date.now(), ...messageData }]); setMsg('');
    }
  };

  const searchAndAddContact = async () => {
    Vibration.vibrate(10);
    if (!searchId.trim()) return Alert.alert('Ошибка', 'Введите ID');
    const id = searchId.trim().toUpperCase();
    if (contacts.some((c) => c.code === id)) return Alert.alert('Уже есть', 'Этот контакт уже добавлен');
    const newContact = { id: Date.now(), code: id, name: id, lastMsg: 'Контакт добавлен', time: 'Сейчас', online: Math.random() > 0.4, avatar: `https://api.dicebear.com/7.x/avataaars/png?seed=${id}` };
    const updated = [newContact, ...contacts];
    setContacts(updated);
    await AsyncStorage.setItem('@voiceyok_contacts', JSON.stringify(updated));
    setSearchId('');
    Alert.alert('Успех', `Контакт ${id} добавлен!`);
  };

  const openChat = (contact) => {
    Vibration.vibrate(10);
    setActiveChat(contact);
    connectToPeer(contact.code);
    setScreen('chat');
  };

  const sendChatMessage = () => {
    Vibration.vibrate(10);
    if (!msg.trim() || !activeChat) return;
    const messageData = { user: name || 'Вы', text: msg, isVoice: false, time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) };
    sendP2PMessage(activeChat.code, messageData);
    const msgs = chatMessages[activeChat.code] || [];
    const newMsgs = { ...chatMessages, [activeChat.code]: [...msgs, { ...messageData, sender: 'me' }] };
    setChatMessages(newMsgs);
    AsyncStorage.setItem('@voiceyok_chatmessages', JSON.stringify(newMsgs));
    setMsg('');
  };

  const changeAvatar = async (url) => {
    Vibration.vibrate(10);
    setAvatar(url);
    await AsyncStorage.setItem('@voiceyok_avatar', url);
    setShowAvatarPicker(false);
  };

  const pickImageFromGallery = async () => {
    Vibration.vibrate(10);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Ошибка', 'Нужен доступ к галерее'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const newAvatar = result.assets[0].uri;
      setAvatar(newAvatar);
      await AsyncStorage.setItem('@voiceyok_avatar', newAvatar);
      setShowAvatarPicker(false);
    }
  };

  const saveName = async () => {
    if (newName.trim()) {
      setName(newName.trim());
      await AsyncStorage.setItem('@voiceyok_name', newName.trim());
      setShowNameChange(false);
    }
  };

  const toggleTeamPeer = (peer) => {
    Vibration.vibrate(10);
    if (selectedTeamPeers.find(p => p.id === peer.id)) {
      setSelectedTeamPeers(selectedTeamPeers.filter(p => p.id !== peer.id));
    } else {
      setSelectedTeamPeers([...selectedTeamPeers, peer]);
    }
  };

  const confirmCreateTeam = () => {
    Vibration.vibrate(10);
    const teamMembers = [
      { name, id: userCode, ip: myLocalIp, avatar, isLeader: true },
      ...selectedTeamPeers.map(p => ({ ...p, isLeader: false }))
    ];
    setTeam(teamMembers);
    setShowCreateTeam(false);
    setSelectedTeamPeers([]);
    Alert.alert('Команда создана', `Участников: ${teamMembers.length}`);
  };

  // ============ РЕНДЕР ============

  // НАСТРОЙКИ
  if (screen === 'settings') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Настройки</Text>
          <SmoothButton onPress={() => setScreen('home')} style={{ padding: 5 }}><Ionicons name="close" size={28} color={COLORS.red} /></SmoothButton>
        </View>
        <ScrollView style={{ padding: 20 }}>
          <Text style={styles.sectionTitle}>СЕТЬ</Text>
          <View style={styles.settingsCard}>
            <Text style={{ color: COLORS.textDim, fontSize: 12, marginBottom: 8 }}>Локальный IP: {myLocalIp}</Text>
            <Text style={{ color: COLORS.textDim, fontSize: 12, marginBottom: 8 }}>Сгенерированный IP: {generatedIp}</Text>
            <Text style={{ color: COLORS.textDim, fontSize: 12, marginBottom: 10 }}>Сервер: {serverIp}</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="server-outline" size={20} color={COLORS.textDim} style={styles.inputIcon} />
              <TextInput style={styles.input} value={tempIp} onChangeText={setTempIp} placeholder="192.168.x.x" placeholderTextColor={COLORS.textDim} keyboardType="numbers-and-punctuation" />
            </View>
            <SmoothButton style={styles.primaryBtn} onPress={saveNewIp}><Text style={styles.primaryBtnText}>Сохранить IP</Text></SmoothButton>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // КОМНАТА
  if (screen === 'room') {
    return (
      <SafeAreaView style={styles.container}>
        {isRecording && (
          <View style={{ position: 'absolute', bottom: 85, right: 60, zIndex: 999 }}>
            <View style={{ backgroundColor: COLORS.red, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 30, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="mic" size={16} color="#fff" /><Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>{formatTime(recordDuration)}</Text>
            </View>
          </View>
        )}
        <View style={styles.roomHeaderCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Text style={styles.roomTitle}>Комната {roomCode}</Text><MaterialCommunityIcons name="skull" size={24} color={COLORS.green} /></View>
            <SmoothButton style={styles.disconnectBtn} onPress={() => { if(ws.current) ws.current.close(); setScreen('home'); }}><Ionicons name="log-out-outline" size={18} color="#fff" /><Text style={styles.disconnectText}>Выйти</Text></SmoothButton>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <SmoothButton style={styles.actionBtn} onPress={copyCode}><Ionicons name="copy-outline" size={16} color={COLORS.textSec} /><Text style={styles.actionBtnText}>Копировать ID</Text></SmoothButton>
            <Animated.View style={{ transform: [{ scale: menuBtnAnim }] }}><SmoothButton style={styles.squareBtn} onPress={toggleCard}><Ionicons name="menu" size={24} color={COLORS.textSec} /></SmoothButton></Animated.View>
            <SmoothButton style={[styles.squareBtn, { backgroundColor: isInCall ? COLORS.red : '#1f3a29' }]} onPress={startCall}>
              <Ionicons name={isInCall ? "return-down-forward" : "call"} size={24} color="#fff" />
            </SmoothButton>
          </View>
        </View>

        <View style={styles.chatContainer}>
          {chat.length === 0 && <Text style={styles.emptyText}>Чат пуст...</Text>}
          <ScrollView>
            {chat.map((m) => (
              <Animatable.View key={m.id} animation="fadeInUp" duration={300}>
                <View style={styles.msgBubble}>
                  <Text style={styles.msgAuthor}>{m.user}</Text>
                  {m.isVoice ? (
                    <TouchableOpacity onPress={() => playVoice(m.uri)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ backgroundColor: COLORS.blue, padding: 8, borderRadius: 20 }}><Ionicons name="play" size={16} color="#fff" /></View>
                      <View style={{ flex: 1 }}><Text style={styles.msgText}>Голосовое сообщение</Text><Text style={{ color: COLORS.textDim, fontSize: 10 }}>{m.text.match(/\[Голосовое (.*)\]/)?.[1] || '00:00'}</Text></View>
                    </TouchableOpacity>
                  ) : (<Text style={styles.msgText}>{m.text}</Text>)}
                </View>
              </Animatable.View>
            ))}
          </ScrollView>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.bottomBar}>
            <TextInput style={styles.chatInput} placeholder="Сообщение..." placeholderTextColor={COLORS.textDim} value={msg} onChangeText={setMsg} />
            <TouchableOpacity onPressIn={() => { if (!isRecording) handlePressIn(); }} onPressOut={() => { if (isRecording) handlePressOut(); }} activeOpacity={0.7} style={[styles.micBtnSmall, isRecording && { backgroundColor: COLORS.red }]}>
              <Ionicons name={isRecording ? "mic" : "mic-outline"} size={22} color={isRecording ? "#fff" : COLORS.textSec} />
            </TouchableOpacity>
            <SmoothButton style={styles.sendBtn} onPress={sendMsg}><Ionicons name="send" size={20} color="#fff" /></SmoothButton>
          </View>
        </KeyboardAvoidingView>

        {/* Плавающая кнопка звонка */}
        {isInCall && isCallMinimized && (
          <View style={styles.floatingCallContainer}>
            {callMenuOpen && (
              <View style={styles.callMenuPopup}>
                <TouchableOpacity style={styles.callMenuItem} onPress={() => { setMyMicOn(!myMicOn); if (localStream.current) localStream.current.getAudioTracks().forEach(t => t.enabled = !myMicOn); }}>
                  <Ionicons name={myMicOn ? "mic-off" : "mic"} size={20} color="#fff" />
                  <Text style={styles.callMenuText}>{myMicOn ? "Выключить микрофон" : "Включить микрофон"}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.callMenuItem} onPress={restoreCall}>
                  <Ionicons name="expand" size={20} color="#fff" />
                  <Text style={styles.callMenuText}>Вернуться в звонок</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.callMenuItem, { backgroundColor: COLORS.red }]} onPress={endCall}>
                  <Ionicons name="call" size={20} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
                  <Text style={styles.callMenuText}>Завершить звонок</Text>
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity style={styles.floatingCallBtn} onPress={() => setCallMenuOpen(!callMenuOpen)} onLongPress={restoreCall}>
              <Ionicons name="call" size={22} color="#fff" />
              <Text style={styles.floatingCallText}>{formatTime(callDuration)}</Text>
            </TouchableOpacity>
            {/* Крестик — скрывает плашку, но звонок продолжается */}
            <TouchableOpacity style={styles.floatingEndCallBtn} onPress={hideCallBubble}>
              <Ionicons name="close" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // ЗВОНОК
  if (screen === 'call') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Text style={styles.headerTitle}>Звонок</Text><Text style={{ color: COLORS.green, fontWeight: 'bold' }}>{formatTime(callDuration)}</Text></View>
          <SmoothButton onPress={minimizeCall} style={{ padding: 5 }}><Ionicons name="chevron-down" size={32} color={COLORS.textSec} /></SmoothButton>
        </View>
        <View style={styles.callGrid}>
          <View style={styles.callSquare}>
             <View style={styles.callSquareHeader}><Text style={styles.callSquareName}>{name || 'Вы'}</Text><Text style={styles.callSquareIp}>{myLocalIp}</Text></View>
             <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><MaterialCommunityIcons name="skull" size={20} color={COLORS.green} /><Text style={{ color: COLORS.green, fontWeight: 'bold', fontSize: 12 }}>12 ms</Text></View>
                <SmoothButton onPress={() => setMyMicOn(!myMicOn)} activeScale={0.8}>
                  <PulseIcon active={myMicOn && isSpeaking} color={myMicOn ? COLORS.green : COLORS.red} isMuted={!myMicOn} />
                </SmoothButton>
             </View>
          </View>
          <View style={[styles.callSquare, { borderColor: COLORS.border }]}>
             <View style={styles.callSquareHeader}><Text style={styles.callSquareName}>Собеседник</Text><Text style={styles.callSquareIp}>{remoteStream ? 'Подключен' : 'Ожидание...'}</Text></View>
             {remoteStream && <RTCView streamURL={remoteStream.toURL()} style={{ flex: 1, width: '100%' }} objectFit="cover" />}
             <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><MaterialCommunityIcons name="skull" size={20} color={remoteStream ? COLORS.green : '#f1c40f'} /><Text style={{ color: remoteStream ? COLORS.green : '#f1c40f', fontWeight: 'bold', fontSize: 12 }}>{remoteStream ? '12 ms' : '-- ms'}</Text></View>
                <Ionicons name="mic" size={28} color="#3f3f46" />
             </View>
          </View>
        </View>
        <View style={{ padding: 30, alignItems: 'center' }}><SmoothButton style={styles.endCallBtn} onPress={endCall}><Ionicons name="call" size={30} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} /></SmoothButton></View>
      </SafeAreaView>
    );
  }

  // ЛИЧНЫЙ ЧАТ
  if (screen === 'chat' && activeChat) {
    const msgs = chatMessages[activeChat.code] || [];
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.chatHeader}>
          <TouchableOpacity onPress={() => setScreen('home')} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Image source={{ uri: activeChat.avatar }} style={styles.headerAvatar} />
          <View style={styles.headerInfo}>
            <Text style={[styles.headerName, { color: nameColor }]}>{activeChat.name}</Text>
            <Text style={styles.headerStatus}>{activeChat.online ? 'В сети' : 'Не в сети'}</Text>
          </View>
          <TouchableOpacity onPress={startCall} style={styles.callButton}>
            <Ionicons name="call" size={22} color={COLORS.green} />
          </TouchableOpacity>
        </View>

        <FlatList
          data={msgs}
          keyExtractor={(item, idx) => (item.time + item.text + idx).toString()}
          contentContainerStyle={styles.messagesList}
          renderItem={({ item }) => (
            <View style={[styles.messageBubble, item.sender === 'me' ? styles.myMessage : styles.otherMessage]}>
              <Text style={styles.messageText}>{item.text}</Text>
              <Text style={styles.messageTime}>{item.time}</Text>
            </View>
          )}
        />

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.inputContainer}>
          <TextInput style={styles.messageInput} value={msg} onChangeText={setMsg} placeholder="Сообщение" placeholderTextColor={COLORS.textDim} multiline />
          <TouchableOpacity onPress={sendChatMessage} style={styles.sendBtn}><Ionicons name="send" size={20} color="#fff" /></TouchableOpacity>
        </KeyboardAvoidingView>

        {/* Плавающая кнопка звонка */}
        {isInCall && isCallMinimized && (
          <View style={styles.floatingCallContainer}>
            {callMenuOpen && (
              <View style={styles.callMenuPopup}>
                <TouchableOpacity style={styles.callMenuItem} onPress={() => { setMyMicOn(!myMicOn); if (localStream.current) localStream.current.getAudioTracks().forEach(t => t.enabled = !myMicOn); }}>
                  <Ionicons name={myMicOn ? "mic-off" : "mic"} size={20} color="#fff" />
                  <Text style={styles.callMenuText}>{myMicOn ? "Выключить микрофон" : "Включить микрофон"}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.callMenuItem} onPress={restoreCall}>
                  <Ionicons name="expand" size={20} color="#fff" />
                  <Text style={styles.callMenuText}>Вернуться в звонок</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.callMenuItem, { backgroundColor: COLORS.red }]} onPress={endCall}>
                  <Ionicons name="call" size={20} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
                  <Text style={styles.callMenuText}>Завершить звонок</Text>
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity style={styles.floatingCallBtn} onPress={() => setCallMenuOpen(!callMenuOpen)} onLongPress={restoreCall}>
              <Ionicons name="call" size={22} color="#fff" />
              <Text style={styles.floatingCallText}>{formatTime(callDuration)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.floatingEndCallBtn} onPress={hideCallBubble}>
              <Ionicons name="close" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // ГЛАВНЫЙ ЭКРАН
  return (
    <SafeAreaView style={styles.container}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <MaterialCommunityIcons name="skull" size={32} color={COLORS.green} />
          <Text style={styles.logoText}>voice yok</Text>
          {/* Индикатор активного звонка в фоне */}
          {isInCall && !isCallMinimized && (
            <TouchableOpacity 
              style={{ marginLeft: 10, backgroundColor: COLORS.green, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 5 }}
              onPress={() => { setIsCallMinimized(true); setScreen('call'); }}
            >
              <Ionicons name="call" size={12} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>{formatTime(callDuration)}</Text>
            </TouchableOpacity>
          )}
        </View>
        <SmoothButton style={styles.settingsBtn} onPress={() => { setScreen('settings'); if (vibrationEnabled) Vibration.vibrate(10); }}>
          <Ionicons name="settings-outline" size={24} color={COLORS.textSec} />
        </SmoothButton>
      </View>

      <View style={{ flex: 1 }}>
        {activeTab === 'chats' && (
          <View style={{ flex: 1 }}>
            <View style={{ paddingHorizontal: 20, marginBottom: 10, flexDirection: 'row', gap: 10 }}>
              <View style={[styles.searchBar, { flex: 1 }]}>
                <Ionicons name="search" size={20} color={COLORS.textDim} />
                <TextInput style={styles.searchInput} placeholder="Введите ID друга..." placeholderTextColor={COLORS.textDim} value={searchId} onChangeText={setSearchId} autoCapitalize="characters" />
              </View>
              <TouchableOpacity style={styles.addButton} onPress={searchAndAddContact}>
                <Ionicons name="person-add" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              {contacts.length === 0 && <Text style={{ color: COLORS.textDim, textAlign: 'center', marginTop: 50 }}>Нет контактов. Добавьте друга по ID.</Text>}
              {contacts.map((item) => (
                <TouchableOpacity key={item.id} style={styles.chatItem} onPress={() => openChat(item)}>
                  <View style={[styles.chatAvatar, { backgroundColor: item.online ? '#1f3a29' : '#3b2d5c' }]}>
                    <Text style={styles.chatAvatarText}>{item.name[0]}</Text>
                    {item.online && <View style={styles.onlineIndicator} />}
                  </View>
                  <View style={styles.chatInfo}>
                    <View style={styles.chatRow}>
                      <Text style={styles.chatName}>{item.name}</Text>
                      <Text style={styles.chatTime}>{item.time}</Text>
                    </View>
                    <Text style={styles.chatLastMsg} numberOfLines={1}>{item.lastMsg}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.fab} onPress={() => createRoom(false)}>
              <Ionicons name="add" size={30} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {activeTab === 'games' && (
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text style={{ color: COLORS.text, fontSize: 24, fontWeight: 'bold', marginBottom: 20 }}>Игровая зона</Text>
            
            <View style={styles.myNetworkCard}>
              <View style={styles.myNetworkHeader}>
                <Ionicons name="wifi" size={20} color={COLORS.green} />
                <Text style={styles.myNetworkTitle}>Вы в сети</Text>
              </View>
              <Text style={styles.myNetworkId}>ID: {userCode}</Text>
              <Text style={styles.myNetworkIp}>Локальный IP: {myLocalIp}</Text>
              <Text style={styles.myNetworkIp}>Сгенерированный IP: {generatedIp}</Text>
              <SmoothButton style={[styles.primaryBtn, { marginTop: 10, backgroundColor: COLORS.green }]} onPress={() => setShowCreateTeam(true)}>
                <Text style={styles.primaryBtnText}>+ Создать команду</Text>
                <Ionicons name="add" size={20} color="#fff" />
              </SmoothButton>
            </View>

            <Text style={styles.sectionTitle}>Устройства в сети</Text>
            {contacts.filter(c => c.online).map((peer) => (
              <View key={peer.id} style={styles.peerCard}>
                <Image source={{ uri: peer.avatar }} style={styles.peerAvatar} />
                <View style={styles.peerInfo}>
                  <Text style={styles.peerName}>{peer.name}</Text>
                  <Text style={styles.peerIp}>IP: {myLocalIp}</Text>
                  <Text style={styles.peerPing}>🟢 {Math.floor(Math.random() * 20 + 5)} мс</Text>
                </View>
                <TouchableOpacity style={styles.inviteButton} onPress={() => toggleTeamPeer(peer)}>
                  <Ionicons name={selectedTeamPeers.find(p => p.id === peer.id) ? "checkmark" : "person-add"} size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}

            {team.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Моя команда</Text>
                <View style={styles.teamGrid}>
                  {team.map((member, index) => (
                    <View key={index} style={styles.teamCard}>
                      <Image source={{ uri: member.avatar }} style={styles.teamAvatar} />
                      <Text style={[styles.teamName, { color: member.isLeader ? COLORS.green : COLORS.text }]}>{member.name}</Text>
                      <Text style={styles.teamIp}>{member.ip}</Text>
                      {member.isLeader && <View style={styles.leaderBadge}><Text style={styles.leaderText}>Лидер</Text></View>}
                    </View>
                  ))}
                </View>
              </>
            )}

            <Text style={styles.sectionTitle}>Лобби</Text>
            {gameLobbies.map((lobby) => (
              <View key={lobby.id} style={styles.lobbyCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: 'bold' }}>{lobby.title}</Text>
                  <Text style={{ color: COLORS.green, fontSize: 12 }}>IP: {lobby.ip}</Text>
                </View>
                <Text style={{ color: COLORS.textDim, marginTop: 5 }}>Игроков: {lobby.players}/{lobby.max}</Text>
                <SmoothButton style={[styles.primaryBtn, { marginTop: 15, backgroundColor: '#1f3a29' }]} onPress={() => joinRoom(lobby.id)}>
                  <Text style={styles.primaryBtnText}>Присоединиться</Text>
                  <Ionicons name="arrow-forward" size={20} color="#fff" />
                </SmoothButton>
              </View>
            ))}
          </ScrollView>
        )}

        {activeTab === 'profile' && (
          <ScrollView contentContainerStyle={{ padding: 20, alignItems: 'center' }}>
            <TouchableOpacity onPress={() => setShowAvatarPicker(true)}>
              <View style={styles.profileAvatar}>
                <Image source={{ uri: avatar }} style={{ width: '100%', height: '100%', borderRadius: 60 }} />
                <View style={{ position: 'absolute', bottom: 0, right: 0, backgroundColor: COLORS.blue, padding: 5, borderRadius: 15 }}><Ionicons name="camera" size={20} color="#fff" /></View>
              </View>
            </TouchableOpacity>
            <Text style={[styles.profileName, { color: nameColor }]}>{name}</Text>
            <Text style={{ color: COLORS.textDim, fontSize: 14, marginTop: 5 }}>ID: {userCode}</Text>
            <Text style={{ color: COLORS.green, fontSize: 14, marginTop: 5 }}>IP: {myLocalIp}</Text>

            <View style={{ width: '100%', marginTop: 30 }}>
              <Text style={styles.sectionTitle}>НАСТРОЙКИ ПРОФИЛЯ</Text>
              <View style={styles.settingsCard}>
                <TouchableOpacity style={styles.settingsItem} onPress={() => { setNewName(name); setShowNameChange(true); }}>
                  <Text style={styles.settingsText}>Изменить имя</Text>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.textDim} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.settingsItem} onPress={() => setShowColorPicker(true)}>
                  <Text style={styles.settingsText}>Цвет имени</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: nameColor }} />
                    <Ionicons name="chevron-forward" size={20} color={COLORS.textDim} />
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.settingsItem} onPress={() => setScreen('settings')}>
                  <Text style={styles.settingsText}>Настройки сервера</Text>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.textDim} />
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        )}
      </View>

      {/* НИЖНЯЯ ПАНЕЛЬ */}
      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabItem} onPress={() => { setActiveTab('chats'); setScreen('home'); }}>
          <Ionicons name={activeTab === 'chats' ? "chatbubbles" : "chatbubbles-outline"} size={24} color={activeTab === 'chats' ? COLORS.green : COLORS.textSec} />
          <Text style={[styles.tabText, activeTab === 'chats' && { color: COLORS.green }]}>Чаты</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => { setActiveTab('games'); setScreen('home'); }}>
          <Ionicons name={activeTab === 'games' ? "game-controller" : "game-controller-outline"} size={24} color={activeTab === 'games' ? COLORS.green : COLORS.textSec} />
          <Text style={[styles.tabText, activeTab === 'games' && { color: COLORS.green }]}>Игры</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => { setActiveTab('profile'); setScreen('home'); }}>
          <Ionicons name={activeTab === 'profile' ? "person" : "person-outline"} size={24} color={activeTab === 'profile' ? COLORS.green : COLORS.textSec} />
          <Text style={[styles.tabText, activeTab === 'profile' && { color: COLORS.green }]}>Профиль</Text>
        </TouchableOpacity>
      </View>

      {/* МОДАЛКА: ВЫБОР АВАТАРКИ */}
      <Modal visible={showAvatarPicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Выбери аватарку</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 }}>
              {AVATAR_STUBS.map((url, i) => (
                <TouchableOpacity key={i} onPress={() => changeAvatar(url)}>
                  <Image source={{ uri: url }} style={{ width: 70, height: 70, borderRadius: 35, borderWidth: avatar === url ? 3 : 0, borderColor: COLORS.green }} />
                </TouchableOpacity>
              ))}
            </View>
            <SmoothButton style={[styles.primaryBtn, { marginTop: 15, backgroundColor: COLORS.blue }]} onPress={pickImageFromGallery}>
              <Ionicons name="image" size={20} color="#fff" />
              <Text style={styles.primaryBtnText}>Загрузить своё фото</Text>
            </SmoothButton>
            <SmoothButton style={[styles.primaryBtn, { marginTop: 10, backgroundColor: COLORS.red }]} onPress={() => setShowAvatarPicker(false)}>
              <Text style={styles.primaryBtnText}>Закрыть</Text>
            </SmoothButton>
          </View>
        </View>
      </Modal>

      {/* МОДАЛКА: СМЕНА ИМЕНИ */}
      <Modal visible={showNameChange} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Изменить имя</Text>
            <TextInput
              style={styles.nameInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="Новое имя"
              placeholderTextColor={COLORS.textDim}
              maxLength={20}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: '#18181b' }]} onPress={() => setShowNameChange(false)}>
                <Text style={{ color: COLORS.textSec, fontWeight: '600' }}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: COLORS.blue }]} onPress={saveName}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Сохранить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* МОДАЛКА: ВЫБОР ЦВЕТА ИМЕНИ */}
      <Modal visible={showColorPicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Выбери цвет имени</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 10 }}>
              {['#ffffff', '#23a559', '#5865F2', '#ff6b6b', '#ffd93d', '#6c5ce7', '#fd79a8', '#00cec9'].map((color, i) => (
                <TouchableOpacity key={i} onPress={async () => {
                  setNameColor(color);
                  await AsyncStorage.setItem('@voiceyok_namecolor', color);
                  setShowColorPicker(false);
                }}>
                  <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: color, borderWidth: nameColor === color ? 3 : 0, borderColor: '#fff' }} />
                </TouchableOpacity>
              ))}
            </View>
            <SmoothButton style={[styles.primaryBtn, { marginTop: 20, backgroundColor: COLORS.red }]} onPress={() => setShowColorPicker(false)}>
              <Text style={styles.primaryBtnText}>Закрыть</Text>
            </SmoothButton>
          </View>
        </View>
      </Modal>

      {/* МОДАЛКА: СОЗДАНИЕ КОМАНДЫ */}
      <Modal visible={showCreateTeam} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Создать команду</Text>
            <Text style={styles.modalSubtitle}>Выберите игроков из сети</Text>
            
            <ScrollView style={{ maxHeight: 300 }}>
              {contacts.filter(c => c.online).map((item) => (
                <TouchableOpacity key={item.id} style={styles.modalPeerItem} onPress={() => toggleTeamPeer(item)}>
                  <Image source={{ uri: item.avatar }} style={styles.modalPeerAvatar} />
                  <View style={styles.modalPeerInfo}>
                    <Text style={styles.modalPeerName}>{item.name}</Text>
                    <Text style={styles.modalPeerIp}>{myLocalIp}</Text>
                  </View>
                  <Ionicons 
                    name={selectedTeamPeers.find(p => p.id === item.id) ? "checkmark-circle" : "add-circle-outline"} 
                    size={24} 
                    color={selectedTeamPeers.find(p => p.id === item.id) ? COLORS.green : COLORS.textSec} 
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: '#18181b' }]} onPress={() => { setShowCreateTeam(false); setSelectedTeamPeers([]); }}>
                <Text style={{ color: COLORS.textSec, fontWeight: '600' }}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: COLORS.green }]} onPress={confirmCreateTeam}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Создать ({selectedTeamPeers.length})</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ============ СТИЛИ ============
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  logoText: { fontSize: 22, fontWeight: 'bold', color: COLORS.text },
  settingsBtn: { backgroundColor: '#18181b', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  profileAvatar: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#3b2d5c', justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  profileName: { fontSize: 26, fontWeight: 'bold', marginTop: 15 },
  sectionTitle: { color: COLORS.textDim, fontSize: 12, fontWeight: 'bold', marginBottom: 10, marginLeft: 10, marginTop: 20 },
  settingsCard: { backgroundColor: COLORS.card, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
  settingsItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  settingsText: { color: COLORS.text, fontSize: 16 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 15, paddingVertical: 10, borderWidth: 1, borderColor: COLORS.border },
  searchInput: { flex: 1, color: COLORS.text, marginLeft: 10, fontSize: 16 },
  addButton: { backgroundColor: COLORS.green, width: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  chatItem: { flexDirection: 'row', padding: 15, borderBottomWidth: 1, borderBottomColor: '#18181b' },
  chatAvatar: { width: 55, height: 55, borderRadius: 27.5, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  chatAvatarText: { color: COLORS.text, fontSize: 22, fontWeight: 'bold' },
  onlineIndicator: { position: 'absolute', bottom: 2, right: 2, width: 14, height: 14, borderRadius: 7, backgroundColor: COLORS.green, borderWidth: 2, borderColor: COLORS.bg },
  chatInfo: { flex: 1, marginLeft: 15, justifyContent: 'center' },
  chatRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  chatName: { color: COLORS.text, fontSize: 17, fontWeight: 'bold' },
  chatTime: { color: COLORS.textDim, fontSize: 12 },
  chatLastMsg: { color: COLORS.textSec, fontSize: 14 },
  fab: { position: 'absolute', bottom: 20, right: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.blue, justifyContent: 'center', alignItems: 'center', elevation: 5 },
  lobbyCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 15, marginBottom: 15, borderWidth: 1, borderColor: COLORS.border },
  tabBar: { flexDirection: 'row', backgroundColor: COLORS.card, borderTopWidth: 1, borderTopColor: COLORS.border, paddingVertical: 10, paddingBottom: Platform.OS === 'ios' ? 25 : 10 },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  tabText: { fontSize: 12, fontWeight: '600', color: COLORS.textSec },
  
  floatingCallContainer: { position: 'absolute', right: 15, bottom: 90, alignItems: 'center', zIndex: 100 },
  callMenuPopup: { backgroundColor: '#18181b', borderRadius: 12, padding: 8, marginBottom: 10, minWidth: 200, borderWidth: 1, borderColor: COLORS.border, elevation: 10 },
  callMenuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, gap: 10, borderRadius: 8 },
  callMenuText: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  floatingCallBtn: { width: 56, height: 56, borderRadius: 14, backgroundColor: COLORS.green, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4 },
  floatingCallText: { color: COLORS.text, fontSize: 10, fontWeight: 'bold', marginTop: 2 },
  floatingEndCallBtn: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.red, justifyContent: 'center', alignItems: 'center', elevation: 9 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.text },
  roomHeaderCard: { backgroundColor: COLORS.card, margin: 20, padding: 20, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, zIndex: 10 },
  roomTitle: { color: COLORS.text, fontSize: 20, fontWeight: 'bold' },
  disconnectBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.red, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, gap: 5 },
  disconnectText: { color: COLORS.text, fontSize: 13, fontWeight: 'bold' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#18181b', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, gap: 8 },
  actionBtnText: { color: COLORS.textSec, fontSize: 14, fontWeight: '600' },
  squareBtn: { backgroundColor: '#18181b', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center' },
  chatContainer: { flex: 1, paddingHorizontal: 20, justifyContent: 'center' },
  emptyText: { color: COLORS.textDim, textAlign: 'center', fontSize: 16 },
  msgBubble: { backgroundColor: COLORS.card, padding: 15, borderRadius: 16, marginBottom: 10, alignSelf: 'flex-start', maxWidth: '85%', borderWidth: 1, borderColor: COLORS.border },
  msgAuthor: { color: COLORS.blue, fontSize: 12, fontWeight: 'bold', marginBottom: 5 },
  msgText: { color: COLORS.text, fontSize: 15 },
  bottomBar: { flexDirection: 'row', padding: 20, backgroundColor: COLORS.card, borderTopWidth: 1, borderTopColor: COLORS.border, alignItems: 'center', gap: 10 },
  micBtnSmall: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#18181b', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  chatInput: { flex: 1, backgroundColor: COLORS.bg, borderRadius: 24, paddingHorizontal: 20, paddingVertical: 12, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border },
  sendBtn: { backgroundColor: COLORS.blue, width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  callGrid: { flex: 1, padding: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 15, justifyContent: 'center', alignContent: 'center' },
  callSquare: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.blue, borderRadius: 24, padding: 20, width: '45%', aspectRatio: 1, justifyContent: 'space-between' },
  callSquareHeader: { width: '100%', zIndex: 2 },
  callSquareName: { color: COLORS.text, fontSize: 18, fontWeight: 'bold' },
  callSquareIp: { color: COLORS.textSec, fontSize: 12, marginTop: 2 },
  endCallBtn: { width: 70, height: 70, borderRadius: 35, backgroundColor: COLORS.red, justifyContent: 'center', alignItems: 'center' },
  primaryBtn: { flexDirection: 'row', backgroundColor: COLORS.blue, borderRadius: 16, padding: 18, justifyContent: 'center', alignItems: 'center', gap: 8 },
  primaryBtnText: { color: COLORS.text, fontSize: 16, fontWeight: 'bold' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 15, marginBottom: 20 },
  input: { flex: 1, color: COLORS.text, paddingVertical: 16, fontSize: 16 },
  inputIcon: { marginRight: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: COLORS.card, borderRadius: 20, padding: 25, width: width * 0.85, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  modalTitle: { color: COLORS.text, fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  modalSubtitle: { color: COLORS.textDim, fontSize: 14, marginBottom: 10 },
  modalPeerItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border, width: '100%' },
  modalPeerAvatar: { width: 44, height: 44, borderRadius: 22 },
  modalPeerInfo: { flex: 1, marginLeft: 12 },
  modalPeerName: { color: COLORS.text, fontSize: 15, fontWeight: '600' },
  modalPeerIp: { color: COLORS.textDim, fontSize: 12, marginTop: 2 },
  modalButtons: { flexDirection: 'row', gap: 10, marginTop: 16, width: '100%' },
  modalButton: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  nameInput: { backgroundColor: COLORS.bg, borderRadius: 12, padding: 12, color: COLORS.text, fontSize: 16, borderWidth: 1, borderColor: COLORS.border, marginTop: 10, width: '100%' },
  
  // Игровая зона
  myNetworkCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 15, borderWidth: 1, borderColor: COLORS.green },
  myNetworkHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  myNetworkTitle: { color: COLORS.text, fontSize: 16, fontWeight: 'bold' },
  myNetworkId: { color: COLORS.textSec, fontSize: 14, marginTop: 4 },
  myNetworkIp: { color: COLORS.textSec, fontSize: 14, marginTop: 2 },
  peerCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 16, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
  peerAvatar: { width: 50, height: 50, borderRadius: 25 },
  peerInfo: { flex: 1, marginLeft: 12 },
  peerName: { color: COLORS.text, fontSize: 16, fontWeight: 'bold' },
  peerIp: { color: COLORS.textDim, fontSize: 12, marginTop: 2 },
  peerPing: { color: COLORS.green, fontSize: 11, marginTop: 2 },
  inviteButton: { backgroundColor: COLORS.green, width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  teamGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  teamCard: { width: (width - 64) / 3, backgroundColor: COLORS.card, padding: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  teamAvatar: { width: 50, height: 50, borderRadius: 25, marginBottom: 8 },
  teamName: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  teamIp: { fontSize: 11, color: COLORS.textDim, marginTop: 4 },
  leaderBadge: { backgroundColor: COLORS.green, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginTop: 6 },
  leaderText: { fontSize: 10, color: COLORS.text, fontWeight: '600' },
  
  // Чат
  chatHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backButton: { marginRight: 8 },
  headerAvatar: { width: 40, height: 40, borderRadius: 20 },
  headerInfo: { flex: 1, marginLeft: 12 },
  headerName: { fontSize: 16, fontWeight: '600' },
  headerStatus: { fontSize: 12, color: COLORS.textDim },
  callButton: { padding: 8 },
  messagesList: { padding: 16 },
  messageBubble: { maxWidth: '75%', padding: 12, borderRadius: 16, marginBottom: 8 },
  myMessage: { backgroundColor: COLORS.blue, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  otherMessage: { backgroundColor: '#182533', alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  messageText: { fontSize: 15, color: COLORS.text },
  messageTime: { fontSize: 10, color: COLORS.textDim, alignSelf: 'flex-end', marginTop: 4 },
});
