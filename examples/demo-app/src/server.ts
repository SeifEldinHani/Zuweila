import express from 'express';
import { ZuweilaClient } from 'zuweila-sdk';

const PORT = 3000;
const FLAG_KEY = 'new-welcome';
const REDIS_URL = process.env.ZUWEILA_REDIS_URL ?? 'redis://localhost:6379';

const app = express();
const client = ZuweilaClient.getInstance({ redis: REDIS_URL });

app.get('/api/welcome', (req, res) => {
  const userId = req.query.userId as string | undefined;

  if (client.isEnabled(FLAG_KEY, userId)) {
    res.json({
      version: 'new',
      message: 'Welcome to the new experience!',
      userId: userId ?? null,
    });
  } else {
    res.json({
      version: 'old',
      message: 'Welcome!',
      userId: userId ?? null,
    });
  }
});

client.connect().then(() => {
  app.listen(PORT, () => {
    console.log(`\nDemo app running at http://localhost:${PORT}`);
    console.log(`\nEndpoint: GET /api/welcome?userId=<id>`);
    console.log(`\nSeed the flag first:`);
    console.log(`  ZUWEILA_REDIS_URL=${REDIS_URL} node ../../zuweila-cli/dist/index.js create ${FLAG_KEY}`);
    console.log(`  ZUWEILA_REDIS_URL=${REDIS_URL} node ../../zuweila-cli/dist/index.js rollout ${FLAG_KEY} --percent 50`);
    console.log(`\nThen hit:`);
    console.log(`  curl "http://localhost:${PORT}/api/welcome?userId=user-1"`);
    console.log(`  curl "http://localhost:${PORT}/api/welcome?userId=user-2"`);
  });
});
