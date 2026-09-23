import machine
import neopixel

# --- Configuración ---
PIN_DATOS = 10
NUM_LEDS = 64
BRILLO = 0.30

# Inicializar la matriz
pin = machine.Pin(PIN_DATOS, machine.Pin.OUT)
matriz = neopixel.NeoPixel(pin, NUM_LEDS)

def aplicar_brillo(color):
    r, g, b = color
    return (int(r * BRILLO), int(g * BRILLO), int(b * BRILLO))

# --- Diseño de la flecha (8x8) ---
# Puedes editar los 1s y 0s para dibujar cualquier otra cosa
ICONO_FLECHA = [
    [0, 0, 0, 1, 1, 0, 0, 0],
    [0, 0, 1, 1, 1, 1, 0, 0],
    [0, 1, 1, 1, 1, 1, 1, 0],
    [1, 1, 0, 1, 1, 0, 1, 1],
    [0, 0, 0, 1, 1, 0, 0, 0],
    [0, 0, 0, 1, 1, 0, 0, 0],
    [0, 0, 0, 1, 1, 0, 0, 0],
    [0, 0, 0, 1, 1, 0, 0, 0]
]

def dibujar_icono(mapa_2d, color):
    """Lee el mapa 2D y enciende los LEDs correspondientes."""
    color_limitado = aplicar_brillo(color)
    matriz.fill((0, 0, 0))  # Apagar todo antes de dibujar
    
    for y in range(8):
        for x in range(8):
            if mapa_2d[y][x] == 1:
                # Calcular el índice lineal (0 a 63)
                indice = (y * 8) + x
                
                # Proteger contra índices fuera de rango por seguridad
                if 0 <= indice < NUM_LEDS:
                    matriz[indice] = color_limitado
                    
    matriz.write()

# --- Ejecución ---
print("Dibujando flecha en color Cian...")
# Pasamos el mapa y el color en formato RGB (R, G, B)
dibujar_icono(ICONO_FLECHA, (0, 255, 255))
