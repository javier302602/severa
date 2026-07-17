import { createApp } from './app';
import { config } from './env';

const app = createApp();

app.listen(config.port, () => {
  console.log(`SEVERA running on http://localhost:${config.port}`);
});
