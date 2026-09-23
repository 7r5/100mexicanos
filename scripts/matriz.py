import machine
import neopixel
import time

class MatrizJuego:
    def __init__(self, pin=10, brillo=0.004, zigzag=False):
        self.np = neopixel.NeoPixel(machine.Pin(pin, machine.Pin.OUT), 64)
        self.brillo = brillo
        self.zigzag = zigzag
        self.estado = "standby"
        
        # Variables de animación no bloqueante
        self.ultimo_update = 0
        self.offset_x = 0
        self.dir_x = 1
        
        # --- MAPAS 8x8 ---
        self.FLECHA_IZQ = [
            [0,0,0,1,1,0,0,0],
            [0,0,1,1,0,0,0,0],
            [0,1,1,0,0,0,0,0],
            [1,1,1,1,1,1,1,1],
            [1,1,1,1,1,1,1,1],
            [0,1,1,0,0,0,0,0],
            [0,0,1,1,0,0,0,0],
            [0,0,0,1,1,0,0,0]
        ]
        
        self.FLECHA_DER = [
            [0,0,0,1,1,0,0,0],
            [0,0,0,0,1,1,0,0],
            [0,0,0,0,0,1,1,0],
            [1,1,1,1,1,1,1,1],
            [1,1,1,1,1,1,1,1],
            [0,0,0,0,0,1,1,0],
            [0,0,0,0,1,1,0,0],
            [0,0,0,1,1,0,0,0]
        ]
        
        self.SIGNO = [
            [0,1,1,1,0],
            [1,0,0,0,1],
            [0,0,0,1,0],
            [0,0,1,0,0],
            [0,0,1,0,0],
            [0,0,0,0,0],
            [0,0,1,0,0],
            [0,0,0,0,0]
        ]

    def aplicar_brillo(self, color):
        """Escala los colores para gastar mínima energía"""
        return (int(color[0] * self.brillo), int(color[1] * self.brillo), int(color[2] * self.brillo))

    def get_indice(self, x, y):
        """Calcula el índice lineal, corrigiendo si la matriz es tipo zigzag"""
        if self.zigzag and (y % 2 != 0):
            return (y * 8) + (7 - x)
        return ((y * 8) + x)

    def set_estado(self, estado):
        """Configura los valores iniciales para la animación que se va a mostrar"""
        self.estado = estado
        self.ultimo_update = time.ticks_ms()
        
        if estado == "rojo":
            # CORREGIDO: Rojo va a la izquierda
            self.offset_x = 2
            self.dir_x = -1
        elif estado == "blanco":
            # CORREGIDO: Blanco va a la derecha
            self.offset_x = -2
            self.dir_x = 1
        elif estado == "standby":
            self.offset_x = 0
            self.dir_x = 1

    def actualizar(self):
        """Función que se llama en el loop principal para dibujar los cuadros (frames)"""
        ahora = time.ticks_ms()
        
        # ==========================================
        # ANIMACIÓN: STANDBY (SIGNO)
        # ==========================================
        if self.estado == "standby":
            if time.ticks_diff(ahora, self.ultimo_update) >= 150:
                self.ultimo_update = ahora
                color_dim = self.aplicar_brillo((0, 255, 255)) 
                self.np.fill((0,0,0))
                
                for y in range(len(self.SIGNO)):
                    for x in range(len(self.SIGNO[y])):
                        if self.SIGNO[y][x]:
                            x_real = x + self.offset_x
                            if 0 <= x_real < 8:
                                self.np[self.get_indice(x_real, y)] = color_dim
                self.np.write()
                
                self.offset_x += self.dir_x
                if self.offset_x >= 3: 
                    self.offset_x = 3
                    self.dir_x = -1
                elif self.offset_x <= 0:
                    self.offset_x = 0
                    self.dir_x = 1
                    
       # ==========================================
        # ANIMACIÓN: FLECHAS (ROJO Y BLANCO)
        # ==========================================
        elif self.estado in ("rojo", "blanco"):
            if time.ticks_diff(ahora, self.ultimo_update) >= 80:
                self.ultimo_update = ahora
                
                if self.estado == "rojo":
                    mapa = self.FLECHA_IZQ  # CORREGIDO: Rojo = Izquierda
                    color_dim = self.aplicar_brillo((255, 0, 0))
                else:
                    mapa = self.FLECHA_DER  # CORREGIDO: Blanco = Derecha
                    color_dim = self.aplicar_brillo((255, 255, 255))
                    
                self.np.fill((0,0,0))
                
                for y in range(8):
                    for x in range(8):
                        if mapa[y][x]:
                            x_real = x + self.offset_x
                            if 0 <= x_real < 8:
                                self.np[self.get_indice(x_real, y)] = color_dim
                self.np.write()
                
                self.offset_x += self.dir_x
                
                # CORREGIDO: Los límites de reinicio invertidos
                if self.estado == "rojo":
                    if self.offset_x < -2: 
                        self.offset_x = 2 
                elif self.estado == "blanco":
                    if self.offset_x > 2: 
                        self.offset_x = -2
