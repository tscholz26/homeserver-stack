import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
const port = 3000;

app.use(cors());

const apiKey = process.env.OWM_API_KEY;

app.get("/home/weather", async (req, res) => {
  const city = req.query.city || "Leipzig,de";
  try {
    const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric&lang=de`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Fehler beim Abrufen des Wetters" });
  }
});

app.listen(port, "0.0.0.0", () => console.log(`Weather API listening on port ${port}`));

