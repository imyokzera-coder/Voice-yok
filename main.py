
from kivy.app import App
from kivy.uix.screenmanager import ScreenManager, Screen
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.gridlayout import GridLayout
from kivy.uix.label import Label
from kivy.uix.button import Button
from kivy.uix.textinput import TextInput
from kivy.uix.scrollview import ScrollView
from kivy.graphics import Color, RoundedRectangle, Ellipse
from kivy.clock import Clock
import random
import string

class RoundedButton(Button):
    def __init__(self, bg_color=(0.35, 0.45, 1, 1), **kwargs):
        super(RoundedButton, self).__init__(**kwargs)
        self.bg_color = bg_color
        self.background_color = (0, 0, 0, 0)
        self.bind(pos=self.update_canvas, size=self.update_canvas)

    def update_canvas(self, *args):
        self.canvas.before.clear()
        with self.canvas.before:
            Color(*self.bg_color)
            RoundedRectangle(pos=self.pos, size=self.size, radius=[16])

class CardLayout(BoxLayout):
    def __init__(self, **kwargs):
        super(CardLayout, self).__init__(**kwargs)
        self.bind(pos=self.update_canvas, size=self.update_canvas)

    def update_canvas(self, *args):
        self.canvas.before.clear()
        with self.canvas.before:
            Color(0.15, 0.18, 0.25, 1) # Тонкая рамка
            RoundedRectangle(pos=(self.x-1, self.y-1), size=(self.width+2, self.height+2), radius=[22])
            Color(0.10, 0.12, 0.17, 1) # Фон карточки
            RoundedRectangle(pos=self.pos, size=self.size, radius=[20])

class IPBadge(BoxLayout):
    """Квадратная плашка с IPv4 адресом"""
    def __init__(self, ip_text, status_color=(0.2, 0.8, 0.4, 1), **kwargs):
        super(IPBadge, self).__init__(**kwargs)
        self.orientation = 'vertical'
        self.padding = 10
        self.spacing = 5
        self.bind(pos=self.update_canvas, size=self.update_canvas)
        
        # Индикатор и IP
        top_row = BoxLayout(size_hint=(1, 0.5), spacing=8)
        with top_row.canvas.before:
            Color(*status_color)
            Ellipse(pos=(top_row.x + 5, top_row.y + 8), size=(10, 10))
            
        ip_lbl = Label(text=ip_text, font_size=13, bold=True, color=(0.9, 0.95, 1, 1), halign='left', valign='middle')
        ip_lbl.bind(size=ip_lbl.setter('text_size'))
        top_row.add_widget(ip_lbl)
        self.add_widget(top_row)
        
        proto_lbl = Label(text="P2P UDP Stream", font_size=10, color=(0.5, 0.6, 0.7, 1), halign='left', valign='middle')
        proto_lbl.bind(size=proto_lbl.setter('text_size'))
        self.add_widget(proto_lbl)

    def update_canvas(self, *args):
        self.canvas.before.clear()
        with self.canvas.before:
            Color(0.16, 0.20, 0.28, 1)
            RoundedRectangle(pos=self.pos, size=self.size, radius=[12])


class HomeScreen(Screen):
    def __init__(self, **kwargs):
        super(HomeScreen, self).__init__(**kwargs)
        main_layout = BoxLayout(orientation='vertical', padding=20, spacing=15)
        
        with main_layout.canvas.before:
            Color(0.06, 0.07, 0.10, 1)
            RoundedRectangle(pos=self.x, size=main_layout.size)
        main_layout.bind(size=lambda *_: None, pos=lambda *_: None)

        # Верхняя панель
        top_bar = BoxLayout(size_hint=(1, 0.1), spacing=10)
        logo_label = Label(text="⚡  voice yok", font_size=20, bold=True, color=(1, 1, 1, 1), halign='left', valign='middle')
        logo_label.bind(size=logo_label.setter('text_size'))
        top_bar.add_widget(logo_label)
        
        settings_btn = Button(text="⚙️", size_hint=(None, None), size=(44, 44), background_color=(0.15, 0.18, 0.25, 1))
        top_bar.add_widget(settings_btn)
        main_layout.add_widget(top_bar)

        # Заголовок
        header_box = BoxLayout(orientation='vertical', size_hint=(1, 0.25), spacing=5)
        badge_label = Label(text="🟢 ЛИЧНЫЕ КОМНАТЫ • P2P", font_size=12, color=(0.2, 0.8, 0.4, 1), halign='left', valign='middle')
        badge_label.bind(size=badge_label.setter('text_size'))
        header_box.add_widget(badge_label)
        
        title_label = Label(text="Ближе, чем\nпросто голос.", font_size=28, bold=True, color=(1, 1, 1, 1), halign='left', valign='middle')
        title_label.bind(size=title_label.setter('text_size'))
        header_box.add_widget(title_label)
        
        desc_label = Label(text="Создайте комнату и отправьте код друзьям. Голосовой звонок идет напрямую между устройствами.", font_size=13, color=(0.6, 0.65, 0.75, 1), halign='left', valign='middle')
        desc_label.bind(size=desc_label.setter('text_size'))
        header_box.add_widget(desc_label)
        main_layout.add_widget(header_box)

        # Карточка ввода
        card = CardLayout(orientation='vertical', size_hint=(1, 0.55), padding=20, spacing=15)
        
        name_title = Label(text="ВАШЕ ИМЯ", font_size=11, color=(0.5, 0.55, 0.65, 1), halign='left', size_hint=(1, 0.1))
        name_title.bind(size=name_title.setter('text_size'))
        card.add_widget(name_title)
        
        self.name_input = TextInput(
            hint_text='Как к вам обращаться?',
            multiline=False,
            size_hint=(1, 0.22),
            background_color=(0.16, 0.19, 0.27, 1),
            foreground_color=(1, 1, 1, 1),
            cursor_color=(1, 1, 1, 1),
            padding=[15, 12, 15, 12]
        )
        card.add_widget(self.name_input)
        
        self.create_btn = RoundedButton(
            text="+ Создать комнату      →",
            bg_color=(0.38, 0.48, 1, 1),
            size_hint=(1, 0.25)
        )
        self.create_btn.bind(on_press=self.create_room)
        card.add_widget(self.create_btn)
        
        sep_label = Label(text="─── или войдите ───", font_size=12, color=(0.4, 0.45, 0.55, 1), halign='center', size_hint=(1, 0.1))
        card.add_widget(sep_label)
        
        room_title = Label(text="ID КОМНАТЫ", font_size=11, color=(0.5, 0.55, 0.65, 1), halign='left', size_hint=(1, 0.1))
        room_title.bind(size=room_title.setter('text_size'))
        card.add_widget(room_title)
        
        join_box = BoxLayout(size_hint=(1, 0.22), spacing=10)
        self.room_input = TextInput(
            hint_text='Например, K4M8QZ',
            multiline=False,
            size_hint=(0.75, 1),
            background_color=(0.16, 0.19, 0.27, 1),
            foreground_color=(1, 1, 1, 1),
            cursor_color=(1, 1, 1, 1),
            padding=[15, 12, 15, 12]
        )
        join_box.add_widget(self.room_input)
        
        self.join_btn = RoundedButton(
            text="→",
            bg_color=(0.18, 0.28, 0.22, 1),
            size_hint=(0.22, 1)
        )
        self.join_btn.bind(on_press=self.join_room)
        join_box.add_widget(self.join_btn)
        
        card.add_widget(join_box)
        main_layout.add_widget(card)

        footer_label = Label(text="🔒 Без регистрации. Только имя и код комнаты.", font_size=11, color=(0.5, 0.55, 0.65, 1), size_hint=(1, 0.05), halign='center')
        main_layout.add_widget(footer_label)

        self.add_widget(main_layout)

    def create_room(self, instance):
        name = self.name_input.text.strip() or "Хост"
        room_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        app = App.get_running_app()
        app.username = name
        app.room_code = room_code
        app.is_host = True
        app.root.current = 'room_ready'

    def join_room(self, instance):
        name = self.name_input.text.strip() or "Гость"
        code = self.room_input.text.strip().upper()
        if not code:
            return
        app = App.get_running_app()
        app.username = name
        app.room_code = code
        app.is_host = False
        app.root.current = 'active_room'


class RoomReadyScreen(Screen):
    def __init__(self, **kwargs):
        super(RoomReadyScreen, self).__init__(**kwargs)
        layout = BoxLayout(orientation='vertical', padding=25, spacing=20)
        with layout.canvas.before:
            Color(0.06, 0.07, 0.10, 1)
            RoundedRectangle(pos=self.pos, size=layout.size)
        layout.bind(size=lambda *_: None, pos=lambda *_: None)

        top_box = BoxLayout(size_hint=(1, 0.08), spacing=10)
        back_btn = Button(text="← Назад", size_hint=(None, None), size=(80, 40), background_color=(0.15, 0.18, 0.25, 1))
        back_btn.bind(on_press=lambda *_: setattr(App.get_running_app().root, 'current', 'home'))
        top_box.add_widget(back_btn)
        layout.add_widget(top_box)

        card = CardLayout(orientation='vertical', size_hint=(1, 0.75), padding=25, spacing=20)
        
        card.add_widget(Label(text="✅", font_size=32, size_hint=(1, 0.15)))
        card.add_widget(Label(text="Комната готова", font_size=22, bold=True, color=(1, 1, 1, 1), halign='center', size_hint=(1, 0.12)))
        
        subtitle = Label(text="Отправьте этот код собеседнику, чтобы он смог присоединиться.", font_size=13, color=(0.6, 0.65, 0.75, 1), halign='center', size_hint=(1, 0.15))
        subtitle.bind(size=subtitle.setter('text_size'))
        card.add_widget(subtitle)
        
        card.add_widget(Label(text="ID КОМНАТЫ", font_size=11, color=(0.5, 0.55, 0.65, 1), halign='center', size_hint=(1, 0.08)))

        self.code_label = Label(text="L6K8B3", font_size=28, bold=True, color=(0.3, 0.9, 0.6, 1), halign='center', size_hint=(1, 0.18))
        card.add_widget(self.code_label)

        self.share_btn = RoundedButton(text="📋 Поделиться кодом", bg_color=(0.18, 0.28, 0.22, 1), size_hint=(1, 0.2))
        self.share_btn.bind(on_press=self.copy_code)
        card.add_widget(self.share_btn)

        self.enter_btn = RoundedButton(text="Перейти в комнату      →", bg_color=(0.38, 0.48, 1, 1), size_hint=(1, 0.22))
        self.enter_btn.bind(on_press=lambda *_: setattr(App.get_running_app().root, 'current', 'active_room'))
        card.add_widget(self.enter_btn)

        layout.add_widget(card)
        layout.add_widget(Label(text="Код можно отправить только тем, кого вы хотите видеть в комнате.", font_size=11, color=(0.5, 0.55, 0.65, 1), size_hint=(1, 0.08), halign='center'))
        self.add_widget(layout)

    def on_enter(self):
        self.code_label.text = App.get_running_app().room_code

    def copy_code(self, instance):
        self.share_df = "✓ Скопировано!"
        Clock.schedule_once(lambda dt: setattr(self.share_btn, 'text', '📋 Поделиться кодом'), 2)


class ActiveRoomScreen(Screen):
    """Экран активной комнаты: Звонилка + Аватарки участников + Квадратные плашки IPv4 + Чат"""
    def __init__(self, **kwargs):
        super(ActiveRoomScreen, self).__init__(**kwargs)
        
        main_layout = BoxLayout(orientation='vertical', padding=15, spacing=10)
        with main_layout.canvas.before:
            Color(0.06, 0.07, 0.10, 1)
            RoundedRectangle(pos=self.pos, size=main_layout.size)
        main_layout.bind(size=lambda *_: None, pos=lambda *_: None)

        # Верхняя панель
        top_box = BoxLayout(size_hint=(1, 0.08), spacing=10)
        self.room_title = Label(text="Комната: ---", font_size=15, bold=True, color=(1, 1, 1, 1), halign='left', valign='middle')
        self.room_title.bind(size=self.room_title.setter('text_size'))
        top_box.add_widget(self.room_title)
        
        leave_btn = Button(text="Выйти ✕", size_hint=(None, None), size=(80, 36), background_color=(0.8, 0.2, 0.2, 1))
        leave_btn.bind(on_press=lambda *_: setattr(App.get_running_app().root, 'current', 'home'))
        top_box.add_widget(leave_btn)
        main_layout.add_widget(top_box)

        # 1. Секция участников и IPv4 плашек (Звонилка)
        audio_card = CardLayout(orientation='vertical', size_hint=(1, 0.38), padding=12, spacing=8)
        
        audio_header = Label(text="🎙️ ГОЛОСОВОЙ ЗВОНОК (P2P)", font_size=11, color=(0.2, 0.8, 0.4, 1), halign='left', size_hint=(1, 0.2))
        audio_header.bind(size=audio_header.setter('text_size'))
        audio_card.add_widget(audio_header)

        # Аватарки и IP плашки в сетке
        grid_box = GridLayout(cols=2, spacing=10, size_hint=(1, 0.8))
        
        # Участник 1 (Вы)
        grid_box.add_widget(IPBadge("192.168.1.15 (Вы)", (0.2, 0.8, 0.4, 1)))
        # Участник 2 (Собеседник)
        grid_box.add_widget(IPBadge("10.8.0.4 (peer)", (0.9, 0.7, 0.2, 1)))
        
        audio_card.add_widget(grid_box)
        main_layout.add_widget(audio_card)

        # 2. Секция чата
        chat_card = CardLayout(orientation='vertical', size_hint=(1, 0.38), padding=12, spacing=8)
        
        chat_title = Label(text="💬 КОМНАТНЫЙ ЧАТ", font_size=11, color=(0.5, 0.6, 0.7, 1), halign='left', size_hint=(1, 0.15))
        chat_title.bind(size=chat_title.setter('text_size'))
        chat_card.add_widget(chat_title)

        # История сообщений
        self.chat_scroll = ScrollView(size_hint=(1, 0.65))
        self.chat_history = Label(
            text="[Система]: Соединение установлено.\n[Алексей]: Всем привет!",
            font_size=12,
            color=(0.85, 0.9, 0.95, 1),
            halign='left',
            valign='top',
            markup=True
        )
        self.chat_history.bind(size=self.chat_history.setter('text_size'))
        self.chat_scroll.add_widget(self.chat_history)
        chat_card.add_widget(self.chat_scroll)

        # Поле ввода сообщения
        input_row = BoxLayout(size_hint=(1, 0.2), spacing=8)
        self.msg_input = TextInput(
            hint_text='Написать сообщение...',
            multiline=False,
            size_hint=(0.8, 1),
            background_color=(0.16, 0.19, 0.27, 1),
            foreground_color=(1, 1, 1, 1),
            padding=[10, 8, 10, 8]
        )
        input_row.add_widget(self.msg_input)
        
        send_btn = RoundedButton(text="➤", bg_color=(0.38, 0.48, 1, 1), size_hint=(0.2, 1))
        send_btn.bind(on_press=self.send_message)
        input_row.add_widget(send_btn)
        
        chat_card.add_widget(input_row)
        main_layout.add_widget(chat_card)

        # 3. Кнопки управления микрофоном и динамиком
        controls_box = BoxLayout(size_hint=(1, 0.12), spacing=10)
        
        self.mic_btn = RoundedButton(text="🎤 Микрофон ВКЛ", bg_color=(0.2, 0.6, 0.3, 1), size_hint=(0.6, 1))
        self.mic_btn.bind(on_press=self.toggle_mic)
        controls_box.add_widget(self.mic_btn)

        self.speaker_btn = RoundedButton(text="🔊 Динамик", bg_color=(0.2, 0.4, 0.7, 1), size_hint=(0.4, 1))
        self.speaker_btn.bind(on_press=self.toggle_speaker)
        controls_box.add_widget(self.speaker_btn)

        main_layout.add_widget(controls_box)
        self.add_widget(main_layout)

        self.mic_active = True
        self.speaker_active = True

    def on_enter(self):
        app = App.get_running_app()
        self.room_title.text = f"Комната: {app.room_code}"

    def send_message(self, instance):
        text = self.msg_input.text.strip()
        if text:
            app = App.get_running_app()
            current_text = self.chat_history.text
            self.chat_history.text = f"{current_text}\n[{app.username}]: {text}"
            self.msg_input.text = ""

    def toggle_mic(self, instance):
        self.mic_active = not self.mic_active
        if self.mic_active:
            self.mic_btn.text = "🎤 Микрофон ВКЛ"
            self.mic_btn.bg_color = (0.2, 0.6, 0.3, 1)
        else:
            self.mic_btn.text = "🔇 Микрофон ВЫКЛ"
            self.mic_btn.bg_color = (0.7, 0.2, 0.2, 1)

    def toggle_speaker(self, instance):
        self.speaker_active = not self.speaker_active
        self.speaker_btn.text = "🔊 Динамик" if self.speaker_active else "🔈 Тихо"


class VoiceYokApp(App):
    username = "Гость"
    room_code = ""
    is_host = True

    def build(self):
        self.title = "Voice Yok Pro"
        sm = ScreenManager()
        sm.add_widget(HomeScreen(name='home'))
        sm.add_widget(RoomReadyScreen(name='room_ready'))
        sm.add_widget(ActiveRoomScreen(name='active_room'))
        return sm

if __name__ == '__main__':
    VoiceYokApp().run()
