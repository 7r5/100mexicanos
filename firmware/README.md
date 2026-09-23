# 100 Mexicanos Dijeron

Juego interactivo inspirado en el popular formato de preguntas y respuestas, desarrollado para ejecutarse en hardware MicroPython con matriz de LEDs, pantalla OLED y buzzer.

## Descripción

Este proyecto simula una versión física del juego "100 Mexicanos Dijeron". El sistema presenta preguntas desde un archivo CSV, muestra un ganador en pantalla, activa luces en una matriz LED y reproduce sonidos con un buzzer. Los jugadores presionan botones para responder y el sistema identifica al ganador de la ronda.

## Características

- Matriz de LEDs 8x8 para animaciones y estado del juego
- Pantalla OLED para mostrar mensajes y ganador
- Buzzer para sonidos de inicio, victoria y reinicio
- Botones para dos equipos o jugadores: Rojo y Blanco
- Base de preguntas en formato CSV
- Lógica de rondas y reinicio automática

## Requisitos de hardware

- ESP32 o ESP8266 compatible con MicroPython (yo use ESP32 c3 oled)
- Matriz de LEDs NeoPixel 8x8
- Pantalla OLED I2C 128x64
- Buzzer pasivo o activo
- 2 botones con pull-up
- 2 LEDs indicadores

## Estructura del proyecto

```text
100mexicanos/
├── README.md
├── data.csv
├── scripts/
│   ├── main.py
│   ├── matriz.py
│   ├── pantalla.py
│   └── sonido.py
└── .git/
```

## Archivos principales

- `data.csv`: contiene las preguntas y respuestas del juego.
- `scripts/main.py`: lógica principal del juego y flujo del programa.
- `scripts/matriz.py`: control de la matriz de LEDs.
- `scripts/pantalla.py`: renderizado de texto y mensajes en la OLED.
- `scripts/sonido.py`: manejo del buzzer y tonos.

## Cómo ejecutar

1. Instala MicroPython en tu placa.
2. Copia los archivos de la carpeta `scripts` a la memoria del dispositivo.
3. Asegúrate de tener las librerías necesarias para:
   - NeoPixel
   - OLED SSD1306
4. Ejecuta `main.py` desde el intérprete de MicroPython.

Ejemplo de arranque:

```python
from main import *
```

> En algunos casos, el archivo principal se ejecuta automáticamente al iniciar la placa si está configurado como boot.py o como script principal.

## Configuración del hardware

La lógica actual del proyecto asume estos GPIOs:

- Matriz LED: GPIO 10
- Pantalla OLED:
  - SCL: GPIO 6
  - SDA: GPIO 5
- Buzzer: GPIO 2
- Botón rojo: GPIO 1
- LED rojo: GPIO 0
- Botón blanco: GPIO 4
- LED blanco: GPIO 3

Si cambias el esquema físico, deberás ajustar los pines en `main.py` y en los módulos correspondientes.

## Flujo del juego

1. Se inicia el sistema y se muestra el estado `LISTO`.
2. Se reproduce una melodía de inicio.
3. El usuario presiona un botón para comenzar la ronda.
4. Se activa el LED del equipo ganador y la matriz muestra la flecha de color correspondiente.
5. Se muestra el resultado en la pantalla OLED.
6. Después de unos segundos, la ronda termina y vuelve al estado listo.

## Datos de preguntas

El archivo `data.csv` sigue este formato:

```csv
Pregunta,Respuesta_1,Respuesta_2,Respuesta_3,Respuesta_4,Respuesta_5,Respuesta_6
```

Cada fila representa una pregunta con 6 opciones posibles.

## Notas

- El proyecto está pensado para MicroPython, no para Python estándar de escritorio.
- El módulo `machine` no existe en un entorno normal de Python, por lo que el código no se ejecutará directamente en una PC sin el firmware apropiado.
- Si deseas adaptar el proyecto a un entorno de simulación o pruebas en PC, necesitarás stubs o una emulación del hardware.

## Autor

Ricardo A y mi amigo la ia
