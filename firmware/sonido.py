import machine
import time

class SonidoJuego:
    def __init__(self, pin=2):
        # Configuramos el PWM en el pin del buzzer
        self.buzzer = machine.PWM(machine.Pin(pin, machine.Pin.OUT))
        self.buzzer.duty_u16(0) # Empezar en silencio
        
        # Variables para que el sonido no bloquee las animaciones
        self.fin_sonido = 0
        self.sonando = False

    def melodia_inicio(self):
        """tu tu tiiiii (Se ejecuta al encender el juego)"""
        # Tu (Nota corta)
        self.buzzer.freq(440) 
        self.buzzer.duty_u16(32768) # 50% de volumen
        time.sleep_ms(150)
        self.buzzer.duty_u16(0)
        time.sleep_ms(100)
        
        # Tu (Nota corta)
        self.buzzer.freq(440)
        self.buzzer.duty_u16(32768)
        time.sleep_ms(150)
        self.buzzer.duty_u16(0)
        time.sleep_ms(100)
        
        # Tiiiii (Nota larga y más aguda)
        self.buzzer.freq(880)
        self.buzzer.duty_u16(32768)
        time.sleep_ms(600)
        self.buzzer.duty_u16(0)

    def play_tono(self, freq, duracion_ms):
        """Inicia un tono y programa su apagado automático sin usar sleep"""
        self.buzzer.freq(freq)
        self.buzzer.duty_u16(32768)
        # Calculamos en qué milisegundo debe apagarse
        self.fin_sonido = time.ticks_add(time.ticks_ms(), duracion_ms)
        self.sonando = True

    def actualizar(self):
        """Se llama en el bucle principal para apagar el buzzer cuando toque"""
        if self.sonando:
            # Si el tiempo actual ya superó el tiempo final calculado...
            if time.ticks_diff(time.ticks_ms(), self.fin_sonido) >= 0:
                self.buzzer.duty_u16(0) # Apagar sonido
                self.sonando = False
