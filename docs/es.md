# HomeWhiz

Controle y supervise en Gladys los electrodomésticos de la app **HomeWhiz**:
lavadoras, secadoras, lavadoras secadoras, lavavajillas, hornos, placas de
cocción, frigoríficos, aires acondicionados…

## Marcas compatibles

HomeWhiz es la app del grupo Arçelik. Todos los aparatos que gestiona
funcionan con esta integración, sea cual sea la marca de su frontal:

**Beko**, **Grundig**, **Arçelik**, **Blomberg**, **Bauknecht**,
**Elektrabregenz**, **Altus**, **Arctic**, **Defy**, **Leisure**, **Flavel**,
**Lamona**, **Dawlance**, **Voltas Beko**, así como los modelos HomeWhiz de
Whirlpool, Smeg, Teka, Viking, Cylinda y V-Zug.

Si el aparato aparece en su app HomeWhiz, aparece en Gladys.

## Requisitos

- Gladys Assistant **5.1 o posterior**.
- Una **cuenta HomeWhiz** (correo + contraseña) con sus aparatos añadidos en
  la app.
- Aparatos conectados por **Wi-Fi**. Los aparatos solo Bluetooth no son
  accesibles desde Gladys (la integración se ejecuta en un contenedor sin
  radio Bluetooth): el botón **Probar la conexión** los lista, pero no se
  crean.
- Una conexión a internet: los aparatos se alcanzan a través de la nube
  HomeWhiz (integración **cloud**).

## Configuración

1. Abra la pestaña **Configuración** de la integración.
2. Introduzca el **correo** y la **contraseña** de su cuenta HomeWhiz.
   ¿Registrado con Google? Defina antes una contraseña: en la app HomeWhiz,
   _Mi cuenta_ → _Cambiar contraseña_ → _Olvidé mi contraseña_.
3. Elija el **idioma** de los nombres de funciones y de las listas de
   programas (inglés, francés, alemán o español).
4. Guarde y pulse **Probar la conexión**: el mensaje lista sus aparatos Wi-Fi
   y los que solo usan Bluetooth.
5. Abra la pestaña **Descubrimiento** y añada sus aparatos.

Para **controlar** un aparato desde Gladys (iniciar, pausar, cambiar de
programa), active su **control remoto** en el propio aparato (a menudo una
pulsación larga en la tecla Wi-Fi / mando a distancia). Sin él, el aparato
solo informa de su estado.

## Qué obtiene

Cada aparato se convierte en un dispositivo de Gladys cuyas funciones
dependen del modelo:

- **Estado** (encendido, apagado, en marcha, en pausa, inicio diferido) y un
  interruptor de **Encendido**;
- **Programa** y sus opciones (temperatura, centrifugado, nivel de secado,
  prelavado, eco, lavado rápido…), como listas o interruptores modificables;
- **Fase** del ciclo (lavado, aclarado, centrifugado, secado…);
- **Tiempo restante**, **duración** e **inicio diferido**, en minutos;
- **Avisos** (puerta abierta, sin agua, sin sal, abrillantador, filtro…), un
  interruptor cada uno más un texto resumen;
- temperaturas de los compartimentos frigorífico y congelador, temperatura
  del horno, zonas de la placa…;
- para un **aire acondicionado**: encendido, modo, temperatura objetivo,
  velocidad del ventilador, oscilación y temperatura ambiente, en la tarjeta
  de climatización estándar de Gladys.

Cada aparato se actualiza cada minuto e informa de sus cambios en tiempo
real.

## Escenas

La integración añade sus propias tarjetas al editor de escenas (categoría
**Integraciones**):

- **Ciclo de un aparato iniciado** (desencadenante) — un programa empieza.
  El nombre del programa está disponible con `{{triggerEvent.data.program}}`.
- **Ciclo de un aparato terminado** (desencadenante) — p. ej. «avísame
  cuando termine la colada». Misma variable `program`.
- **Aviso de un aparato** (desencadenante) — puerta abierta, sin agua, sin
  sal… El aviso está disponible con `{{triggerEvent.data.warning_label}}`.
- **Iniciar un programa del aparato** (acción) — elija opcionalmente un
  programa (su nombre tal y como aparece en Gladys, p. ej. `Eco 40-60`) y un
  inicio diferido en minutos, y arranque. La salida `success` indica si ha
  funcionado, `reason` por qué no (`remote_control_disabled`,
  `unknown_program`…).
- **Controlar un aparato** (acción) — iniciar, pausar, reanudar, encender o
  apagar.

Ejemplo: poner en marcha el lavavajillas por la noche con la tarifa barata y
recibir un mensaje en el móvil al terminar el ciclo.

## Panel

- Widget **Electrodomésticos** — todos los aparatos de un vistazo: estado,
  programa, fase, tiempo restante y avisos.
- Widget **Ciclo de un aparato** — un aparato (elegido en los ajustes del
  widget): tiempo restante, indicador de progreso, detalles y botones
  **Iniciar / Pausa / Reanudar / Apagar**.

## Acciones

- **Probar la conexión** — vuelve a iniciar sesión y lista sus aparatos.
- **Recargar los aparatos** — vuelve a descargar la configuración de los
  aparatos (tras añadir un aparato en la app HomeWhiz o cambiar el idioma).
  Después, actualice los dispositivos desde la pestaña **Descubrimiento**.

## Solución de problemas

- **Inicio de sesión rechazado**: compruebe el correo y la contraseña en la
  app HomeWhiz; las cuentas creadas con Google necesitan una contraseña (ver
  arriba).
- **Falta un aparato**: quizá solo usa Bluetooth (ver **Probar la
  conexión**) o aún no está en su cuenta HomeWhiz.
- **Las órdenes no hacen nada**: active el control remoto en el aparato.
- **Registros**: abra la integración en Gladys, pestaña **Registros**. La
  contraseña y los tokens nunca se escriben en los registros.
