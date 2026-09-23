from machine import Pin, I2C
from ssd1306 import SSD1306_I2C
import time

class PantallaJuego:
    def __init__(self, scl_pin=6, sda_pin=5, oled_x=28):
        self.i2c = I2C(0, scl=Pin(scl_pin), sda=Pin(sda_pin))
        self.oled = SSD1306_I2C(128, 64, self.i2c, addr=0x3C)
        self.oled_x = oled_x
        
        self.estado = "listo"
        self.ganador_actual = ""
        
        # Variables de animación
        self.ultimo_update = 0
        self.offset_x = 0
        self.dir_x = 1
        
        # Fuente grande personalizada
        self.FONT = {
            "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
            "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
            "C": ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
            "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
            "N": ["10001", "11001", "11001", "10101", "10011", "10011", "10001"],
            "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
            "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
            "J": ["00111", "00010", "00010", "00010", "00010", "10010", "01100"]
        }

    def _ancho_texto(self, texto, escala=2):
        """Calcula los píxeles que ocupará el texto"""
        return len(texto) * 6 * escala - escala

    def _dibujar_letras(self, texto, x, y, escala=2):
        """Traduce el texto usando la fuente personalizada y lo dibuja"""
        cursor = x
        for letra in texto:
            if letra not in self.FONT:
                cursor += 6 * escala
                continue
            matriz = self.FONT[letra]
            for fila in range(7):
                for columna in range(5):
                    if matriz[fila][columna] == "1":
                        for dy in range(escala):
                            for dx in range(escala):
                                self.oled.pixel(cursor + columna * escala + dx, y + fila * escala + dy, 1)
            cursor += 6 * escala

    def set_estado(self, estado, nombre=""):
        """Cambia el modo de la pantalla"""
        self.estado = estado
        if estado == "listo":
            self.oled.fill(0)
            self.oled.text("LISTO", self.oled_x, 36)
            self.oled.show()
        elif estado == "ganador":
            self.ganador_actual = nombre
            self.offset_x = 0
            self.dir_x = 1
            self.ultimo_update = time.ticks_ms()
            self._dibujar_ganador()

    def _dibujar_ganador(self):
        """Función interna para actualizar el framebuffer y mostrar el ganador"""
        self.oled.fill(0)
        self._dibujar_letras(self.ganador_actual, self.oled_x + self.offset_x, 37, 2)
        self.oled.show()

    def actualizar(self):
        """Se llama en el bucle principal para manejar el rebote del texto (scroll)"""
        if self.estado == "ganador":
            ahora = time.ticks_ms()
            # Mover el texto cada 50ms
            if time.ticks_diff(ahora, self.ultimo_update) >= 50:
                self.ultimo_update = ahora
                
                ancho = self._ancho_texto(self.ganador_actual, 2)
                max_x = 72 - ancho
                if max_x < 0:
                    max_x = 0
                    
                self.offset_x += self.dir_x
                
                if self.offset_x >= max_x:
                    self.offset_x = max_x
                    self.dir_x = -1
                elif self.offset_x <= 0:
                    self.offset_x = 0
                    self.dir_x = 1
                    
                self._dibujar_ganador()
