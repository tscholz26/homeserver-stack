<template>
  <div id="weather">
    <div v-if="loading">Lade Wetter...</div>
    <div v-else-if="error">{{ error }}</div>
    <div v-else>
      {{ temp }}°C - {{ desc }}
      <img class="weather-icon" :src="icon" :alt="desc" />
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      temp: null,
      desc: null,
      icon: null,
      loading: true,
      error: null,
      city: "Leipzig,de"
    };
  },
  methods: {
    async fetchWeather() {
      try {
        const res = await fetch(`/home/weather?city=${this.city}`);
        const text = await res.text();
        const data = JSON.parse(text);
        if (data.cod === 200) {
          this.temp = data.main.temp.toFixed(1);
          this.desc = data.weather[0].description;
          this.icon = `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`;
          this.loading = false;
        } else {
          this.error = "Wetter konnte nicht geladen werden.";
          this.loading = false;
        }
      } catch (err) {
        this.error = "Fehler beim Abrufen des Wetters.";
        this.loading = false;
        console.error(err);
      }
    }
  },
  mounted() {
    this.fetchWeather();
    setInterval(this.fetchWeather, 10 * 60 * 1000);
  }
};
</script>

<style>
.weather-icon {
  vertical-align: middle;
  width: 50px;
  height: 50px;
}
</style>
