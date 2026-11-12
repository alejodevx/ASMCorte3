# Termómetro de la Tierra

Sistema multimedia web (React + Vite) que visualiza y sonifica la serie global mensual de
temperatura de NASA GISS (GISTEMP v4), de 1926 hasta hoy.

```bash
npm install
npm run dev
```

Abra la dirección que muestre Vite (normalmente `http://localhost:5173`).

## Secciones

1. **Hero / termómetro**: franjas de calentamiento (un color por año, clic para explorar ese año) y un
   termómetro SVG con la media de los últimos 12 meses frente a los umbrales de París.
2. **Entender el dato**: explica qué es una anomalía y las dos líneas base (1951–1980 NASA y
   1880–1900 preindustrial). Un selector cambia la referencia de todos los números de la página.
3. **Tu período**: selector de rango doble sobre las franjas mensuales, fechas exactas y atajos
   (incluido "Mi vida, desde…"). Gráfica interactiva con media móvil de 12 meses, zonas de París
   y ventanas de comparación. Comparación de extremos con promedios de 1, 3, 5 o 10 años.
4. **Sonificación** (Web Audio API, sintetizada): altura = anomalía (pentatónica), timbre más
   áspero al calentarse, crepitar de brasas creciente, campana al cruzar +1.5 °C y alarma en +2.0 °C.
5. **Mapa mundial por latitudes**: anomalías zonales anuales de GISTEMP (8 bandas) sobre una
   proyección Equal Earth, con animación año a año y un "coro" donde cada banda es una voz.
6. **Colombia**: estaciones colombianas de GISTEMP ubicadas en un perfil de altitud (pisos térmicos),
   detalle por estación (Cali por defecto) y comparación Colombia vs. mundo, ambas respecto a 1961–1990.
7. **Diorama de impacto biómico** (`src/components/BiomeDiorama.jsx`, `src/components/diorama/scene.js`):
   valle fluvial 3D en 360° hecho con three.js y geometría generada por código. Un deslizador 1970–2020
   convierte la anomalía de Colombia en "estrés térmico" (0–1) que baja el río, seca árboles, juncos y
   cultivo, y cambia cielo, luz, niebla, polvo, aves y sonido ambiente (`src/lib/ambient.js`).
   La temperatura es dato real; caudal, vegetación y relato son simulación ilustrativa.
   Para usar texturas propias (por ejemplo mapas de desgaste de Substance 3D Painter), asígnalas a los
   materiales en `scene.js` y mezcla con el parámetro de estrés en `apply()`.
8. **Juego "Termómetro a ciegas"**: 10 rondas con datos reales (comparar años, estimar con un termómetro
   arrastrable, reconocer el calor de oído, ordenar décadas, cambiar la línea base y comparar un mes con
   su ventana de 12 meses), con bonificación por racha y atajos de teclado.

También: navegación fija con avance de lectura y zoom arrastrando sobre la gráfica principal.

`public/data/colombia_estaciones.json` se generó a partir de
<https://data.giss.nasa.gov/gistemp/station_data_v4_globe/v4.mean_GISS_homogenized.txt.gz>
(estaciones con código `CO`; anomalía de cada estación respecto a su clima mensual 1961–1990).

## Datos

- `public/data/gistemp_global_monthly_subset.csv`: GLB.Ts+dSST (mensual, global).
- `public/data/gistemp_zonal_annual.csv`: ZonAnn.Ts+dSST (anual, bandas de latitud), descargado de
  <https://data.giss.nasa.gov/gistemp/tabledata_v4/ZonAnn.Ts+dSST.csv>.

## Recursos libres

React, Vite (MIT) · d3-geo, topojson-client (ISC) · world-atlas / Natural Earth (dominio público) ·
Fraunces, Inter, IBM Plex Mono (OFL) · sonidos sintetizados en tiempo real.
