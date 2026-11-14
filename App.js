import React, { useState, useRef, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, TextInput, SafeAreaView, ScrollView, KeyboardAvoidingView, Platform, Clipboard, Alert, Animated, TouchableWithoutFeedback, Easing, TouchableOpacity, Vibration, Switch } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Animatable from 'react-native-animatable';
import { useAudioRecorder, AudioModule, RecordingPresets, useAudioPlayer } from 'expo-audio';
import { RTCPeerConnection, RTCView, mediaDevices, RTCIceCandidate, RTCSessionDescription } from 'react-native-webrtc';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CLICK_SOUND = require('./assets/click.mp3');

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
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [msg, setMsg] = useState('');
  const [chat, setChat] = useState([]);
  const [myLocalIp, setMyLocalIp] = useState('192.168.0.100'); 
  const [isInCall, setIsInCall] = useState(false);
  const [myMicOn, setMyMicOn] = useState(true);
  const [remoteStream, setRemoteStream] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);

  // IP Сервера
  const [serverIp, setServerIp] = useState('192.168.0.100');
  const [tempIp, setTempIp] = useState('192.168.0.100');

  const recordTimer = useRef(null);
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

  // Загрузка сохраненного IP
  useEffect(() => {
    const loadIp = async () => {
      try {
        const savedIp = await AsyncStorage.getItem('@voiceyok_ip');
        if (savedIp) {
          setServerIp(savedIp);
          setTempIp(savedIp);
        }
      } catch (e) {}
    };
    loadIp();
  }, []);

  const saveNewIp = async () => {
    try {
      await AsyncStorage.setItem('@voiceyok_ip', tempIp);
      setServerIp(tempIp);
      Alert.alert("Успех", "IP-адрес сервера обновлен!");
    } catch (e) {
      Alert.alert("Ошибка", "Не удалось сохранить IP");
    }
  };

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
    return () => { cancelled = true; };
  }, []);

  const playClick = useCallback(() => {
    if (!clickReady.current || isRecording) return;
    const now = Date.now();
    if (now - lastClickAt.current < 40 || clickBusy.current) return;
    lastClickAt.current = now;
    clickBusy.current = true;
    try { clickPlayer.seekTo(0); clickPlayer.play(); } catch (e) {}
    setTimeout(() => { clickBusy.current = false; }, 80);
  }, [isRecording]);

  const formatTime = (sec) => `${Math.floor(sec/60).toString().padStart(2,'0')}:${(sec%60).toString().padStart(2,'0')}`;

  useEffect(() => {
    if (isInCall) {
      const interval = setInterval(() => setCallDuration(prev => prev + 1), 1000);
      return () => clearInterval(interval);
    } else { setCallDuration(0); }
  }, [isInCall]);

  // Подключение WebSocket
  useEffect(() => {
    if (screen === 'room' && roomCode) {
      console.log(`Пытаюсь подключиться к ws://${serverIp}:3000...`);
      ws.current = new WebSocket(`ws://${serverIp}:3000`);

      ws.current.onopen = () => {
        console.log("WebSocket подключен успешно!");
        ws.current.send(JSON.stringify({ action: 'join', room: roomCode, user: name || 'Гость' }));
      };

      ws.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.action === 'message') {
          setChat((prev) => [...prev, { id: Date.now(), ...data.payload }]);
        } else if (data.action === 'signal') {
          handleSignal(data.payload);
        }
      };

      ws.current.onerror = (e) => {
        console.log("ОШИБКА WebSocket:", e.message);
      };

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
      stream.getTracks().forEach(track => peerConnection.current.addTrack(track, stream));
      peerConnection.current.onicecandidate = (event) => { 
        if (event.candidate && ws.current) {
          ws.current.send(JSON.stringify({ action: 'signal', room: roomCode, payload: { candidate: event.candidate } })); 
        }
      };
      peerConnection.current.ontrack = (event) => setRemoteStream(event.streams[0]);
    } catch (e) { console.error(e); }
  };

  const startCall = async () => {
    playClick();
    setIsInCall(true); setIsSpeaking(true); setScreen('call');
    await createPeerConnection();
    const offer = await peerConnection.current.createOffer();
    await peerConnection.current.setLocalDescription(offer);
    ws.current.send(JSON.stringify({ action: 'signal', room: roomCode, payload: { type: 'offer', signal: offer } }));
  };

  const endCall = () => {
    playClick();
    if (peerConnection.current) { peerConnection.current.close(); peerConnection.current = null; }
    if (localStream.current) { localStream.current.getTracks().forEach(t => t.stop()); localStream.current = null; }
    setRemoteStream(null); setIsInCall(false); setIsSpeaking(false); setScreen('room');
  };

  const requestPermission = async () => {
    const status = await AudioModule.requestRecordingPermissionsAsync();
    if (!status.granted) { Alert.alert("Ошибка", "Нет доступа к микрофону"); return false; }
    return true;
  };

  const toggleCard = () => {
    playClick();
    Animated.sequence([Animated.timing(menuBtnAnim, { toValue: 1.2, duration: 100, useNativeDriver: true }), Animated.spring(menuBtnAnim, { toValue: 1, friction: 3, tension: 40, useNativeDriver: true })]).start();
    Animated.timing(cardAnim, { toValue: cardAnim._value === 0 ? 1 : 0, duration: 400, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start();
  };

  const collapseCall = () => {
    Animated.timing(callScreenAnim, { toValue: 0, duration: 300, easing: Easing.in(Easing.ease), useNativeDriver: true }).start(() => { setScreen('room'); callScreenAnim.setValue(1); });
  };

  const handlePressIn = async () => {
    if (vibrationEnabled) Vibration.vibrate(10);
    const hasPermission = await requestPermission();
    if (!hasPermission) return;

    clearInterval(recordTimer.current); 
    setRecordDuration(0);               
    try { await audioRecorder.stop(); } catch (e) {} 

    await AudioModule.setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await audioRecorder.prepareToRecordAsync(); 
    audioRecorder.record();
    setIsRecording(true); 
    recordTimer.current = setInterval(() => setRecordDuration(prev => prev + 1), 1000);
  };

  const handlePressOut = async () => {
    if (!isRecording) return; 
    playClick();
    clearInterval(recordTimer.current); 
    try { await audioRecorder.stop(); } catch (e) {}
    const duration = recordDuration; 
    setIsRecording(false); setRecordDuration(0);
    if (duration > 0) {
      const voiceMsg = { user: name || 'Вы', text: `[Голосовое ${formatTime(duration)}]`, isVoice: true, uri: audioRecorder.uri };
      if (ws.current) ws.current.send(JSON.stringify({ action: 'message', room: roomCode, payload: voiceMsg }));
      setChat([...chat, { id: Date.now(), ...voiceMsg }]); 
    }
  };

  const playVoice = async (uri) => { try { await player.replace({ uri }); await player.play(); } catch (e) {} };
  
  const testMicrophone = async () => {
    const hasPermission = await requestPermission(); if (!hasPermission) return;
    await AudioModule.setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    Alert.alert("Микрофон", "Запись 3 секунды..."); await audioRecorder.prepareToRecordAsync(); audioRecorder.record();
    setTimeout(async () => {
      await audioRecorder.stop(); Alert.alert("Успех", "Сейчас вы услышите свой голос.");
      try { await player.replace({ uri: audioRecorder.uri }); await player.play(); } catch (e) {}
    }, 3000);
  };

  const createRoom = () => { 
    playClick();
    setRoomCode(Math.random().toString(36).substring(2, 8).toUpperCase()); 
    setScreen('room'); 
  };
  
  const joinRoom = () => { 
    playClick();
    if (joinCode.trim().length > 2) { setRoomCode(joinCode.toUpperCase()); setScreen('room'); } 
    else Alert.alert("Ошибка", "Введите ID"); 
  };
  
  const copyCode = () => { playClick(); Clipboard.setString(roomCode); Alert.alert("Успех", "Код скопирован!"); };
  
  const sendMsg = () => {
    playClick();
    if (msg.trim() && ws.current) {
      const messageData = { user: name || 'Вы', text: msg, isVoice: false };
      ws.current.send(JSON.stringify({ action: 'message', room: roomCode, payload: messageData }));
      setChat([...chat, { id: Date.now(), ...messageData }]); 
      setMsg('');
    }
  };

  // --- ЭКРАНЫ ---

  if (screen === 'settings') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}><Text style={styles.headerTitle}>Настройки</Text><SmoothButton onPress={() => setScreen('home')} style={{ padding: 5 }}><Ionicons name="close" size={28} color="#da373c" /></SmoothButton></View>
        <ScrollView style={{ padding: 20 }}>
          <Text style={styles.label}>МИКРОФОН</Text>
          <View style={styles.settingsCard}><Text style={{ color: '#fff', marginBottom: 10 }}>Проверка микрофона</Text><SmoothButton style={styles.primaryBtn} onPress={testMicrophone}><Text style={styles.primaryBtnText}>Записать и прослушать</Text></SmoothButton></View>
          
          <Text style={styles.label}>ИНТЕРФЕЙС</Text>
          <View style={styles.settingsCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: '#fff' }}>Вибрация</Text>
              <Switch value={vibrationEnabled} onValueChange={setVibrationEnabled} trackColor={{ true: '#5865F2' }} />
            </View>
          </View>

          <Text style={styles.label}>ТЕСТОВАЯ ФУНКЦИЯ: IP СЕРВЕРА</Text>
          <View style={styles.settingsCard}>
            <Text style={{ color: '#71717a', fontSize: 12, marginBottom: 10 }}>По умолчанию: 192.168.0.103</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="server-outline" size={20} color="#71717a" style={styles.inputIcon} />
              <TextInput style={styles.input} value={tempIp} onChangeText={setTempIp} placeholder="192.168.x.x" placeholderTextColor="#71717a" keyboardType="numbers-and-punctuation" />
            </View>
            <SmoothButton style={styles.primaryBtn} onPress={saveNewIp}><Text style={styles.primaryBtnText}>Сохранить IP</Text></SmoothButton>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === 'room') {
    return (
      <SafeAreaView style={styles.container}>
        {isRecording && (
          <View style={{ position: 'absolute', bottom: 85, right: 60, zIndex: 999 }}>
            <View style={{ backgroundColor: '#da373c', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 30, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="mic" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>{formatTime(recordDuration)}</Text>
            </View>
          </View>
        )}

        <View style={styles.roomHeaderCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Text style={styles.roomTitle}>Комната {roomCode}</Text><MaterialCommunityIcons name="skull" size={24} color="#23a559" /></View>
            <SmoothButton style={styles.disconnectBtn} onPress={() => { if(ws.current) ws.current.close(); endCall(); setScreen('home'); }}><Ionicons name="log-out-outline" size={18} color="#fff" /><Text style={styles.disconnectText}>Выйти</Text></SmoothButton>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <SmoothButton style={styles.actionBtn} onPress={copyCode}><Ionicons name="copy-outline" size={16} color="#a1a1aa" /><Text style={styles.actionBtnText}>Копировать ID</Text></SmoothButton>
            <Animated.View style={{ transform: [{ scale: menuBtnAnim }] }}><SmoothButton style={styles.squareBtn} onPress={toggleCard}><Ionicons name="menu" size={24} color="#a1a1aa" /></SmoothButton></Animated.View>
            <SmoothButton style={[styles.squareBtn, { backgroundColor: isInCall ? '#da373c' : '#1f3a29' }]} onPress={startCall}><Ionicons name={isInCall ? "return-down-forward" : "call"} size={24} color="#fff" /></SmoothButton>
          </View>
        </View>

        <Animated.View style={{ marginHorizontal: 20, marginBottom: 10, opacity: cardAnim, transform: [{ scale: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [0.01, 1] }) }, { translateX: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [130, 0] }) }, { translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [-80, 0] }) }] }}>
          <View style={styles.newParticipantCard}>
            <View style={styles.avatarContainer}><View style={styles.avatarBig}><Text style={styles.avatarTextBig}>{name ? name[0].toUpperCase() : 'В'}</Text></View><View style={styles.onlineDot} /></View>
            <View style={{ flex: 1, marginLeft: 15 }}><Text style={styles.participantNameBig}>{name || 'Вы'}</Text></View>
            <View style={{ alignItems: 'flex-end', gap: 10 }}>
              <TouchableOpacity onPress={() => { Clipboard.setString(myLocalIp); Alert.alert("Успех", "IP скопирован"); }}><View style={styles.ipBadge}><Text style={styles.ipText}>{myLocalIp}</Text></View></TouchableOpacity>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><MaterialCommunityIcons name="skull" size={16} color="#23a559" /><Text style={{ color: '#23a559', fontWeight: 'bold', fontSize: 12 }}>12 ms</Text></View>
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
                    <TouchableOpacity onPress={() => playVoice(m.uri)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ backgroundColor: '#5865F2', padding: 8, borderRadius: 20 }}><Ionicons name="play" size={16} color="#fff" /></View>
                      <View style={{ flex: 1 }}><Text style={styles.msgText}>Голосовое сообщение</Text><Text style={{ color: '#71717a', fontSize: 10 }}>{m.text.match(/\[Голосовое (.*)\]/)?.[1] || '00:00'}</Text></View>
                    </TouchableOpacity>
                  ) : (<Text style={styles.msgText}>{m.text}</Text>)}
                </View>
              </Animatable.View>
            ))}
          </ScrollView>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.bottomBar}>
            <TextInput style={styles.chatInput} placeholder="Сообщение..." placeholderTextColor="#71717a" value={msg} onChangeText={setMsg} />
            <TouchableOpacity onPressIn={handlePressIn} onPressOut={handlePressOut} activeOpacity={0.7} style={[styles.micBtnSmall, isRecording && { backgroundColor: '#da373c' }]}>
              <Ionicons name={isRecording ? "mic" : "mic-outline"} size={22} color={isRecording ? "#fff" : "#a1a1aa"} />
            </TouchableOpacity>
            <SmoothButton style={styles.sendBtn} onPress={sendMsg}><Ionicons name="send" size={20} color="#fff" /></SmoothButton>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (screen === 'call') {
    return (
      <Animated.View style={[styles.container, { opacity: callScreenAnim, transform: [{ scale: callScreenAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] }]}>
        <View style={styles.header}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Text style={styles.headerTitle}>Звонок</Text><Text style={{ color: '#23a559', fontWeight: 'bold' }}>{formatTime(callDuration)}</Text></View><SmoothButton onPress={collapseCall} style={{ padding: 5 }}><Ionicons name="chevron-down" size={32} color="#a1a1aa" /></SmoothButton></View>
        <View style={styles.callGrid}>
          <View style={styles.callSquare}>
             <View style={styles.callSquareHeader}><Text style={styles.callSquareName}>{name || 'Вы'}</Text><Text style={styles.callSquareIp}>{myLocalIp}</Text></View>
             <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><MaterialCommunityIcons name="skull" size={20} color="#23a559" /><Text style={{ color: '#23a559', fontWeight: 'bold', fontSize: 12 }}>12 ms</Text></View>
                <SmoothButton onPress={() => setMyMicOn(!myMicOn)} activeScale={0.8}>
                  <PulseIcon active={myMicOn && isSpeaking} color={myMicOn ? "#23a559" : "#da373c"} isMuted={!myMicOn} />
                </SmoothButton>
             </View>
          </View>
          <View style={[styles.callSquare, { borderColor: '#27272a' }]}>
             <View style={styles.callSquareHeader}><Text style={styles.callSquareName}>Собеседник</Text><Text style={styles.callSquareIp}>{remoteStream ? 'Подключен' : 'Ожидание...'}</Text></View>
             {remoteStream && <RTCView streamURL={remoteStream.toURL()} style={{ flex: 1, width: '100%' }} objectFit="cover" />}
             <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><MaterialCommunityIcons name="skull" size={20} color={remoteStream ? "#23a559" : "#f1c40f"} /><Text style={{ color: remoteStream ? "#23a559" : "#f1c40f", fontWeight: 'bold', fontSize: 12 }}>{remoteStream ? '12 ms' : '-- ms'}</Text></View>
                <Ionicons name="mic" size={28} color="#3f3f46" />
             </View>
          </View>
        </View>
        <View style={{ padding: 30, alignItems: 'center' }}><SmoothButton style={styles.endCallBtn} onPress={endCall}><Ionicons name="call" size={30} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} /></SmoothButton></View>
      </Animated.View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <Animatable.View animation="fadeIn" duration={800}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <MaterialCommunityIcons name="skull" size={32} color="#23a559" />
              <Text style={styles.logoText}>voice yok</Text>
            </View>
            <SmoothButton style={styles.settingsBtn} onPress={() => { setScreen('settings'); if (vibrationEnabled) Vibration.vibrate(10); }}>
              <Ionicons name="settings-outline" size={24} color="#a1a1aa" />
            </SmoothButton>
          </View>

          <View style={styles.headerBox}>
            <View style={styles.badge}>
              <View style={styles.badgeDot} />
              <Text style={styles.badgeText}>ИГРОВЫЕ КОМНАТЫ • MESH</Text>
            </View>
            <Text style={styles.titleText}>Играйте и общайтесь{'\n'}локально.</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>ВАШЕ ИМЯ</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="person-outline" size={20} color="#71717a" style={styles.inputIcon} />
              <TextInput style={styles.input} placeholder="Ваш никнейм" placeholderTextColor="#71717a" value={name} onChangeText={setName} />
            </View>
            
            <SmoothButton style={styles.primaryBtn} onPress={createRoom}>
              <Text style={styles.primaryBtnText}>+ Создать комнату</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </SmoothButton>

            <View style={styles.separator}>
              <View style={styles.separatorLine} />
              <Text style={styles.separatorText}>или войдите</Text>
              <View style={styles.separatorLine} />
            </View>

            <Text style={styles.label}>ID КОМНАТЫ</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={[styles.inputContainer, { flex: 1, marginBottom: 0 }]}>
                <Ionicons name="key-outline" size={20} color="#71717a" style={styles.inputIcon} />
                <TextInput style={styles.input} placeholder="Например, K4M8QZ" placeholderTextColor="#71717a" value={joinCode} onChangeText={setJoinCode} autoCapitalize="characters" />
              </View>
              <SmoothButton style={styles.joinBtn} onPress={joinRoom}>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </SmoothButton>
            </View>
          </View>
        </Animatable.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090b' },
  scrollContainer: { padding: 20, paddingTop: 60 },
  logoText: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  settingsBtn: { backgroundColor: '#18181b', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: '#27272a' },
  headerBox: { marginBottom: 30 },
  badge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#18181b', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginBottom: 15, borderWidth: 1, borderColor: '#27272a' },
  badgeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#23a559', marginRight: 8 },
  badgeText: { color: '#a1a1aa', fontSize: 12, fontWeight: 'bold' },
  titleText: { fontSize: 34, fontWeight: 'bold', color: '#fafafa', marginBottom: 15, lineHeight: 40 },
  card: { backgroundColor: '#121214', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: '#27272a' },
  label: { color: '#71717a', fontSize: 12, fontWeight: '600', marginBottom: 8, marginLeft: 4, marginTop: 10 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#09090b', borderRadius: 16, borderWidth: 1, borderColor: '#27272a', paddingHorizontal: 15, marginBottom: 20 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, color: '#fafafa', paddingVertical: 16, fontSize: 16 },
  primaryBtn: { flexDirection: 'row', backgroundColor: '#5865F2', borderRadius: 16, padding: 18, justifyContent: 'space-between', alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  separator: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  separatorLine: { flex: 1, height: 1, backgroundColor: '#27272a' },
  separatorText: { color: '#71717a', paddingHorizontal: 10, fontSize: 13 },
  joinBtn: { backgroundColor: '#23a559', borderRadius: 16, paddingHorizontal: 20, paddingVertical: 18, justifyContent: 'center', alignItems: 'center' },
  roomHeaderCard: { backgroundColor: '#121214', margin: 20, padding: 20, borderRadius: 20, borderWidth: 1, borderColor: '#27272a', zIndex: 10 },
  roomTitle: { color: '#fafafa', fontSize: 20, fontWeight: 'bold' },
  disconnectBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#da373c', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, gap: 5 },
  disconnectText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#18181b', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#27272a', gap: 8 },
  actionBtnText: { color: '#a1a1aa', fontSize: 14, fontWeight: '600' },
  squareBtn: { backgroundColor: '#18181b', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#27272a', justifyContent: 'center', alignItems: 'center' },
  chatContainer: { flex: 1, paddingHorizontal: 20, justifyContent: 'center' },
  emptyText: { color: '#71717a', textAlign: 'center', fontSize: 16 },
  msgBubble: { backgroundColor: '#121214', padding: 15, borderRadius: 16, marginBottom: 10, alignSelf: 'flex-start', maxWidth: '85%', borderWidth: 1, borderColor: '#27272a' },
  msgAuthor: { color: '#5865F2', fontSize: 12, fontWeight: 'bold', marginBottom: 5 },
  msgText: { color: '#fafafa', fontSize: 15 },
  bottomBar: { flexDirection: 'row', padding: 20, backgroundColor: '#121214', borderTopWidth: 1, borderTopColor: '#27272a', alignItems: 'center', gap: 10 },
  micBtnSmall: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#18181b', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#27272a' },
  chatInput: { flex: 1, backgroundColor: '#09090b', borderRadius: 24, paddingHorizontal: 20, paddingVertical: 12, color: '#fafafa', borderWidth: 1, borderColor: '#27272a' },
  sendBtn: { backgroundColor: '#5865F2', width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#121214', borderBottomWidth: 1, borderBottomColor: '#27272a' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fafafa' },
  settingsCard: { backgroundColor: '#121214', borderRadius: 16, padding: 15, borderWidth: 1, borderColor: '#27272a', marginBottom: 15 },
  connBtn: { flex: 1, padding: 10, borderRadius: 8, alignItems: 'center', backgroundColor: '#18181b', borderWidth: 1, borderColor: '#27272a', marginHorizontal: 2 },
  connBtnActive: { backgroundColor: '#5865F2', borderColor: '#5865F2' },
  callGrid: { flex: 1, padding: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 15, justifyContent: 'center', alignContent: 'center' },
  callSquare: { backgroundColor: '#121214', borderWidth: 1, borderColor: '#5865F2', borderRadius: 24, padding: 20, width: '45%', aspectRatio: 1, justifyContent: 'space-between' },
  callSquareHeader: { width: '100%', zIndex: 2 },
  callSquareName: { color: '#fafafa', fontSize: 18, fontWeight: 'bold' },
  callSquareIp: { color: '#a1a1aa', fontSize: 12, marginTop: 2 },
  endCallBtn: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#da373c', justifyContent: 'center', alignItems: 'center' },
  newParticipantCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#121214', padding: 15, borderRadius: 16, borderWidth: 1, borderColor: '#5865F2', position: 'relative' },
  avatarContainer: { position: 'relative' },
  avatarBig: { width: 50, height: 50, borderRadius: 16, backgroundColor: '#3b2d5c', justifyContent: 'center', alignItems: 'center' },
  avatarTextBig: { color: '#d4b8ff', fontWeight: 'bold', fontSize: 22 },
  onlineDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#23a559', position: 'absolute', bottom: -2, right: -2, borderWidth: 2, borderColor: '#121214' },
  participantNameBig: { color: '#fafafa', fontSize: 18, fontWeight: 'bold' },
  ipBadge: { backgroundColor: '#0f2e2d', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  ipText: { color: '#23a559', fontSize: 12, fontWeight: 'bold' },
});
