// Guest page: load the weather strip, then send the form to the backend.

const WEATHER_URL =
  "https://api.open-meteo.com/v1/forecast" +
  "?latitude=41.39&longitude=2.17" +
  "&daily=temperature_2m_max,precipitation_probability_max" +
  "&timezone=Europe%2FMadrid&forecast_days=7";

// Show the 7-day strip. The first date in the response is today.
async function loadWeather() {
  const strip = document.getElementById("weather-strip");
  try {
    const res = await fetch(WEATHER_URL);
    if (!res.ok) throw new Error("weather request failed");
    const data = await res.json();

    const days = data.daily.time;
    const maxTemps = data.daily.temperature_2m_max;
    const rainChance = data.daily.precipitation_probability_max;

    strip.innerHTML = "";
    for (let i = 0; i < days.length; i++) {
      const card = document.createElement("div");
      card.className = "weather-day";

      const date = document.createElement("div");
      date.className = "date";
      date.textContent = formatDate(days[i]);

      const temp = document.createElement("div");
      temp.className = "temp";
      temp.textContent = Math.round(maxTemps[i]) + "\u00B0C";

      const rain = document.createElement("div");
      rain.className = "rain";
      rain.textContent = "Rain " + rainChance[i] + "%";

      card.append(date, temp, rain);
      strip.append(card);
    }
  } catch (err) {
    strip.innerHTML =
      '<p class="weather-error">The forecast is not available right now.</p>';
  }
}

// "2026-11-06" -> "Fri 6 Nov"
function formatDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// Send the three fields to the backend and show the plain-text reply.
async function handleSubmit(event) {
  event.preventDefault();

  const button = document.getElementById("send");
  const reply = document.getElementById("reply");

  const body = {
    name: document.getElementById("name").value,
    email: document.getElementById("email").value,
    message: document.getElementById("message").value,
  };

  button.disabled = true;
  reply.textContent = "Sending your message";

  try {
    const res = await fetch("/api/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "request failed");
    reply.textContent = data.reply;
  } catch (err) {
    reply.textContent =
      "We could not send your message right now. Please try again.";
  } finally {
    button.disabled = false;
  }
}

document.getElementById("message-form").addEventListener("submit", handleSubmit);
loadWeather();
