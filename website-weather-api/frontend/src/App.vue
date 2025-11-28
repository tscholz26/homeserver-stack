<template>
  <div id="app">
    <h1>Willkommen auf meinem Homeserver!</h1>
    <div id="clock">{{ time }}</div>
    <Weather />
  </div>
</template>

<script>
import Weather from './components/Weather.vue';

export default {
  components: { Weather },
  data() {
    return { time: new Date().toLocaleTimeString() };
  },
  mounted() {
    setInterval(() => {
      this.time = new Date().toLocaleTimeString();
    }, 1000);
  }
}
</script>

<style>
html, body, #app {
  height: 100%;
  margin: 0;
  padding: 0;
}

body {
  background: linear-gradient(120deg, #a6c0fe, #f68084);
  font-family: Arial, sans-serif;
  color: #333;
}

#app {
  display: flex;
  flex-direction: column;
  justify-content: center; /* vertical centering */
  align-items: center;     /* horizontal centering */
  height: 100%;            /* fill full viewport */
  text-align: center;
}

#clock {
  font-size: 2em;
  margin: 20px 0;
}
</style>
