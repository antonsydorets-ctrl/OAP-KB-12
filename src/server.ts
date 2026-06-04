import { createApp } from "./app.js";
import { initDb } from "./db.js";

const port = Number(process.env.PORT ?? 3000);

await initDb();

createApp().listen(port, () => {
  console.log(`Posts board API: http://localhost:${port}`);
});
