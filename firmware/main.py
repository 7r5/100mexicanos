from machine import Pin
import time

# Importar nuestras librerías
from matriz import MatrizJuego
from pantalla import PantallaJuego
from sonido import SonidoJuego

# ============================================================
# INICIALIZAR HARDWARE EXTERNO
# ============================================================
matriz_led = MatrizJuego(pin=10, brillo=0.004, zigzag=False)
pantalla = PantallaJuego(scl_pin=6, sda_pin=5)
buzzer = SonidoJuego(pin=2) # Inicializa el buzzer en el GPIO 9

boton_rojo = Pin(1, Pin.IN, Pin.PULL_UP)
led_rojo = Pin(0, Pin.OUT)

boton_blanco = Pin(4, Pin.IN, Pin.PULL_UP)
led_blanco = Pin(3, Pin.OUT)

led_rojo.value(0)
led_blanco.value(0)

ganador = None
inicio_ronda = 0
ultimo_parpadeo = 0
led_encendido = True
esperando_liberacion = False
ultimo_rojo = 1
ultimo_blanco = 1

# ============================================================
# INICIO
# ============================================================
pantalla.set_estado("listo")
matriz_led.set_estado("standby")

print("==============================")
print("100 MEXICANOS DIJERON")
print("LISTO")
print("==============================")

# Reproducir sonido "tu tu tiiiii" ANTES de empezar a escanear botones
buzzer.melodia_inicio()

def comenzar_ronda(nombre):
    global ganador, inicio_ronda, ultimo_parpadeo
    global led_encendido, esperando_liberacion

    ganador = nombre
    inicio_ronda = time.ticks_ms()
    ultimo_parpadeo = inicio_ronda
    led_encendido = True
    esperando_liberacion = True
    
    # SONIDO: Tono largo de victoria (1000 Hz por 700 milisegundos)
    buzzer.play_tono(1000, 700)

    pantalla.set_estado("ganador", nombre)

    if nombre == "ROJO":
        led_rojo.value(1)
        led_blanco.value(0)
        matriz_led.set_estado("rojo")
    else:
        led_rojo.value(0)
        led_blanco.value(1)
        matriz_led.set_estado("blanco")

def terminar_ronda():
    global ganador, esperando_liberacion
    ganador = None
    led_rojo.value(0)
    led_blanco.value(0)
    
    # SONIDO: Tono corto de reinicio (400 Hz por 150 milisegundos)
    buzzer.play_tono(400, 150)
    
    pantalla.set_estado("listo")
    matriz_led.set_estado("standby")
    print("RONDA TERMINADA -> LISTO")

# ============================================================
# LOOP PRINCIPAL
# ============================================================
while True:
    ahora = time.ticks_ms()
    
    # Mover animaciones y checar buzzer
    matriz_led.actualizar()
    pantalla.actualizar()
    buzzer.actualizar()

    estado_rojo = boton_rojo.value()
    estado_blanco = boton_blanco.value()

    if ganador is None and not esperando_liberacion:
        if estado_rojo == 0 and ultimo_rojo == 1:
            comenzar_ronda("ROJO")
        elif estado_blanco == 0 and ultimo_blanco == 1:
            comenzar_ronda("BLANCO")

    ultimo_rojo = estado_rojo
    ultimo_blanco = estado_blanco

    if esperando_liberacion:
        if estado_rojo == 1 and estado_blanco == 1:
            esperando_liberacion = False

    if ganador is not None:
        if time.ticks_diff(ahora, ultimo_parpadeo) >= 250:
            ultimo_parpadeo = ahora
            led_encendido = not led_encendido
            
            if ganador == "ROJO":
                led_rojo.value(1 if led_encendido else 0)
            else:
                led_blanco.value(1 if led_encendido else 0)

        if time.ticks_diff(ahora, inicio_ronda) >= 5000:
            terminar_ronda()

    time.sleep_ms(5)
